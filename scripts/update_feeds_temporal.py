#!/usr/bin/env python3
"""Weekly v8: semantic temporal screening + rolling feedback/source/storage lifecycle."""
from __future__ import annotations

import json
import re
from types import SimpleNamespace
from urllib.parse import quote_plus, urljoin, urlsplit

import requests
from bs4 import BeautifulSoup

import update_feeds_personalized as p
import weekly_lifecycle as lifecycle

_original_increment=p.increment_type
_original_score_one=p.score_one
_original_base_heuristic=p.base.heuristic
_original_deep_read=p.deep_read_semantic_candidates
_original_fetch_feed=p.base.fetch_feed
_original_fetch_xtrend=p.base.fetch_xtrend
TEMPORAL_REASON_RE=re.compile(r'更新20\d{2}|时间证据|時間証拠|temporal',re.I)
DENTSU_SOURCE='ウェブ電通報／ビジネスにもっとアイデアを。'
XTREND_SOURCE='日経クロストレンド 新着'
BROWSER_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'


def temporal_increment_type(lex_diag:dict,sem_diag:dict,practical:bool)->str:
    if float(sem_diag.get('temporal_update_bonus',0) or 0)>0:
        return 'temporal_update'
    return _original_increment(lex_diag,sem_diag,practical)


def score_one_temporal(a,src,sem):
    reading,notion,kc,vector,reason,tags,features=_original_score_one(a,src,sem)
    if kc.get('increment_type')=='temporal_update' or TEMPORAL_REASON_RE.search(reason or ''):
        kc['increment_type']='temporal_update'
        kc['temporal_update']=True
        # A fresh comparable signal should not be pushed down by legacy lexical duplicate penalties.
        notion=p.clamp(notion+.22)
    return reading,notion,kc,vector,reason,tags,features


p.increment_type=temporal_increment_type
p.score_one=score_one_temporal


def html_feed_fallback(src):
    """Read an official article-list page when a publisher's legacy RSS endpoint has been retired."""
    if src.get('name')!=DENTSU_SOURCE:
        return _original_fetch_feed(src)
    r=requests.get(
        src.get('url') or 'https://dentsu-ho.com/',
        headers={'User-Agent':BROWSER_UA,'Accept-Language':'ja,en;q=0.7'},
        timeout=20,
        allow_redirects=True,
    )
    r.raise_for_status()
    soup=BeautifulSoup(r.text,'html.parser')
    entries=[];seen=set()
    date_re=re.compile(r'(20\d{2})[./年-](\d{1,2})[./月-](\d{1,2})')
    for a in soup.find_all('a',href=True):
        href=str(a.get('href') or '')
        if '/articles/' not in href:
            continue
        title=p.base.clean(a.get_text(' ',strip=True))
        if len(title)<12:
            continue
        url=p.base.norm_url(urljoin(r.url,href))
        if not url or url in seen:
            continue
        seen.add(url)
        context=''
        node=a
        for _ in range(3):
            node=getattr(node,'parent',None)
            if node is None:break
            context=p.base.clean(node.get_text(' ',strip=True))[:500]
            if date_re.search(context):break
        m=date_re.search(context)
        published=f'{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}' if m else None
        entries.append(SimpleNamespace(
            title=title,link=url,summary='',description='',published=published,
            published_parsed=None,updated_parsed=None,created_parsed=None,
        ))
        if len(entries)>=80:break
    if not entries:
        raise RuntimeError('Dentsu official listing loaded but no /articles/ links were found')
    return SimpleNamespace(entries=entries)


p.base.fetch_feed=html_feed_fallback


def _is_xtrend_article(url:str)->bool:
    try:
        parsed=urlsplit(url)
    except Exception:
        return False
    host=parsed.netloc.lower().split(':',1)[0]
    path=parsed.path or ''
    return host=='xtrend.nikkei.com' and '/atcl/' in path and '/contents/new' not in path


def _xtrend_url_from_entry(entry)->str:
    """Extract an original XTrend article URL from a search RSS item."""
    candidates=[
        str(getattr(entry,'link','') or ''),
        str(getattr(entry,'id','') or ''),
    ]
    for field in ('summary','description'):
        text=str(getattr(entry,field,'') or '')
        if text:
            soup=BeautifulSoup(text,'html.parser')
            candidates.extend(str(a.get('href') or '') for a in soup.find_all('a',href=True))
            candidates.extend(re.findall(r'https?://xtrend\.nikkei\.com/atcl/[^\s"\'<>]+',text,re.I))
    for candidate in candidates:
        candidate=p.base.norm_url(candidate)
        if _is_xtrend_article(candidate):
            return candidate
    return ''


def _xtrend_search_rss_urls()->list[str]:
    """Use public search indexes for URL discovery so robots-blocked listing pages are not a single point of failure."""
    site_query=quote_plus('site:xtrend.nikkei.com/atcl/ 日経クロストレンド')
    return [
        f'https://www.bing.com/search?q={site_query}&format=rss&setlang=ja-jp&filters=ex1%3a%22ez2%22',
        f'https://www.bing.com/news/search?q={site_query}&format=rss&setlang=ja-jp',
        f'https://news.google.com/rss/search?q={site_query}&hl=ja&gl=JP&ceid=JP%3Aja',
    ]


def fetch_xtrend_resilient(src):
    """Discover XTrend articles via search RSS first, then use the official listing only as a fallback.

    This does not bypass a paywall or robots policy. It only discovers public article URLs/titles
    from search indexes and preserves the existing dashboard's title-level screening behavior.
    """
    if src.get('name')!=XTREND_SOURCE:
        return _original_fetch_xtrend(src)

    rows=[];seen=set();errors=[]
    headers={'User-Agent':BROWSER_UA,'Accept-Language':'ja,en;q=0.7'}
    for feed_url in _xtrend_search_rss_urls():
        try:
            r=requests.get(feed_url,headers=headers,timeout=20,allow_redirects=True)
            r.raise_for_status()
            parsed=p.base.feedparser.parse(r.content)
            if getattr(parsed,'bozo',False) and not getattr(parsed,'entries',None):
                raise RuntimeError(str(getattr(parsed,'bozo_exception','RSS parse failed')))
            for entry in getattr(parsed,'entries',[]) or []:
                title=p.base.clean(getattr(entry,'title',''))
                # Search engines sometimes append the publisher name to the title.
                title=re.sub(r'\s*[-–—|｜]\s*日経クロストレンド\s*$','',title).strip()
                url=_xtrend_url_from_entry(entry)
                if len(title)<8 or not url or url in seen:
                    continue
                seen.add(url);rows.append((title,url))
                if len(rows)>=80:
                    break
            if rows:
                break
        except Exception as e:
            errors.append(f'search-rss: {str(e)[:100]}')

    # The official page is only a secondary fallback; a robots block no longer produces a fake success.
    if not rows:
        try:
            rows=_original_fetch_xtrend(src)
        except Exception as e:
            errors.append(f'official-listing: {str(e)[:100]}')

    rows=[(title,url) for title,url in rows if _is_xtrend_article(url)]
    if not rows:
        detail='; '.join(errors[-4:]) or 'no public search-index results and no official-listing results'
        raise RuntimeError(f'XTrend discovery unavailable: {detail}')
    return rows[:80]


p.base.fetch_xtrend=fetch_xtrend_resilient


def adaptive_pre_read_heuristic(src,title,summary,content=''):
    """Throttle expensive body reads for low-yield sources without lowering final semantic scores."""
    reading,notion,tags,features,reason=_original_base_heuristic(src,title,summary,content)
    if not content and src.get('_adaptive_mode') in ('cold','probe'):
        reading=max(0,reading-2.0)
    return reading,notion,tags,features,reason


def adaptive_semantic_deep_read(payload,matcher,sem_results,by_name):
    active=[]
    for a in payload.get('articles') or []:
        src=by_name.get(a.get('source')) or {}
        if src.get('_adaptive_mode') in ('cold','probe'):
            continue
        active.append(a)
    subset=dict(payload);subset['articles']=active
    return _original_deep_read(subset,matcher,sem_results,by_name)


def mark_version()->None:
    if not p.base.ART_PATH.exists():return
    payload=json.loads(p.base.ART_PATH.read_text(encoding='utf-8'))
    meta=payload.setdefault('meta',{})
    meta['personalization_version']='semantic_v8_adaptive_temporal'
    meta['temporal_update_enabled']=True
    meta['rolling_feedback_window_days']=84
    meta['adaptive_attention_budget']=True
    meta['xtrend_discovery']='search_rss_with_official_fallback'
    for a in payload.get('articles') or []:
        kc=a.get('knowledge_context') or {}
        if kc.get('increment_type')=='temporal_update':
            a['screening']='semantic_v8_adaptive_temporal'
    p.base.ART_PATH.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':
    original_sources=list(p.base.SOURCES)
    prepared,source_counts=lifecycle.prepare_sources(original_sources)
    # Probe sources are intentionally checked only one week in four after a large, persistently low-yield sample.
    p.base.SOURCES=[s for s in prepared if not s.get('_adaptive_skip')]
    p.base.heuristic=adaptive_pre_read_heuristic
    p.deep_read_semantic_candidates=adaptive_semantic_deep_read
    p.base.main()
    lifecycle.refresh_hot_only(p.refresh_existing_scores)
    mark_version()
    storage_counts=lifecycle.compact_articles()
    lifecycle.annotate_status(source_counts,storage_counts)
