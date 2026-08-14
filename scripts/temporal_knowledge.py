#!/usr/bin/env python3
from __future__ import annotations

import re
from datetime import date

WS=re.compile(r'\s+')
YEAR=re.compile(r'(?<!\d)(20\d{2})(?:\s*年|年度|[./-])?')
RANGE=re.compile(r'(?P<y1>20\d{2})\s*年?\s*(?P<m1>1[0-2]|0?[1-9])?\s*月?\s*(?:[〜～~\-–—至到]+)\s*(?:(?P<y2>20\d{2})\s*年?\s*)?(?P<m2>1[0-2]|0?[1-9])?\s*月?')
POINT=re.compile(r'(?P<y>20\d{2})\s*年\s*(?P<m>1[0-2]|0?[1-9])?\s*月?')
FY=re.compile(r'(?P<y>20\d{2})\s*年度')
EVIDENCE_CTX=re.compile(r'調査期間|調査時期|調査実施|実施期間|実施時期|アンケート.*実施|survey.*(?:period|conducted)|対象期間|集計期間|観測期間|データ期間|调查期间|调查时期|实施时间|调查时间|问卷.*实施',re.I)
PUBLISH_CTX=re.compile(r'公開日|掲載日|投稿日|発表日|更新日|published|publication|公開|发布|发表',re.I)

HIGH=re.compile(r'生成AI|ChatGPT|LLM|AIエージェント|AEO|AIO|GEO|検索アルゴリズム|アルゴリズム|プラットフォーム|TikTok|Amazon|楽天|EC|広告配信|Cookie|SNS',re.I)
MEDIUM=re.compile(r'消費者|生活者|購買|購入|価格|値上げ|市場|シェア|ブランド|意識|価値観|態度|インサイト|景況|節約|支出|消费|购买|消费者',re.I)
LOW=re.compile(r'統計手法|調査設計|フレームワーク|原則|理論|回帰分析|因果推論|方法論',re.I)

DOMAIN_RULES=[
 ('technology',re.compile(r'生成AI|ChatGPT|LLM|AIエージェント|AEO|AIO|GEO|アルゴリズム|プラットフォーム|検索|SNS|Cookie',re.I)),
 ('consumer',re.compile(r'消費者|生活者|購買|購入|価値観|意識|態度|インサイト|支出|節約|消费者|消费|购买',re.I)),
 ('market_price',re.compile(r'価格|値上げ|市場|シェア|需要|物価|景況|price|market',re.I)),
 ('channel_ec',re.compile(r'Amazon|楽天|EC|eコマース|D2C|小売|リテール|チャネル',re.I)),
 ('methodology',LOW),
]


def clean(s:str)->str:return WS.sub(' ',str(s or '')).strip()

def iso(y:int,m:int|None=None,d:int=1)->str:
    m=m or 1
    try:return date(y,m,d).isoformat()
    except ValueError:return f'{y:04d}-01-01'

def month_end(y:int,m:int|None)->str:
    if not m:return f'{y:04d}-12-31'
    if m==12:return f'{y:04d}-12-31'
    nxt=date(y,m+1,1).toordinal()-1
    return date.fromordinal(nxt).isoformat()

def nearby(text:str,start:int,end:int,radius:int=90)->str:
    return text[max(0,start-radius):min(len(text),end+radius)]

def evidence_period(text:str)->dict|None:
    candidates=[]
    for m in RANGE.finditer(text):
        ctx=nearby(text,m.start(),m.end())
        if not EVIDENCE_CTX.search(ctx):continue
        y1=int(m.group('y1'));m1=int(m.group('m1')) if m.group('m1') else 1
        y2=int(m.group('y2') or y1);m2=int(m.group('m2')) if m.group('m2') else (m1 if not m.group('y2') else 12)
        candidates.append((3,m.start(),{'start':iso(y1,m1),'end':month_end(y2,m2),'label':clean(m.group(0)),'basis':'explicit_evidence_period'}))
    for m in POINT.finditer(text):
        ctx=nearby(text,m.start(),m.end())
        if not EVIDENCE_CTX.search(ctx):continue
        y=int(m.group('y'));mo=int(m.group('m')) if m.group('m') else None
        candidates.append((2,m.start(),{'start':iso(y,mo),'end':month_end(y,mo),'label':clean(m.group(0)),'basis':'explicit_evidence_point'}))
    for m in FY.finditer(text):
        ctx=nearby(text,m.start(),m.end())
        if not (EVIDENCE_CTX.search(ctx) or re.search(r'データ|統計|調査|survey|research',ctx,re.I)):continue
        y=int(m.group('y'));candidates.append((1,m.start(),{'start':f'{y:04d}-04-01','end':f'{y+1:04d}-03-31','label':clean(m.group(0)),'basis':'fiscal_year_evidence'}))
    if not candidates:return None
    candidates.sort(key=lambda x:(-x[0],x[1]));return candidates[0][2]

def published_at(text:str)->str|None:
    for m in POINT.finditer(text):
        if PUBLISH_CTX.search(nearby(text,m.start(),m.end(),70)):
            return iso(int(m.group('y')),int(m.group('m')) if m.group('m') else None)
    return None

def time_profile(text:str)->tuple[str,str]:
    domain='general'
    for name,rex in DOMAIN_RULES:
        if rex.search(text):domain=name;break
    if LOW.search(text) and not (HIGH.search(text) or MEDIUM.search(text)):return 'low',domain
    if HIGH.search(text):return 'high',domain
    if MEDIUM.search(text):return 'medium',domain
    return 'low',domain

def enrich_item_temporal(item:dict)->dict:
    comments=' '.join(str(c.get('text') or '') for c in (item.get('comments') or []) if isinstance(c,dict))
    text=clean(' '.join([item.get('title',''),item.get('summary',''),item.get('page_body',''),comments]))
    ev=evidence_period(text);pub=published_at(text);col=(item.get('created_time') or item.get('date') or '')[:10] or None
    sensitive,domain=time_profile(text)
    if ev:
        effective=ev['end'];confidence='high';basis=ev['basis']
    elif pub:
        effective=pub;confidence='medium';basis='published_at'
    else:
        effective=col;confidence='low';basis='collected_at_fallback'
    item['evidence_period']=ev
    item['published_at']=pub
    item['collected_at']=col
    item['effective_date']=effective
    item['temporal_confidence']=confidence
    item['temporal_basis']=basis
    item['time_sensitive']=sensitive
    item['time_domain']=domain
    return item


def temporal_year(item:dict)->int|None:
    d=item.get('effective_date') or item.get('date')
    try:return int(str(d)[:4])
    except Exception:return None
