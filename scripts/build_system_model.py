#!/usr/bin/env python3
from __future__ import annotations
import base64, hashlib, json, os, re, secrets, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT=Path(__file__).resolve().parents[1]
PASS=os.getenv('DASHBOARD_PASSPHRASE','')
OPENAI_API_KEY=os.getenv('OPENAI_API_KEY','').strip()
OPENAI_MODEL=os.getenv('OPENAI_MODEL','').strip()
WORK_ENC=ROOT/'data'/'work-system.enc.json'
KNOW_ENC=ROOT/'data'/'knowledge.enc.json'
OUT_META=ROOT/'data'/'system-model.json'
OUT_ENC=ROOT/'data'/'system-model.enc.json'
PBKDF2_ITERATIONS=600_000

STOP={'こと','ため','よう','これ','それ','もの','ある','する','いる','から','まで','として','です','ます','できる','なる','ない','あり','また','さらに','必要','場合','自分','仕事','商品','顧客','市場','日本','今回','記事','利用','情報','結果','方法','企業','ユーザー','the','and','for','with','that','this','from'}
TOKEN_RE=re.compile(r'[A-Za-z][A-Za-z0-9+._/-]{2,}|[一-龥ァ-ヶー]{2,}|[ぁ-ん]{3,}')

GENERIC_QUESTIONS={
 '判断与问题定义':['真正要改变的业务结果是什么？','目前事实、假设和意见分别是什么？','如果结果没发生，最可能是哪一个参数出了问题？'],
 '市场 / GTM / Positioning':['目标市场的替代方案是什么？','这个市场为什么现在值得进入？','我们真正有优势的场景、人群或渠道是什么？'],
 '消费者 / 品牌 / CEP':['消费者在什么情境下会进入这个品类？','要改变的是想起、考虑、购买还是复购？','现有判断来自真实行为还是口头态度？'],
 '商品 / 新品上市':['这是成熟需求还是新需求？','首发期最需要验证的假设是什么？','什么指标决定继续、调整或停止投入？'],
 'EC / Amazon / 流通':['问题发生在流量、转化、客单、库存还是复购？','站内与站外流量分别发生了什么？','当前动作是在制造需求还是承接需求？'],
 '广告 / PR / 内容':['本次媒体任务是触达、想起、承接还是成交？','效果问题来自渠道、创意、人群还是承接页？','短期指标与长期业务指标是否冲突？'],
 '数据 / KPI / 测量':['最终业务结果如何拆成可观察参数？','领先指标与结果指标分别是什么？','当前比较是否在相同条件下进行？'],
 '执行 / 管理 / Stakeholder':['谁真正拥有决策权和执行权？','每个相关方的利益和约束是什么？','下一步是否有明确负责人、截止时间和验收标准？'],
 'AI / 工作效率':['AI是在替代步骤、增强判断还是改变用户行为？','错误成本和人工复核点在哪里？','是否真的减少总工作量，而不是把工作转移到检查环节？'],
}

def b64d(s): return base64.b64decode(s)
def decrypt(path:Path):
    if not PASS or not path.exists(): return None
    env=json.loads(path.read_text(encoding='utf-8'))
    salt,iv=b64d(env['salt']),b64d(env['iv']); it=int(env.get('iterations',600000))
    kdf=PBKDF2HMAC(algorithm=hashes.SHA256(),length=32,salt=salt,iterations=it)
    key=kdf.derive(PASS.encode('utf-8'))
    return json.loads(AESGCM(key).decrypt(iv,b64d(env['ciphertext']),None).decode('utf-8'))

def encrypt(payload):
    if len(PASS)<14: raise RuntimeError('DASHBOARD_PASSPHRASE must be at least 14 characters.')
    salt,iv=secrets.token_bytes(16),secrets.token_bytes(12)
    kdf=PBKDF2HMAC(algorithm=hashes.SHA256(),length=32,salt=salt,iterations=PBKDF2_ITERATIONS)
    key=kdf.derive(PASS.encode('utf-8'))
    raw=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    ct=AESGCM(key).encrypt(iv,raw,None); b=lambda x:base64.b64encode(x).decode('ascii')
    return {'version':2,'algorithm':'AES-256-GCM','kdf':'PBKDF2-SHA256','iterations':PBKDF2_ITERATIONS,'salt':b(salt),'iv':b(iv),'ciphertext':b(ct)}

def tokens(text):
    out=[]
    for t in TOKEN_RE.findall((text or '').lower()):
        t=t.strip('._/-')
        if len(t)>=2 and t not in STOP: out.append(t)
    return out

def item_text(x):
    comments=' '.join(c.get('text','') for c in x.get('comments',[]) if isinstance(c,dict))
    return ' '.join(str(x.get(k,'') or '') for k in ('title','summary','page_body'))+' '+comments+' '+' '.join(x.get('topics',[]) or [])

def rule_text(r):
    return ' '.join([str(r.get('title','')),str(r.get('principle','') or r.get('detail','')),str(r.get('when','')),' '.join(r.get('steps',[]) or []),' '.join(r.get('metrics',[]) or []),' '.join(r.get('traps',[]) or []),' '.join(r.get('tensions',[]) or [])])

def infer_type(r):
    text=rule_text(r)
    if r.get('steps') and len(r.get('steps',[]))>=3: return 'playbook'
    if re.search(r'分解|拆|軸|フレーム|式|パラメータ|ステップ|段階|分類|マトリクス',text,re.I): return 'framework'
    if re.search(r'避け|注意|禁止|しない|失敗|落とし穴|前提|確認|基準|守る',text,re.I): return 'guardrail'
    return 'principle'

def normalized_base_rules(work):
    rules=work.get('rules') or []
    if rules:
        return rules[:80]
    out=[]
    for c in (work.get('candidate_principles') or [])[:160]:
        out.append({'id':c.get('id'),'title':c.get('title'),'principle':c.get('detail'),'when':'','steps':[],'metrics':[],'traps':[],'tensions':[],
                    'domain':((c.get('domains') or [{}])[0].get('name') or '其他'),'evidence_ids':c.get('evidence_ids',[]),'confidence':'low'})
    return out

def similarity(rule,article):
    rt=Counter(tokens(rule_text(rule))); at=Counter(tokens(item_text(article)))
    if not rt or not at:return (0,[])
    hits=[];score=0.0
    for term,n in rt.items():
        if term in at:
            w=1.0 + min(len(term),8)*.12
            score+=w*min(n,2);hits.append(term)
    # title/summary overlap is more intentional than body-only overlap
    head=(str(article.get('title',''))+' '+str(article.get('summary',''))).lower()
    for term in set(hits):
        if term in head:score+=.75
    return score,sorted(set(hits),key=lambda x:(-len(x),x))

def match_notion(rule,items,limit=6):
    rows=[]
    for a in items:
        score,hits=similarity(rule,a)
        if score>=2.6:rows.append((score,hits,a))
    rows.sort(key=lambda x:(-x[0],x[2].get('date','')))
    return [{'id':a.get('id'),'title':a.get('title'),'category':a.get('category'),'date':a.get('date'),'score':round(s,2),'hits':h[:7],
             'has_comment':bool(a.get('comments')),'summary':(a.get('summary') or '')[:700]} for s,h,a in rows[:limit]]

def maturity(source_kinds,notion_evidence,tensions):
    diversity=len(set(source_kinds)); n=len(notion_evidence); comment=sum(1 for x in notion_evidence if x.get('has_comment'))
    if tensions and (diversity+n)>=3:return 'conditional'
    if diversity>=2 and n>=2:return 'validated'
    if diversity>=2 or n>=2 or comment>=1:return 'observed'
    return 'hypothesis'

def maturity_reason(level,source_kinds,notion_evidence,tensions):
    labels={'hypothesis':'假设','observed':'已有观察','validated':'多来源验证','conditional':'条件成立'}
    parts=[labels[level],f"私人来源{len(set(source_kinds))}类",f"Notion证据{len(notion_evidence)}条"]
    if tensions:parts.append(f"存在{len(tensions)}个冲突/边界")
    return ' · '.join(parts)

def enrich_deterministic(work,know):
    note_map={n.get('id'):n for n in work.get('notes',[]) if n.get('id')}
    items=know.get('items',[]) or []
    out=[]
    for r in normalized_base_rules(work):
        evid=[note_map[x] for x in r.get('evidence_ids',[]) if x in note_map]
        source_kinds=[x.get('source_kind','unknown') for x in evid]
        ne=match_notion(r,items)
        level=maturity(source_kinds,ne,r.get('tensions') or [])
        domain=r.get('domain') or ((r.get('domains') or [{}])[0].get('name')) or '其他'
        rid=r.get('id') or 's-'+hashlib.sha1((domain+str(r.get('title'))).encode()).hexdigest()[:14]
        keywords=list(dict.fromkeys(tokens(rule_text(r))))[:20]
        out.append({
            'id':rid,'type':infer_type(r),'domain':domain,'title':r.get('title') or 'Untitled',
            'decision_rule':r.get('principle') or r.get('detail') or '',
            'when':r.get('when') or '遇到与该规则同类的问题时，先核对前提条件。',
            'not_when':[],
            'questions':GENERIC_QUESTIONS.get(domain,GENERIC_QUESTIONS['判断与问题定义'])[:3],
            'steps':r.get('steps') or [],'metrics':r.get('metrics') or [],'traps':r.get('traps') or [],
            'tensions':r.get('tensions') or [],'maturity':level,'maturity_reason':maturity_reason(level,source_kinds,ne,r.get('tensions') or []),
            'private_evidence_ids':r.get('evidence_ids') or [],'private_source_kinds':sorted(set(source_kinds)),
            'notion_evidence':ne,'keywords':keywords,'status':'active','last_reviewed':datetime.now(timezone.utc).date().isoformat()
        })
    return out

def llm_refine(rules,work,know):
    if not OPENAI_API_KEY or not OPENAI_MODEL:return rules,'deterministic'
    try:
        from openai import OpenAI
        client=OpenAI(api_key=OPENAI_API_KEY)
        note_map={n.get('id'):n for n in work.get('notes',[]) if n.get('id')}
        groups=defaultdict(list)
        for r in rules:groups[r['domain']].append(r)
        refined=[]
        schema={'type':'object','properties':{'rules':{'type':'array','maxItems':12,'items':{'type':'object','properties':{
            'id':{'type':'string'},'type':{'type':'string','enum':['principle','framework','playbook','guardrail']},
            'title':{'type':'string'},'decision_rule':{'type':'string'},'when':{'type':'string'},
            'not_when':{'type':'array','items':{'type':'string'},'maxItems':4},'questions':{'type':'array','items':{'type':'string'},'maxItems':5},
            'steps':{'type':'array','items':{'type':'string'},'maxItems':7},'metrics':{'type':'array','items':{'type':'string'},'maxItems':7},
            'traps':{'type':'array','items':{'type':'string'},'maxItems':6},'tensions':{'type':'array','items':{'type':'string'},'maxItems':5}
        },'required':['id','type','title','decision_rule','when','not_when','questions','steps','metrics','traps','tensions'],'additionalProperties':False}}},'required':['rules'],'additionalProperties':False}
        for domain,rs in groups.items():
            for start in range(0,len(rs),8):
                batch=rs[start:start+8];context=[]
                for r in batch:
                    pe=[]
                    for eid in r.get('private_evidence_ids',[])[:6]:
                        n=note_map.get(eid)
                        if n:pe.append(f"[{eid}] {n.get('source_label')} / {n.get('section')}: {(n.get('text') or '')[:650]}")
                    ne=[]
                    for x in r.get('notion_evidence',[])[:4]:
                        ne.append(f"[{x.get('id')}] Notion {x.get('category')}: {x.get('title')} | {x.get('summary','')[:500]}")
                    context.append({'rule':{k:r.get(k) for k in ('id','type','title','decision_rule','when','steps','metrics','traps','tensions')},'private':pe,'notion':ne})
                prompt=f'''你正在维护一个人的长期工作操作系统。领域：{domain}。
目标不是总结资料，而是把规则修成“实际工作时可调用”的形态。

规则：
1. 保留每条 rule 的 id，不新增不存在的证据或具体数字。
2. decision_rule 必须是清晰的判断句，而不是泛泛建议。
3. when 写适用场景；not_when 写不适用/容易误用的边界。
4. questions 是实际决策前应该先问自己的诊断问题。
5. steps 只有在资料支持时才填写；原则型知识可以为空。
6. metrics 只放能验证规则是否成立的指标；资料没有依据可以为空。
7. 如果私人经验、书本理论、Notion证据互相冲突，不要强行统一，写进 tensions。
8. type 必须在 principle / framework / playbook / guardrail 中选择：原则=跨场景判断；框架=拆问题；Playbook=具体操作流程；Guardrail=约束/避免错误。
9. 不要把多条条件不同的规则硬合并。

输入：{json.dumps(context,ensure_ascii=False)}'''
                resp=client.responses.create(model=OPENAI_MODEL,input=prompt,text={'format':{'type':'json_schema','name':'system_rules','schema':schema,'strict':True}},store=False)
                data=json.loads(resp.output_text);mapped={x['id']:x for x in data.get('rules',[])}
                for r in batch:
                    x=mapped.get(r['id'])
                    if x:
                        for k in ('type','title','decision_rule','when','not_when','questions','steps','metrics','traps','tensions'):r[k]=x[k]
                        # re-evaluate maturity if LLM surfaced a tension
                        r['maturity']=maturity(r['private_source_kinds'],r['notion_evidence'],r['tensions'])
                        r['maturity_reason']=maturity_reason(r['maturity'],r['private_source_kinds'],r['notion_evidence'],r['tensions'])
                    refined.append(r)
        return refined,'openai'
    except Exception as e:
        print('System model LLM refine fallback:',e,file=sys.stderr);return rules,'deterministic'

def build_gaps(rules):
    rows=[]
    for r in rules:
        reasons=[]
        if r['maturity']=='hypothesis':reasons.append('证据仍少')
        if r['maturity']=='conditional':reasons.append('存在边界/冲突')
        if not r.get('notion_evidence'):reasons.append('缺少外部证据')
        if len(r.get('private_source_kinds',[]))<2:reasons.append('私人来源单一')
        if reasons:rows.append({'rule_id':r['id'],'title':r['title'],'domain':r['domain'],'reasons':reasons,'priority':len(reasons)+(2 if r['maturity']=='conditional' else 0)})
    return sorted(rows,key=lambda x:(-x['priority'],x['domain']))[:40]

def main():
    work=decrypt(WORK_ENC); know=decrypt(KNOW_ENC)
    if not work:raise RuntimeError('Encrypted Google Work System is missing or cannot be decrypted.')
    if not know:raise RuntimeError('Encrypted Notion Knowledge is missing or cannot be decrypted.')
    rules=enrich_deterministic(work,know);rules,mode=llm_refine(rules,work,know)
    type_counts=Counter(r['type'] for r in rules); maturity_counts=Counter(r['maturity'] for r in rules);domain_counts=Counter(r['domain'] for r in rules)
    gaps=build_gaps(rules);now=datetime.now(timezone.utc).isoformat()
    full={'meta':{'snapshot_at':now,'schema_version':1,'encrypted':True,'synthesis':mode,'work_snapshot':work.get('meta',{}).get('snapshot_at'),'knowledge_snapshot':know.get('meta',{}).get('snapshot_at')},
          'rules':rules,'gaps':gaps,'type_counts':dict(type_counts),'maturity_counts':dict(maturity_counts),'domain_counts':dict(domain_counts)}
    public={'meta':{'snapshot_at':now,'schema_version':1,'encrypted_full_data':True,'rule_count':len(rules),'synthesis':mode},
            'counts':{'types':dict(type_counts),'maturity':dict(maturity_counts)},'gap_count':len(gaps)}
    OUT_META.write_text(json.dumps(public,ensure_ascii=False,indent=2),encoding='utf-8')
    OUT_ENC.write_text(json.dumps(encrypt(full),ensure_ascii=False),encoding='utf-8')
    print(f"Built unified system model: {len(rules)} rules, {len(gaps)} gaps, mode={mode}")
    return 0
if __name__=='__main__':raise SystemExit(main())
