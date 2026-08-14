#!/usr/bin/env python3
"""Weekly v8: semantic temporal screening + rolling feedback/source/storage lifecycle."""
from __future__ import annotations

import html
import json
import re
from types import SimpleNamespace
from urllib.parse import parse_qs, unquote, urljoin, urlsplit

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
XTREND_FEEDER_URL='https://feeder.co/discover/26f6276420/xtrend-nikkei-com'
BROWSER_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
XTREND_DISCOVERY_META={}


def temporal_increment_type(lex_diag:dict,sem_diag:dict,practical:bool)->str:
    if float(sem_diag.get('temporal_update_bonus',0) or 0)>0:
        return 'temporal_update'
    return _original_increment(lex_diag,sem_diag,practical)


def score_one_temporal(a,src,sem):
    reading,notion,kc,vector,reason,tags,features=_original_score_one(a,src,sem)
    if kc.get('increment_type')=='temporal_update' or TEMPORAL_REASON_RE.search(reason or ''):
        kc['increment_type']='temporal_update'
        kc['temporal_update']=True
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


def _decode_xtrend_candidates(href:str,base_url:str)->list[str]:
    """Mirror the isolated test that successfully discovered XTrend URLs on GitHub Actions."""
    out=[]
    raw=html.unescape(href or '')
    out.append(urljoin(base_url,raw))
    try:
        query=parse_qs(urlsplit(raw).query)
        for key in ('url','u','target','redirect','redirect_url','dest','destination'):
            for value in query.get(key,[]):
                out.append(unquote(value))
    except Exception:
        pass
    out.extend(re.findall(r'https?://xtrend\.nikkei\.com/atcl/[^\s"\'<>]+',raw,re.I))
    return out


def _feeder_context(a)->str:
    """Extract the public text around a Feeder article link as a screening snippet."""
    title=p.base.clean(a.get_text(' ',strip=True))
    best=''
    node=a
    for _ in range(5):
        node=getattr(node,'parent',None)
        if node is None:
            break
        text=p.base.clean(node.get_text(' ',strip=True))
        if len(text)>len(best) and len(text)<=1800:
            best=text
        if len(text)>=80:
            break
    if title and best.startswith(title):
        best=best[len(title):].strip(' -–—|｜:：')
    best=re.sub(r'\b(Read full|Read more|Open)\b',' ',best,flags=re.I)
    return p.base.clean(best)[:1200]


def fetch_xtrend_via_feeder(src):
    """Discover XTrend via Feeder using the parser proven by the isolated GitHub Actions test."""
    if src.get('name')!=XTREND_SOURCE:
        return _original_fetch_xtrend(src)
    errors=[]
    try:
        r=requests.get(
            XTREND_FEEDER_URL,
            headers={'User-Agent':BROWSER_UA,'Accept-Language':'ja,en;q=0.7'},
            timeout=30,
            allow_redirects=True,
        )
        r.raise_for_status()
        soup=BeautifulSoup(r.text,'html.parser')
        rows=[];seen=set()
        for a in soup.find_all('a',href=True):
            title=p.base.clean(a.get_text(' ',strip=True))
            if len(title)<8:
                continue
            found_url=''
            for candidate in _decode_xtrend_candidates(str(a.get('href') or ''),r.url):
                candidate=html.unescape(candidate)
                if _is_xtrend_article(candidate):
                    found_url=p.base.norm_url(candidate)
                    break
            if not found_url or found_url in seen:
                continue
            seen.add(found_url)
            summary=_feeder_context(a)
            XTREND_DISCOVERY_META[found_url]={'title':title,'summary':summary,'discovery':'feeder'}
            rows.append((title,found_url))
            if len(rows)>=80:
                break
        if rows:
            print(f'XTrend Feeder discovery: {len(rows)} articles')
            for title,url in rows[:5]:
                print(f'  XTREND {title[:100]} | {url}')
            return rows
        errors.append('Feeder page loaded but no XTrend article links were found')
    except Exception as e:
        errors.append(f'Feeder: {str(e)[:120]}')
    try:
        rows=_original_fetch_xtrend(src)
        if rows:
            return rows
        errors.append('direct XTrend listing returned zero articles')
    except Exception as e:
        errors.append(f'direct XTrend: {str(e)[:120]}')
    raise RuntimeError('XTrend discovery failed: '+'; '.join(errors))


p.base.fetch_xtrend=fetch_xtrend_via_feeder


def enrich_xtrend_from_feeder_cache()->int:
    """Attach Feeder public snippets before semantic refresh so XTrend can be screened beyond title-only."""
    if not XTREND_DISCOVERY_META or not p.base.ART_PATH.exists():
        return 0
    payload=json.loads(p.base.ART_PATH.read_text(encoding='utf-8'))
    changed=0
    for article in payload.get('articles') or []:
        if article.get('source')!=XTREND_SOURCE:
            continue
        url=p.base.norm_url(article.get('url',''))
        meta=XTREND_DISCOVERY_META.get(url)
        if not meta:
            continue
        summary=meta.get('summary','')
        if summary and summary!=article.get('summary',''):
            article['summary']=summary
            article['screening_note']='XTrend：Feeder公开索引的标题/摘要用于筛选；未读取会员正文。'
            changed+=1
    if changed:
        p.base.ART_PATH.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'XTrend Feeder summaries enriched: {changed}')
    return changed


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
    meta['xtrend_discovery']='feeder_verified_parser_with_summary'
    for a in payload.get('articles') or []:
        kc=a.get('knowledge_context') or {}
        if kc.get('increment_type')=='temporal_update':
            a['screening']='semantic_v8_adaptive_temporal'
    p.base.ART_PATH.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':
    original_sources=list(p.base.SOURCES)
    prepared,source_counts=lifecycle.prepare_sources(original_sources)
    p.base.SOURCES=[s for s in prepared if not s.get('_adaptive_skip')]
    p.base.heuristic=adaptive_pre_read_heuristic
    p.deep_read_semantic_candidates=adaptive_semantic_deep_read
    p.base.main()
    enrich_xtrend_from_feeder_cache()
    lifecycle.refresh_hot_only(p.refresh_existing_scores)
    mark_version()
    storage_counts=lifecycle.compact_articles()
    lifecycle.annotate_status(source_counts,storage_counts)
