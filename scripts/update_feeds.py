from __future__ import annotations
import os,re,json,hashlib,html,time
from pathlib import Path
from datetime import datetime,timezone,date
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
import requests,feedparser
from bs4 import BeautifulSoup
from dateutil import parser as dtparser

ROOT=Path(__file__).resolve().parents[1]
SOURCES=json.loads((ROOT/'config'/'sources.json').read_text(encoding='utf-8'))
ART_PATH=ROOT/'data'/'articles.json'; STATUS_PATH=ROOT/'data'/'source_status.json'
TRACKING_START=date.fromisoformat('2026-08-10')
UA='Mozilla/5.0 (compatible; PersonalReadingDashboard/1.0)'
KEYWORDS={
 'consumer':['消費者','生活者','顧客','購買','購入','行動','インサイト','ユーザー','CX','NPS','VOC'],
 'research':['調査','研究','データ','統計','実証','アンケート','分析','白書','レポート'],
 'ai':['AI','生成AI','人工知能','LLM','AIO','GEO','ChatGPT','エージェント'],
 'ec':['EC','eコマース','通販','Amazon','楽天','モール','D2C','小売','リテール','CVR','コンバージョン'],
 'marketing':['マーケティング','ブランド','広告','CRM','SEO','検索','コンテンツ','販促','UGC','SNS'],
 'strategy':['戦略','GTM','市場','成長','価格','チャネル','事業','収益','シェア','競争','ポジショニング'],
 'method':['手法','方法','フレームワーク','検証','改善','運用','実践','ケース','事例']}
CONCEPT_TERMS=[
 '生成AI','人工知能','AIエージェント','AI','AIO','GEO','LLM','ChatGPT','UGC','SNS','SEO','CRM','NPS','VOC','CX',
 '消費者','生活者','顧客','ユーザー','購買行動','購買','購入','インサイト','ブランド','広告','コンテンツ',
 'EC','eコマース','通販','Amazon','楽天','D2C','小売','リテール','CVR','コンバージョン','価格','チャネル',
 'GTM','市場','成長','競争','シェア','ポジショニング','調査','研究','データ','統計','実証','分析','事例','ケース','フレームワーク'
]
PENALTIES=['発売','予約開始','セール','キャンペーン開催','プレゼント','イベント開催','登壇','人事','採用','芸能','ゲーム発売','本日発売']
PRIORITY={'high':1.0,'medium':0.45,'low':-0.25}

def clean(x):
    if not x:return ''
    return re.sub(r'\s+',' ',BeautifulSoup(html.unescape(str(x)),'html.parser').get_text(' ',strip=True)).strip()

def norm_url(u):
    if not u:return ''
    try:
        p=urlsplit(u); q=[(k,v) for k,v in parse_qsl(p.query,keep_blank_values=True) if not (k.lower().startswith('utm_') or k.lower() in {'ref','source','i_cid','fbclid','gclid'})]
        return urlunsplit((p.scheme.lower() or 'https',p.netloc.lower(),p.path.rstrip('/'),urlencode(q),''))
    except Exception:return u

def aid(url,title):return hashlib.sha1((norm_url(url) or title.strip().lower()).encode('utf-8','ignore')).hexdigest()[:18]

def parse_date(e):
    for k in ('published_parsed','updated_parsed','created_parsed'):
        x=getattr(e,k,None)
        if x:return datetime(*x[:6],tzinfo=timezone.utc)
    for k in ('published','updated','created'):
        v=getattr(e,k,None)
        if v:
            try:return dtparser.parse(v).astimezone(timezone.utc)
            except Exception:pass
    return None

def tags(text):
    low=text.lower(); return [t for t,words in KEYWORDS.items() if any(w.lower() in low for w in words)]

def concepts(text):
    low=(text or '').lower(); out=[]
    for term in CONCEPT_TERMS:
        if term.lower() in low and term not in out:out.append(term)
    for token in re.findall(r'\b[A-Za-z][A-Za-z0-9+.-]{1,14}\b',text or ''):
        if token.lower() not in {'the','and','for','with','from','this','that','into','news','japan','online','marketing','business'} and token not in out:
            out.append(token)
    return out[:12]

def heuristic(src,title,summary,content=''):
    full=' '.join([title,summary,content[:5000]])
    ts=tags(full); score=5+PRIORITY.get(src.get('priority','medium'),0)
    for t in ts:score+={'consumer':.8,'research':.75,'ai':.7,'ec':.65,'marketing':.5,'strategy':.85,'method':.55}.get(t,.3)
    if len(ts)>=3:score+=.35
    if any(p in title for p in PENALTIES):score-=1.2
    if src.get('priority')=='low' and not any(t in ts for t in ('consumer','research','ai','ec','strategy')):score-=1
    score=max(0,min(10,score)); notion=max(0,min(10,score-(.9 if not any(t in ts for t in ('research','method','strategy')) else .1)))
    parts=[]
    for t,msg in [('research','包含调查/数据'),('consumer','涉及消费者/用户行为'),('strategy','有市场或战略判断价值'),('ai','涉及AI实际影响'),('ec','与EC/零售直接相关'),('method','可能形成可复用方法')]:
        if t in ts:parts.append(msg)
    return score,notion,ts,concepts(full),'；'.join(parts) if parts else '与核心主题相关度有限，主要作为信息雷达保留'

def fetch_text(url):
    try:
        r=requests.get(url,headers={'User-Agent':UA},timeout=12,allow_redirects=True)
        if r.status_code!=200:return '',False,f'HTTP {r.status_code}'
        if 'html' not in r.headers.get('content-type',''):return '',False,'非HTML正文'
        soup=BeautifulSoup(r.text,'html.parser')
        for x in soup(['script','style','nav','header','footer','aside']):x.decompose()
        text=clean(' '.join(p.get_text(' ',strip=True) for p in soup.select('article p, main p, .article p, .entry-content p')))
        return text[:12000],bool(text),None if text else '未抽取到正文'
    except Exception as e:return '',False,str(e)[:150]

def llm_screen(a):
    key=os.getenv('OPENAI_API_KEY'); model=os.getenv('OPENAI_MODEL')
    if not key or not model:return None
    try:
        from openai import OpenAI
        client=OpenAI(api_key=key)
        schema={'type':'object','properties':{
            'grade':{'type':'string','enum':['S','A','B','C']},
            'reading_score':{'type':'number','minimum':0,'maximum':10},
            'notion_score':{'type':'number','minimum':0,'maximum':10},
            'reason':{'type':'string'},
            'tags':{'type':'array','items':{'type':'string'},'maxItems':6},
            'concepts':{'type':'array','items':{'type':'string'},'minItems':2,'maxItems':8}
        },'required':['grade','reading_score','notion_score','reason','tags','concepts'],'additionalProperties':False}
        prompt=f'''你替一名长期从事日本EC/Marketing、目前关注日本GTM、消费者行为、AI实际应用的人筛选每周文章。核心标准：认知增量、决策价值、实证/原始数据、可复用框架、日本市场/GTM/消费者/营销/EC/AI工作流相关。降低泛趋势、基础知识、纯PR、重复新闻、普通新品信息。S=必看，A=值得看，B=摘要即可，C=跳过。来源：{a['source']} 标题：{a['title']} 摘要：{a.get('summary','')} 正文可见片段：{a.get('content_excerpt','')} 仅根据可见信息判断。concepts 请输出文章本身的具体内容概念，用于用户反馈学习，例如“生成AI”“AIO”“購買行動”“NPS”“CX”“ブランド検索”“Amazon価格戦略”，不要输出媒体名，也不要只输出过宽泛的“strategy/consumer/research”。'''
        resp=client.responses.create(model=model,input=prompt,text={'format':{'type':'json_schema','name':'screening','schema':schema,'strict':True}},store=False)
        return json.loads(resp.output_text)
    except Exception as e:
        print('LLM fallback:',e); return None

def fetch_feed(src):
    r=requests.get(src['url'],headers={'User-Agent':UA},timeout=15,allow_redirects=True); r.raise_for_status(); return feedparser.parse(r.content)

def fetch_xtrend(src):
    r=requests.get(src['url'],headers={'User-Agent':UA},timeout=15,allow_redirects=True); r.raise_for_status(); soup=BeautifulSoup(r.text,'html.parser'); rows=[]; seen=set()
    for a in soup.find_all('a',href=True):
        href=a['href']; title=clean(a.get_text(' ',strip=True))
        if len(title)<12 or '/atcl/' not in href:continue
        if href.startswith('/'):href='https://xtrend.nikkei.com'+href
        href=norm_url(href)
        if href in seen:continue
        seen.add(href); rows.append((title,href))
    return rows[:80]

def main():
    old=json.loads(ART_PATH.read_text(encoding='utf-8')) if ART_PATH.exists() else {'articles':[]}; existing={a['id']:a for a in old.get('articles',[])}
    run=[]; raw=0; deep=0; new=[]
    for src in SOURCES:
        rec={'name':src['name'],'status':'pending','new_count':0,'error':None}
        try:
            if src.get('type')=='html_listing':
                iterable=[]
                for title,url in fetch_xtrend(src):iterable.append(type('E',(),{'title':title,'link':url,'summary':'','published_parsed':None,'updated_parsed':None,'created_parsed':None})())
            else:iterable=fetch_feed(src).entries
            n=0
            for e in iterable:
                title=clean(getattr(e,'title','')); url=norm_url(getattr(e,'link',''))
                if not title or not url:continue
                dt=parse_date(e)
                if dt and dt.date()<TRACKING_START:continue
                i=aid(url,title)
                if i in existing:continue
                summary=clean(getattr(e,'summary','') or getattr(e,'description','')); n+=1; raw+=1
                sc,no,ts,cs,reason=heuristic(src,title,summary); content=''; checked=False; note=''
                if sc>=6.7 and src.get('type')!='html_listing':
                    content,checked,err=fetch_text(url)
                    if checked:deep+=1; sc,no,ts,cs,reason=heuristic(src,title,summary,content)
                    elif err:note=f'正文未自动读取：{err}'
                elif src.get('type')=='html_listing':note='XTrend 仅基于公开新着页标题/公开信息判断；未使用会员登录正文。'
                a={'id':i,'source':src['name'],'category':src['category'],'url':url,'title':title,'published':dt.isoformat() if dt else None,'first_seen':datetime.now(timezone.utc).isoformat(),'summary':summary[:1200],'content_checked':checked,'content_excerpt':content[:5000] if checked else '','base_score':round(sc,2),'reading_score':round(sc,2),'notion_score':round(no,2),'grade':'S' if sc>=8.7 else 'A' if sc>=7.2 else 'B' if sc>=5.5 else 'C','tags':ts,'concepts':cs,'reason':reason,'screening_note':note,'screening':'heuristic'}
                ai=llm_screen(a)
                if ai:a.update({'grade':ai['grade'],'reading_score':round(float(ai['reading_score']),2),'notion_score':round(float(ai['notion_score']),2),'reason':ai['reason'],'tags':ai['tags'],'concepts':ai['concepts'],'screening':'openai_api'})
                existing[i]=a; new.append(a)
            rec['new_count']=n;rec['status']='ok'
        except Exception as e:rec['status']='failed';rec['error']=str(e)[:200]
        run.append(rec);time.sleep(.2)
    arts=list(existing.values())
    for a in arts:
        if not a.get('concepts'):
            a['concepts']=concepts(' '.join([a.get('title',''),a.get('summary',''),a.get('reason',''),a.get('content_excerpt','')[:5000]]))
    arts.sort(key=lambda a:(a.get('published') or a.get('first_seen') or ''),reverse=True)
    now=datetime.now(timezone.utc).isoformat();ART_PATH.write_text(json.dumps({'meta':{'tracking_start':'2026-08-10','generated_at':now,'screening_mode':'openai_api_if_configured_else_heuristic','new_this_run':len(new)},'articles':arts},ensure_ascii=False,indent=2),encoding='utf-8')
    failed=[{'name':x['name'],'error':x['error']} for x in run if x['status']=='failed'];STATUS_PATH.write_text(json.dumps({'generated_at':now,'expected_sources':len(SOURCES),'successful_sources':sum(1 for x in run if x['status']=='ok'),'failed_sources':failed,'raw_new_count':raw,'deduped_count':len(new),'deep_read_count':deep,'sources':run},ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':main()
