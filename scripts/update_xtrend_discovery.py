#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urljoin, urlsplit, urlunsplit

import feedparser
import requests
from bs4 import BeautifulSoup
from dateutil import parser as dtparser

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'xtrend_discovery.json'
RSS_URL='https://xtrend.nikkei.com/rss/index.rdf'
FEEDER_URL='https://feeder.co/discover/26f6276420/xtrend-nikkei-com'
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
RETENTION_DAYS=45


def clean(x):
    if not x:return ''
    return re.sub(r'\s+',' ',BeautifulSoup(html.unescape(str(x)),'html.parser').get_text(' ',strip=True)).strip()


def norm_xtrend(url):
    if not url:return ''
    try:
        p=urlsplit(html.unescape(url))
        host=p.netloc.lower().split(':',1)[0]
        if host!='xtrend.nikkei.com' or '/atcl/' not in (p.path or ''):return ''
        # XTrend uses n_cid and other tracking query strings for the same article.
        return urlunsplit(('https','xtrend.nikkei.com',(p.path or '').rstrip('/'),'',''))
    except Exception:return ''


def parse_dt(value):
    if not value:return None
    try:return dtparser.parse(str(value)).astimezone(timezone.utc).isoformat()
    except Exception:return None


def fetch_rss():
    r=requests.get(RSS_URL,headers={'User-Agent':UA,'Accept-Language':'ja,en;q=0.7'},timeout=25,allow_redirects=True)
    r.raise_for_status()
    feed=feedparser.parse(r.content)
    rows=[]
    for e in feed.entries:
        url=norm_xtrend(getattr(e,'link',''))
        title=clean(getattr(e,'title',''))
        if not url or len(title)<5:continue
        summary=clean(getattr(e,'summary','') or getattr(e,'description',''))[:1400]
        published=parse_dt(getattr(e,'published',None) or getattr(e,'updated',None))
        rows.append({'url':url,'title':title,'summary':summary,'published':published,'discovery':['official_rss']})
    return rows


def decode_candidates(href,base):
    raw=html.unescape(href or '');out=[urljoin(base,raw)]
    try:
        q=parse_qs(urlsplit(raw).query)
        for key in ('url','u','target','redirect','redirect_url','dest','destination'):
            for v in q.get(key,[]):out.append(unquote(v))
    except Exception:pass
    out.extend(re.findall(r'https?://xtrend\.nikkei\.com/atcl/[^\s"\'<>]+',raw,re.I))
    return out


def feeder_context(a):
    title=clean(a.get_text(' ',strip=True));best='';node=a
    for _ in range(5):
        node=getattr(node,'parent',None)
        if node is None:break
        text=clean(node.get_text(' ',strip=True))
        if len(text)>len(best) and len(text)<=1800:best=text
        if len(text)>=80:break
    if title and best.startswith(title):best=best[len(title):].strip(' -–—|｜:：')
    best=re.sub(r'\b(Read full|Read more|Open)\b',' ',best,flags=re.I)
    return clean(best)[:1400]


def fetch_feeder():
    r=requests.get(FEEDER_URL,headers={'User-Agent':UA,'Accept-Language':'ja,en;q=0.7'},timeout=25,allow_redirects=True)
    r.raise_for_status();soup=BeautifulSoup(r.text,'html.parser');rows=[];seen=set()
    for a in soup.find_all('a',href=True):
        title=clean(a.get_text(' ',strip=True))
        if len(title)<5:continue
        url=''
        for c in decode_candidates(str(a.get('href') or ''),r.url):
            url=norm_xtrend(c)
            if url:break
        if not url or url in seen:continue
        seen.add(url)
        rows.append({'url':url,'title':title,'summary':feeder_context(a),'published':None,'discovery':['feeder']})
    return rows


def load_old():
    if not OUT.exists():return {'articles':[]}
    try:return json.loads(OUT.read_text(encoding='utf-8'))
    except Exception:return {'articles':[]}


def main():
    now=datetime.now(timezone.utc);old=load_old();by_url={}
    for a in old.get('articles') or []:
        url=norm_xtrend(a.get('url',''))
        if url:by_url[url]=dict(a,url=url)
    results=[];errors=[]
    for name,fn in [('official_rss',fetch_rss),('feeder',fetch_feeder)]:
        try:
            rows=fn();results.extend(rows);print(f'XTrend {name}: {len(rows)} discovered')
        except Exception as e:
            errors.append(f'{name}: {str(e)[:180]}');print(f'XTrend {name} failed: {e}')
    if not results and errors:raise RuntimeError('; '.join(errors))
    first_now=now.isoformat()
    for row in results:
        url=row['url'];cur=by_url.get(url,{})
        cur['url']=url
        if row.get('title'):cur['title']=row['title']
        if row.get('summary') and len(row['summary'])>=len(cur.get('summary','')):cur['summary']=row['summary']
        if row.get('published'):cur['published']=row['published']
        cur['first_seen']=cur.get('first_seen') or first_now
        cur['last_seen']=first_now
        cur['discovery']=sorted(set((cur.get('discovery') or [])+(row.get('discovery') or [])))
        by_url[url]=cur
    cutoff=now-timedelta(days=RETENTION_DAYS)
    kept=[]
    for a in by_url.values():
        stamp=parse_dt(a.get('published')) or parse_dt(a.get('first_seen'))
        try:dt=datetime.fromisoformat(stamp) if stamp else now
        except Exception:dt=now
        if dt>=cutoff:kept.append(a)
    kept.sort(key=lambda a:a.get('published') or a.get('first_seen') or '',reverse=True)
    payload={'generated_at':first_now,'source':'日経クロストレンド 新着','retention_days':RETENTION_DAYS,'latest_discovery_count':len({r['url'] for r in results}),'errors':errors,'articles':kept}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'XTrend rolling cache: {len(kept)} unique articles retained')

if __name__=='__main__':main()
