#!/usr/bin/env python3
import re
import html
from urllib.parse import urljoin, urlsplit, parse_qs, unquote
import requests
from bs4 import BeautifulSoup

FEEDER='https://feeder.co/discover/26f6276420/xtrend-nikkei-com'
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36'


def is_xtrend(u):
    try:
        p=urlsplit(u)
        return p.netloc.lower()=='xtrend.nikkei.com' and '/atcl/' in p.path and '/contents/new' not in p.path
    except Exception:
        return False


def decode_candidates(href, base):
    out=[]
    raw=html.unescape(href or '')
    out.append(urljoin(base, raw))
    try:
        q=parse_qs(urlsplit(raw).query)
        for key in ('url','u','target','redirect','redirect_url','dest','destination'):
            for v in q.get(key,[]):
                out.append(unquote(v))
    except Exception:
        pass
    out.extend(re.findall(r'https?://xtrend\.nikkei\.com/atcl/[^\s"\'<>]+', raw, re.I))
    return out

r=requests.get(FEEDER,headers={'User-Agent':UA,'Accept-Language':'ja,en;q=0.7'},timeout=30,allow_redirects=True)
print('HTTP',r.status_code,'FINAL',r.url,'LEN',len(r.text))
r.raise_for_status()
print('RAW_XTREND_OCCURRENCES',r.text.lower().count('xtrend.nikkei.com'))
soup=BeautifulSoup(r.text,'html.parser')
rows=[];seen=set()
for a in soup.find_all('a',href=True):
    text=' '.join(a.stripped_strings)
    for cand in decode_candidates(a.get('href'),r.url):
        cand=html.unescape(cand)
        if is_xtrend(cand) and cand not in seen:
            seen.add(cand); rows.append((text,cand,a.get('href')))
for i,(title,url,href) in enumerate(rows[:20],1):
    print(f'{i}. TITLE={title[:160]}')
    print(f'   URL={url}')
    print(f'   HREF={href[:240]}')
print('FOUND',len(rows))
if not rows:
    # expose likely redirect/read-full anchors for debugging
    suspects=[]
    for a in soup.find_all('a',href=True):
        txt=' '.join(a.stripped_strings)
        href=str(a.get('href') or '')
        if 'read' in txt.lower() or 'full' in txt.lower() or 'redirect' in href.lower() or 'xtrend' in href.lower():
            suspects.append((txt,href))
    for i,(txt,href) in enumerate(suspects[:30],1):
        print(f'SUSPECT {i}: TEXT={txt[:120]} HREF={href[:300]}')
    raise SystemExit(2)
