from __future__ import annotations
import base64,os,re
from dataclasses import dataclass
from datetime import datetime,timezone
from typing import Iterable
import numpy as np
from sentence_transformers import SentenceTransformer
import build_system_model as crypto
import build_semantic_index as idx

INDEX_ENC=idx.ROOT/'data'/'semantic-index.enc.json'
MAX_ARTICLE_CHUNKS=3
YEAR_RE=re.compile(r'(?<!\d)(20\d{2})(?!\d)')

def article_text(a):return idx.clean(' '.join([str(a.get('title') or ''),str(a.get('summary') or ''),str(a.get('content_excerpt') or '')]))
def article_chunks(a):
    title=idx.clean(str(a.get('title') or ''));chunks=idx.split_chunks(article_text(a))
    if len(chunks)>MAX_ARTICLE_CHUNKS:
        ids=np.linspace(0,len(chunks)-1,MAX_ARTICLE_CHUNKS).round().astype(int);chunks=[chunks[i] for i in sorted(set(ids.tolist()))]
    out=[f'query: {title}\n{c}' if title else f'query: {c}' for _,c in chunks]
    return out or [f'query: {title}' if title else 'query: unknown']

def decode_index(p):
    dim=int((p.get('meta') or {}).get('dimension') or 0);entries=p.get('entries') or [];scales=np.asarray(p.get('scales') or [],dtype=np.float32);raw=np.frombuffer(base64.b64decode(p.get('vectors_b64') or ''),dtype=np.int8)
    if not dim or raw.size!=len(entries)*dim or scales.shape[0]!=len(entries):raise RuntimeError('Semantic index shape is invalid.')
    m=raw.reshape(len(entries),dim).astype(np.float32)*scales[:,None];n=np.linalg.norm(m,axis=1,keepdims=True);n[n==0]=1;return m/n

def quantize(vec):
    ma=float(np.max(np.abs(vec))) if vec.size else 0;scale=max(ma/127,1e-8);q=np.clip(np.rint(vec/scale),-127,127).astype(np.int8)
    return {'version':1,'family':'multilingual-e5','dim':int(vec.shape[0]),'q':base64.b64encode(q.tobytes()).decode('ascii'),'scale':round(scale,10),'normalized':True}

def year_of(value,default=None):
    m=YEAR_RE.search(str(value or ''))
    return int(m.group(1)) if m else default

@dataclass
class SemanticResult:
    vector:dict;rule_similarity:float;knowledge_similarity:float;experience_similarity:float;rule_top3_mean:float;knowledge_top3_mean:float;experience_top3_mean:float
    article_year:int|None=None;knowledge_effective_date:str|None=None;knowledge_temporal_confidence:str|None=None;knowledge_time_sensitive:str|None=None;knowledge_time_domain:str|None=None
    def public_dict(self):
        d={'version':2,'model_family':'multilingual-e5','rule_similarity':round(self.rule_similarity,4),'knowledge_similarity':round(self.knowledge_similarity,4),'experience_similarity':round(self.experience_similarity,4),'rule_top3_mean':round(self.rule_top3_mean,4),'knowledge_top3_mean':round(self.knowledge_top3_mean,4),'experience_top3_mean':round(self.experience_top3_mean,4)}
        if self.article_year:d['article_year']=self.article_year
        if self.knowledge_effective_date:d['matched_knowledge_effective_date']=self.knowledge_effective_date
        if self.knowledge_temporal_confidence:d['matched_knowledge_temporal_confidence']=self.knowledge_temporal_confidence
        if self.knowledge_time_sensitive:d['matched_knowledge_time_sensitive']=self.knowledge_time_sensitive
        if self.knowledge_time_domain:d['matched_knowledge_time_domain']=self.knowledge_time_domain
        return d
    def vector_dict(self):return dict(self.vector)

class SemanticMatcher:
    def __init__(self):
        p=crypto.decrypt(INDEX_ENC)
        if not p:raise RuntimeError('Encrypted semantic index is unavailable.')
        self.meta=p.get('meta') or {};self.entries=p.get('entries') or [];self.matrix=decode_index(p);self.kinds=np.asarray([str(e.get('kind') or '') for e in self.entries],dtype=object);self.ids=np.asarray([str(e.get('id') or '') for e in self.entries],dtype=object);self.model=SentenceTransformer(str(self.meta.get('model') or os.getenv('SEMANTIC_MODEL_ID') or 'intfloat/multilingual-e5-small'))
    def _agg(self,sims,kind):
        mask=self.kinds==kind
        if not np.any(mask):return 0.,0.
        best={}
        for i,s in zip(self.ids[mask].tolist(),sims[mask].tolist()):best[i]=max(best.get(i,-1.),float(s))
        top=sorted(best.values(),reverse=True)[:3];return (top[0],sum(top)/len(top)) if top else (0.,0.)
    def _top_temporal(self,sims):
        ids=np.where(self.kinds=='notion')[0]
        if not ids.size:return {}
        ordered=ids[np.argsort(sims[ids])[::-1]]
        for j in ordered[:8]:
            t=self.entries[int(j)].get('temporal') or {}
            if t:return t
        return {}
    def analyze(self,articles:Iterable[dict]):
        articles=list(articles);texts=[];spans=[]
        for a in articles:
            c=article_chunks(a);start=len(texts);texts.extend(c);spans.append((start,len(texts)))
        if not texts:return {}
        vectors=self.model.encode(texts,batch_size=32,show_progress_bar=True,normalize_embeddings=True,convert_to_numpy=True).astype(np.float32);out={}
        now_year=datetime.now(timezone.utc).year
        for a,(start,end) in zip(articles,spans):
            av=vectors[start:end]
            if not av.size:continue
            doc=av.mean(axis=0);n=float(np.linalg.norm(doc));doc=doc/n if n else doc;sims=np.max(av@self.matrix.T,axis=0);rm,rmean=self._agg(sims,'rule');km,kmean=self._agg(sims,'notion');em,emean=self._agg(sims,'private');tm=self._top_temporal(sims)
            ay=year_of(a.get('published'),year_of(a.get('first_seen'),now_year))
            out[str(a.get('id') or '')]=SemanticResult(quantize(doc.astype(np.float32)),rm,km,em,rmean,kmean,emean,ay,tm.get('effective_date'),tm.get('temporal_confidence'),tm.get('time_sensitive'),tm.get('time_domain'))
        return out

def temporal_update_bonus(result,quality):
    old_year=year_of(result.knowledge_effective_date);new_year=result.article_year
    if not old_year or not new_year or new_year<=old_year:return 0.,0
    if result.knowledge_similarity<.78:return 0.,0
    if result.knowledge_temporal_confidence=='low':return 0.,0
    sensitivity=result.knowledge_time_sensitive or 'low'
    if sensitivity=='low':return 0.,0
    gap=min(5,new_year-old_year)
    base=.14+.07*gap
    if quality:base+=.10
    if sensitivity=='high':base+=.08
    return min(.58,base),old_year

def semantic_adjustment(text,result,*,quality,contradiction,practical):
    rule,know,exp=result.rule_similarity,result.knowledge_similarity,result.experience_similarity;fit=max(rule,exp*.98);fb=max(0,min(.75,(fit-.72)/.14*.75));gb=0
    if fit>=.77 and know<=fit-.045:gb=min(.5,(fit-know-.045)*4.2+.14)
    eb=.32 if quality and rule>=.75 else (.18 if quality and fit>=.73 else 0);bb=.48 if contradiction and rule>=.74 else (.28 if contradiction and fit>=.72 else 0);pb=.24 if practical and fit>=.75 else 0;tb,old_year=temporal_update_bonus(result,quality);rp=0
    if know>=.86 and not quality and not contradiction and gb==0 and not tb:rp=min(.8,.22+(know-.86)*4)
    elif know>=.9 and quality and rule<.76 and not tb:rp=min(.35,.12+(know-.9)*2)
    bonus=max(-.9,min(1.85,fb+gb+eb+bb+pb+tb-rp));labels=[]
    if tb:labels.append(f'可能更新{old_year}年前后的既有时间证据')
    if bb:labels.append('可能补充反例/边界')
    if gb:labels.append('与现有规则相关但 Knowledge 覆盖较薄')
    if eb:labels.append('可能补充证据/案例')
    if pb:labels.append('与实际工作场景语义接近')
    if rp:labels.append('与既有 Knowledge 语义重复较高')
    if not labels and fb:labels.append('与 Work System 语义相关')
    d={**result.public_dict(),'fit_bonus':round(fb,3),'gap_bonus':round(gb,3),'evidence_bonus':round(eb,3),'boundary_bonus':round(bb,3),'practical_bonus':round(pb,3),'temporal_update_bonus':round(tb,3),'repetition_penalty':round(rp,3),'semantic_bonus':round(bonus,3)}
    return round(bonus,3),'；'.join(labels),d
