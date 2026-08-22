#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, parse_qsl, unquote, urlencode, urljoin, urlsplit, urlunsplit

import feedparser
import requests
from bs4 import BeautifulSoup
from dateutil import parser as dtparser

ROOT = Path(__file__).resolve().parents[1]
SOURCES = json.loads((ROOT / 'config' / 'sources.json').read_text(encoding='utf-8'))
OUT = ROOT / 'data' / 'source_discovery.json'
TRACKING_START = datetime(2026, 8, 10, tzinfo=timezone.utc)
RETENTION_DAYS = 45
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
DATE_RE = re.compile(r'(20\d{2})[./年-](\d{1,2})[./月-](\d{1,2})(?:日)?(?:\s+(\d{1,2}):(\d{2}))?')
MARKZINE_SOURCE = 'MarkeZine:新着一覧'
MARKZINE_FEEDER_URL = 'https://feeder.co/discover/f5a21ad90c/markezine-jp'

SECONDARY = {
    MARKZINE_SOURCE: [
        {'name': 'article_listing', 'url': 'https://markezine.jp/article', 'article_re': r'/article/detail/\d+', 'pages': 4},
        {'name': 'column_listing', 'url': 'https://markezine.jp/article/t/%E3%82%B3%E3%83%A9%E3%83%A0', 'article_re': r'/article/detail/\d+', 'pages': 4},
    ],
    'Agenda note (アジェンダノート)': [
        {'name': 'new_article_listing', 'url': 'https://agenda-note.com/new_article/', 'article_re': r'/(?:[^/]+/)?detail/(?:id%3D|id=)?\d+|/[^/]+/detail/id%3D\d+', 'pages': 2},
        {'name': 'serialization_listing', 'url': 'https://agenda-note.com/serialization/', 'article_re': r'/(?:[^/]+/)?detail/(?:id%3D|id=)?\d+|/[^/]+/detail/id%3D\d+', 'pages': 2},
        {'name': 'conference_listing', 'url': 'https://agenda-note.com/conference/', 'article_re': r'/(?:[^/]+/)?detail/(?:id%3D|id=)?\d+|/[^/]+/detail/id%3D\d+', 'pages': 2},
    ],
    'ウェブ電通報／ビジネスにもっとアイデアを。': [
        {'name': 'official_listing', 'url': 'https://dentsu-ho.com/', 'article_re': r'/articles/\d+', 'pages': 1},
    ],
}


def clean(value):
    if not value:
        return ''
    return re.sub(r'\s+', ' ', BeautifulSoup(html.unescape(str(value)), 'html.parser').get_text(' ', strip=True)).strip()


def norm_url(url):
    if not url:
        return ''
    try:
        p = urlsplit(html.unescape(str(url)))
        if p.scheme not in ('http', 'https'):
            return ''
        q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
             if not (k.lower().startswith('utm_') or k.lower() in {'ref', 'source', 'i_cid', 'fbclid', 'gclid', 'n_cid'})]
        return urlunsplit(('https', p.netloc.lower(), p.path.rstrip('/') or '/', urlencode(q), ''))
    except Exception:
        return ''


def parse_dt(value):
    if not value:
        return None
    try:
        dt = dtparser.parse(str(value))
        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def parse_feed_dt(entry):
    for key in ('published_parsed', 'updated_parsed', 'created_parsed'):
        value = getattr(entry, key, None)
        if value:
            return datetime(*value[:6], tzinfo=timezone.utc)
    for key in ('published', 'updated', 'created'):
        dt = parse_dt(getattr(entry, key, None))
        if dt:
            return dt
    return None


def date_from_text(text):
    m = DATE_RE.search(text or '')
    if not m:
        return None
    hour = int(m.group(4) or 0)
    minute = int(m.group(5) or 0)
    jst = timezone(timedelta(hours=9))
    return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), hour, minute, tzinfo=jst).astimezone(timezone.utc)


def row(source, url, title, summary='', published=None, method='feed'):
    return {
        'source': source,
        'url': norm_url(url),
        'title': clean(title),
        'summary': clean(summary)[:1400],
        'published': published.isoformat() if isinstance(published, datetime) else (str(published) if published else None),
        'discovery': [method],
    }


def fetch_feed_rows(src):
    r = requests.get(src['url'], headers={'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.7'}, timeout=20, allow_redirects=True)
    r.raise_for_status()
    feed = feedparser.parse(r.content)
    rows = []
    for e in feed.entries:
        url = norm_url(getattr(e, 'link', ''))
        title = clean(getattr(e, 'title', ''))
        if not url or not title:
            continue
        published = parse_feed_dt(e)
        if published and published < TRACKING_START:
            continue
        rows.append(row(src['name'], url, title, getattr(e, 'summary', '') or getattr(e, 'description', ''), published, 'feed_cache'))
    return rows


def decode_candidates(href, base_url):
    raw = html.unescape(str(href or ''))
    out = [urljoin(base_url, raw)]
    try:
        query = parse_qs(urlsplit(raw).query)
        for key in ('url', 'u', 'target', 'redirect', 'redirect_url', 'dest', 'destination'):
            for value in query.get(key, []):
                out.append(unquote(value))
    except Exception:
        pass
    out.extend(re.findall(r'https?://markezine\.jp/article/detail/\d+[^\s"\'<>]*', raw, re.I))
    return out


def feeder_context(a):
    title = clean(a.get_text(' ', strip=True))
    best = ''
    node = a
    for _ in range(5):
        node = getattr(node, 'parent', None)
        if node is None:
            break
        text = clean(node.get_text(' ', strip=True))
        if len(text) > len(best) and len(text) <= 2200:
            best = text
        if len(text) >= 80:
            break
    if title and best.startswith(title):
        best = best[len(title):].strip(' -–—|｜:：')
    best = re.sub(r'\b(Read full|Read more|Open)\b', ' ', best, flags=re.I)
    return clean(best)[:1400]


def fetch_markezine_feeder_rows():
    r = requests.get(MARKZINE_FEEDER_URL, headers={'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.7'}, timeout=25, allow_redirects=True)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, 'html.parser')
    rows = []
    seen = set()
    for a in soup.find_all('a', href=True):
        title = clean(a.get_text(' ', strip=True))
        if len(title) < 8:
            continue
        found = ''
        for candidate in decode_candidates(a.get('href'), r.url):
            u = norm_url(candidate)
            p = urlsplit(u)
            if p.netloc.lower() == 'markezine.jp' and re.search(r'/article/detail/\d+$', p.path):
                found = u
                break
        if not found or found in seen:
            continue
        seen.add(found)
        rows.append(row(MARKZINE_SOURCE, found, title, feeder_context(a), None, 'markezine_feeder'))
    return rows


def pagination_urls(soup, page_url, max_pages):
    found = {page_url}
    base_host = urlsplit(page_url).netloc.lower()
    numbered = []
    for a in soup.find_all('a', href=True):
        text = clean(a.get_text(' ', strip=True))
        if not re.fullmatch(r'\d+', text):
            continue
        n = int(text)
        if n < 2 or n > max_pages:
            continue
        u = urljoin(page_url, str(a.get('href') or ''))
        if urlsplit(u).netloc.lower() != base_host:
            continue
        numbered.append((n, u))
    for _, u in sorted(numbered):
        found.add(u)
    return list(found)


def article_context(a):
    best = clean(a.get_text(' ', strip=True))
    node = a
    for _ in range(5):
        node = getattr(node, 'parent', None)
        if node is None:
            break
        text = clean(node.get_text(' ', strip=True))
        if len(text) > len(best) and len(text) <= 2200:
            best = text
        if DATE_RE.search(text):
            return text
    return best


def fetch_listing_rows(source_name, spec):
    headers = {'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.7'}
    first = requests.get(spec['url'], headers=headers, timeout=25, allow_redirects=True)
    first.raise_for_status()
    first_soup = BeautifulSoup(first.text, 'html.parser')
    pages = pagination_urls(first_soup, first.url, int(spec.get('pages') or 1))
    if first.url not in pages:
        pages.insert(0, first.url)
    rows = []
    seen = set()
    article_re = re.compile(spec['article_re'], re.I)
    for idx, page_url in enumerate(pages):
        if idx == 0:
            r, soup = first, first_soup
        else:
            r = requests.get(page_url, headers=headers, timeout=25, allow_redirects=True)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, 'html.parser')
        for a in soup.find_all('a', href=True):
            href = str(a.get('href') or '')
            candidate = urljoin(r.url, href)
            p = urlsplit(candidate)
            if p.netloc.lower() != urlsplit(spec['url']).netloc.lower():
                continue
            if not article_re.search(p.path + ('?' + p.query if p.query else '')):
                continue
            url = norm_url(candidate)
            title = clean(a.get_text(' ', strip=True))
            if not url or len(title) < 8 or url in seen:
                continue
            context = article_context(a)
            published = date_from_text(context)
            if not published or published < TRACKING_START:
                continue
            seen.add(url)
            rows.append(row(source_name, url, title, '', published, spec['name']))
    return rows


def load_old():
    if not OUT.exists():
        return {'articles': []}
    try:
        return json.loads(OUT.read_text(encoding='utf-8'))
    except Exception:
        return {'articles': []}


def update_cache():
    now = datetime.now(timezone.utc)
    old = load_old()
    by_key = {}
    for a in old.get('articles') or []:
        source = str(a.get('source') or '')
        url = norm_url(a.get('url') or '')
        if source and url:
            by_key[(source, url)] = dict(a, url=url)

    source_meta = {}
    all_fresh = []
    for src in SOURCES:
        name = src['name']
        if name == '日経クロストレンド 新着':
            source_meta[name] = {
                'coverage_status': 'enhanced',
                'methods': ['official_rss', 'feeder', 'rolling_cache', 'direct_listing'],
                'method_counts': {},
                'errors': [],
                'discovered_this_run': 0,
                'cached_count': 0,
            }
            continue

        fresh = []
        methods = []
        method_counts = {}
        errors = []

        if src.get('type') != 'html_feed_fallback':
            try:
                rows = fetch_feed_rows(src)
                fresh.extend(rows)
                methods.append('feed_cache')
                method_counts['feed_cache'] = len(rows)
            except Exception as exc:
                errors.append(f"feed_cache: {str(exc)[:180]}")

        if name == MARKZINE_SOURCE:
            try:
                rows = fetch_markezine_feeder_rows()
                fresh.extend(rows)
                methods.append('markezine_feeder')
                method_counts['markezine_feeder'] = len(rows)
            except Exception as exc:
                errors.append(f"markezine_feeder: {str(exc)[:180]}")

        successful_secondary = []
        for spec in SECONDARY.get(name, []):
            try:
                rows = fetch_listing_rows(name, spec)
                fresh.extend(rows)
                methods.append(spec['name'])
                successful_secondary.append(spec['name'])
                method_counts[spec['name']] = len(rows)
            except Exception as exc:
                errors.append(f"{spec['name']}: {str(exc)[:180]}")

        dedup = {}
        for a in fresh:
            key = a['url']
            cur = dedup.get(key)
            if cur is None:
                dedup[key] = a
            else:
                cur['discovery'] = sorted(set((cur.get('discovery') or []) + (a.get('discovery') or [])))
                if a.get('summary') and len(a['summary']) > len(cur.get('summary') or ''):
                    cur['summary'] = a['summary']
                if a.get('published') and not cur.get('published'):
                    cur['published'] = a['published']
        fresh = list(dedup.values())
        all_fresh.extend(fresh)

        has_secondary = bool(SECONDARY.get(name))
        if name == 'ウェブ電通報／ビジネスにもっとアイデアを。' and 'official_listing' in methods:
            coverage_status = 'enhanced'
        elif name == MARKZINE_SOURCE:
            # Feeder protects against RSS roll-off, but it is not independent proof that the
            # official /article and /column listings were exhaustively captured.
            coverage_status = 'enhanced' if successful_secondary else ('partial' if methods else 'unverified')
        elif has_secondary and successful_secondary and 'feed_cache' in methods:
            coverage_status = 'enhanced'
        elif has_secondary and successful_secondary:
            coverage_status = 'enhanced'
        elif has_secondary and methods:
            coverage_status = 'partial'
        elif 'feed_cache' in methods and (fresh or any(k[0] == name for k in by_key)):
            coverage_status = 'cached'
        elif methods:
            coverage_status = 'unverified'
        else:
            coverage_status = 'partial'

        source_meta[name] = {
            'coverage_status': coverage_status,
            'methods': methods,
            'method_counts': method_counts,
            'errors': errors,
            'discovered_this_run': len(fresh),
            'cached_count': 0,
        }

    stamp = now.isoformat()
    for a in all_fresh:
        key = (a['source'], a['url'])
        cur = by_key.get(key, {})
        cur['source'] = a['source']
        cur['url'] = a['url']
        if a.get('title'):
            cur['title'] = a['title']
        if a.get('summary') and len(a['summary']) >= len(cur.get('summary') or ''):
            cur['summary'] = a['summary']
        if a.get('published'):
            cur['published'] = a['published']
        cur['first_seen'] = cur.get('first_seen') or stamp
        cur['last_seen'] = stamp
        cur['discovery'] = sorted(set((cur.get('discovery') or []) + (a.get('discovery') or [])))
        by_key[key] = cur

    cutoff = now - timedelta(days=RETENTION_DAYS)
    kept = []
    for a in by_key.values():
        dt = parse_dt(a.get('published')) or parse_dt(a.get('first_seen'))
        if not dt or dt >= cutoff:
            kept.append(a)
    kept.sort(key=lambda a: (a.get('published') or a.get('first_seen') or ''), reverse=True)

    counts = {}
    for a in kept:
        counts[a['source']] = counts.get(a['source'], 0) + 1
    for name, meta in source_meta.items():
        meta['cached_count'] = counts.get(name, 0)
        if meta['coverage_status'] == 'unverified' and meta['cached_count']:
            meta['coverage_status'] = 'cached'

    payload = {
        'generated_at': stamp,
        'tracking_start': TRACKING_START.date().isoformat(),
        'retention_days': RETENTION_DAYS,
        'purpose': 'lightweight URL/title/date discovery cache; semantic screening remains weekly',
        'source_meta': source_meta,
        'articles': kept,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Source discovery cache: {len(kept)} articles across {len(source_meta)} sources")
    for name, meta in source_meta.items():
        print(f"  {name}: {meta['coverage_status']} | fresh={meta['discovered_this_run']} cached={meta['cached_count']} methods={','.join(meta['methods']) or '-'}")
        for err in meta['errors']:
            print(f"    WARN {err}")
    return payload


if __name__ == '__main__':
    update_cache()
