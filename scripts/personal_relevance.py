from __future__ import annotations
import base64,json,os,re
from collections import Counter
from pathlib import Path
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT=Path(__file__).resolve().parents[1]
PASS=os.getenv('DASHBOARD_PASSPHRASE','')
STOP={
'こと','ため','よう','これ','それ','もの','ある','する','いる','から','まで','として','です','ます','できる','なる','ない','あり','また','さらに','必要','場合','自分','仕事','商品','顧客','市場','日本','今回','記事','利用','情報','結果','方法','企業','ユーザー','ブランド','マーケティング','the','and','for','with','that','this','from'
}
TOKEN_RE=re.compile(r'[A-Za-z][A-Za-z0-9+._/-]{2,}|[一-龥ァ-ヶー]{2,12}|[ぁ-ん]{3,12}')
QUALITY_RE=re.compile(r'独自調査|自社調査|実証|実験|データ|統計|ケース|事例|検証|フレームワーク|手法|方法|プロセス|比較|効果測定',re.I)
CONTRADICTION_RE=re.compile(r'限界|誤解|間違|逆効果|反証|再考|見直|実は|ではない|むしろ|落とし穴|失敗|反対|vs\.?|比較',re.I)
PRACTICAL_RE=re.compile(r'実践|運用|改善|設計|KPI|GTM|Amazon|楽天|EC|CVR|広告|価格|ポジショニング|想起|CEP|AI検索|AEO|消費者|購買|マネジメント',re.I)

def _b64(s):return base64.b64decode(s)
def decrypt(path:Path):
    if not PASS or not path.exists():return None
    try:
        env=json.loads(path.read_text(encoding='utf-8'));salt=_b64(env['salt']);iv=_b64(env['iv']);it=int(env.get('iterations',600000))
        kdf=PBKDF2HMAC(algorithm=hashes.SHA256(),length=32,salt=salt,iterations=it);key=kdf.derive(PASS.encode());raw=AESGCM(key).decrypt(iv,_b64(env['ciphertext']),None);return json.loads(raw)
    except Exception:return None

def tokens(text):
    out=[]
    for t in TOKEN_RE.findall((text or '').lower()):
        t=t.strip('._/-')
        if len(t)>=2 and t not in STOP:out.append(t)
    return out

def item_text(x):
    if not isinstance(x,dict):return ''
    comments=' '.join(c.get('text','') for c in x.get('comments',[]) if isinstance(c,dict))
    return ' '.join(str(x.get(k,'') or '') for k in ('title','summary','page_body','text','content','memo','rule','core','when','decision_rule'))+' '+comments

def rule_text(r):
    if not isinstance(r,dict):return ''
    return ' '.join([str(r.get('domain','')),str(r.get('title','')),str(r.get('decision_rule','')),str(r.get('when','')),' '.join(r.get('questions',[]) or []),' '.join(r.get('steps',[]) or []),' '.join(r.get('metrics',[]) or []),' '.join(r.get('traps',[]) or []),' '.join(r.get('tensions',[]) or []),' '.join(r.get('keywords',[]) or [])])

def flatten_strings(obj,limit=600):
    out=[]
    def walk(x):
        if len(out)>=limit:return
        if isinstance(x,str) and len(x.strip())>8:out.append(x.strip())
        elif isinstance(x,dict):
            for v in x.values():walk(v)
        elif isinstance(x,list):
            for v in x:walk(v)
    walk(obj);return out

def build_profile():
    work=decrypt(ROOT/'data'/'work-system.enc.json') or {}
    know=decrypt(ROOT/'data'/'knowledge.enc.json') or {}
    system=decrypt(ROOT/'data'/'system-model.enc.json') or {}
    work_chunks=flatten_strings(work,900)
    knowledge_items=know.get('items',[]) if isinstance(know,dict) else []
    system_rules=system.get('rules',[]) if isinstance(system,dict) else []
    work_counts=Counter(tokens(' '.join(work_chunks)))
    know_counts=Counter()
    for x in knowledge_items:know_counts.update(set(tokens(item_text(x))))
    weighted={}
    for term,n in work_counts.items():
        if n>=2:weighted[term]=min(3.0,0.7+n*0.16)
    for term,n in know_counts.items():
        if n>=2:weighted[term]=max(weighted.get(term,0),min(1.5,0.25+n*0.035))
    rule_by_id={}
    for r in system_rules:
        rule_by_id[r.get('id')]=r
        for term in r.get('keywords',[]) or []:
            weighted[term.lower()]=max(weighted.get(term.lower(),0),1.7 if r.get('maturity') in ('validated','conditional') else 1.35)
    gap_terms=Counter();gap_rule_ids=set()
    for g in system.get('gaps',[]) if isinstance(system,dict) else []:
        rid=g.get('rule_id');gap_rule_ids.add(rid);r=rule_by_id.get(rid,{})
        for term in r.get('keywords',[]) or []:gap_terms[term.lower()]+=max(1,int(g.get('priority',1)))
    knowledge_index=[(x,set(tokens(item_text(x))),set(tokens((x.get('title','')+' '+x.get('summary',''))))) for x in knowledge_items]
    rule_index=[(r,set(tokens(rule_text(r))),set(tokens((r.get('title','')+' '+r.get('domain',''))))) for r in system_rules]
    return {'work':work,'knowledge':know,'system':system,'weights':weighted,'knowledge_counts':know_counts,'gap_terms':gap_terms,'gap_rule_ids':gap_rule_ids,'knowledge_index':knowledge_index,'rule_index':rule_index,'available':bool(work or know or system)}

PROFILE=build_profile()

def _rank_specific(text,index,limit=3):
    ats=set(tokens(text));weights=PROFILE['weights'];rows=[]
    if not ats:return rows
    for obj,body,head in index:
        shared=ats & body
        if not shared:continue
        score=0.0
        for t in shared:
            score+=0.55+min(1.3,weights.get(t,0)*.35)
            if t in head:score+=.55
        if score>=1.5:rows.append((score,obj,sorted(shared,key=lambda t:(-weights.get(t,0),-len(t)))[:6]))
    rows.sort(key=lambda x:-x[0]);return rows[:limit]

def score_text(text:str):
    if not PROFILE['available']:return 0.0,'',{}
    ts=set(tokens(text));weights=PROFILE['weights'];hits=sorted(((weights[t],t) for t in ts if t in weights),reverse=True)
    fit=sum(w for w,_ in hits[:8]);fit_bonus=min(1.05,fit/9.5)
    known=[PROFILE['knowledge_counts'].get(t,0) for _,t in hits[:8]]
    avg_known=sum(known)/len(known) if known else 0
    quality=bool(QUALITY_RE.search(text or ''));contradiction=bool(CONTRADICTION_RE.search(text or ''));practical=bool(PRACTICAL_RE.search(text or ''))
    km=_rank_specific(text,PROFILE['knowledge_index'],3);rm=_rank_specific(text,PROFILE['rule_index'],3)
    strongest_k=km[0][0] if km else 0;strongest_r=rm[0][0] if rm else 0
    matched_gap_rules=[r for s,r,_ in rm if r.get('id') in PROFILE['gap_rule_ids']]
    repetition_penalty=0.0
    if (avg_known>=10 or strongest_k>=4.0) and not quality and not contradiction:
        repetition_penalty=min(.95,.25+max(0,avg_known-10)*.02+max(0,strongest_k-4)*.08)
    gap_matches=[t for t in ts if PROFILE['gap_terms'].get(t,0)>0]
    explicit_gap_bonus=min(.55,sum(min(PROFILE['gap_terms'][t],4) for t in gap_matches[:5])*.055)
    rule_gap_bonus=.28 if matched_gap_rules else 0.0
    sparse_gap_bonus=.22 if hits and avg_known<=3 and fit_bonus>=.25 and strongest_k<2.5 else 0.0
    gap_bonus=min(.7,explicit_gap_bonus+rule_gap_bonus+sparse_gap_bonus)
    evidence_bonus=.40 if quality and strongest_r>=2.0 else (.24 if quality and fit_bonus>=.2 else 0)
    boundary_bonus=.58 if contradiction and strongest_r>=2.0 else (.40 if contradiction and fit_bonus>=.2 else 0)
    practical_bonus=.30 if practical and strongest_r>=2.0 else (.18 if practical and fit_bonus>=.25 else 0)
    bonus=max(-.95,min(1.95,fit_bonus+gap_bonus+evidence_bonus+boundary_bonus+practical_bonus-repetition_penalty))
    labels=[]
    if boundary_bonus:labels.append('可能修正现有规则/补充边界')
    if matched_gap_rules or explicit_gap_bonus:labels.append('命中个人体系待验证/知识空白')
    elif sparse_gap_bonus:labels.append('补足当前知识空白')
    if evidence_bonus:labels.append('为已有判断增加数据/案例证据')
    if practical_bonus:labels.append('可直接用于工作场景')
    if repetition_penalty:labels.append('与既有Knowledge重复度较高')
    if not labels and (fit_bonus>0 or strongest_k or strongest_r):labels.append('与个人工作体系相关')
    diag={'matched_terms':[t for _,t in hits[:8]],'gap_terms':gap_matches[:6],'avg_existing_mentions':round(avg_known,1),'fit_bonus':round(fit_bonus,2),'gap_bonus':round(gap_bonus,2),'evidence_bonus':evidence_bonus,'boundary_bonus':boundary_bonus,'repetition_penalty':round(repetition_penalty,2),'knowledge_match_strength':round(strongest_k,2),'rule_match_strength':round(strongest_r,2),'matched_knowledge_ids':[x.get('id') for _,x,_ in km if x.get('id')][:3],'matched_rule_ids':[x.get('id') for _,x,_ in rm if x.get('id')][:3]}
    return round(bonus,2),'；'.join(labels),diag

def prompt_context(max_chars=6000):
    if not PROFILE['available']:return '个人知识上下文不可用。'
    weights=sorted(PROFILE['weights'].items(),key=lambda x:x[1],reverse=True)[:42]
    terms='、'.join(t for t,_ in weights)
    gaps=sorted(PROFILE['gap_terms'].items(),key=lambda x:x[1],reverse=True)[:24]
    gap_text='、'.join(t for t,_ in gaps)
    return ('个人工作体系高权重概念：'+terms+'。\n当前体系中需要补证据/边界/验证的概念：'+(gap_text or '暂无显著项')+'。\n筛选原则：相关性不是目的；优先推荐能补强证据、补足知识空白、提供反例/边界条件、或能直接用于实际决策的内容。若只是重复已有常识且没有新数据/方法/反例，应降级。')[:max_chars]
