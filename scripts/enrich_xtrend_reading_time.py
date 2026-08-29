#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
ART_PATH = ROOT / 'data' / 'articles.json'
XTREND_SOURCE = '日経クロストレンド 新着'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
MAX_FETCH = 60
READING_PATTERNS = [
    re.compile(r'読了時間\s*[:：]?\s*(?:約\s*)?(\d{1,3})\s*分', re.I),
    re.compile(r'(?:この記事|本記事)は?\s*(?:約\s*)?(\d{1,3})\s*分(?:ほど)?で読', re.I),
]


def norm_xtrend(url: str) -> str:
    try:
        p = urlsplit(url or '')
        host = p.netloc.lower().split(':', 1)[0]
        if host != 'xtrend.nikkei.com' or '/atcl/' not in (p.path or ''):
            return ''
        return urlunsplit(('https', 'xtrend.nikkei.com', (p.path or '').rstrip('/'), '', ''))
    except Exception:
        return ''


def parse_minutes(html_text: str) -> int | None:
    if not html_text:
        return None
    # Search both raw HTML and visible text because XTrend may render the label in a compact metadata block.
    soup = BeautifulSoup(html_text, 'html.parser')
    visible = re.sub(r'\s+', ' ', soup.get_text(' ', strip=True))
    candidates = [visible, html_text]
    for text in candidates:
        for pattern in READING_PATTERNS:
            m = pattern.search(text)
            if not m:
                continue
            value = int(m.group(1))
            if 1 <= value <= 120:
                return value
    return None


def fetch_minutes(url: str) -> tuple[int | None, str | None]:
    try:
        r = requests.get(
            url,
            headers={'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.7'},
            timeout=18,
            allow_redirects=True,
        )
        if r.status_code != 200:
            return None, f'HTTP {r.status_code}'
        return parse_minutes(r.text), None
    except Exception as exc:
        return None, str(exc)[:160]


def article_sort_key(a: dict) -> str:
    return str(a.get('first_seen') or a.get('published') or '')


def apply_reading_times(max_fetch: int = MAX_FETCH) -> dict:
    if not ART_PATH.exists():
        return {'checked': 0, 'updated': 0, 'failed': 0}
    payload = json.loads(ART_PATH.read_text(encoding='utf-8'))
    articles = payload.get('articles') or []
    candidates = [
        a for a in articles
        if a.get('source') == XTREND_SOURCE
        and norm_xtrend(a.get('url', ''))
        and not (1 <= int(a.get('reading_time_minutes') or 0) <= 120)
    ]
    candidates.sort(key=article_sort_key, reverse=True)

    checked = updated = failed = 0
    now = datetime.now(timezone.utc).isoformat()
    for article in candidates[:max_fetch]:
        url = norm_xtrend(article.get('url', ''))
        if not url:
            continue
        checked += 1
        minutes, error = fetch_minutes(url)
        article['reading_time_xtrend_checked_at'] = now
        if minutes:
            article['reading_time_minutes'] = minutes
            article['reading_time_source'] = 'xtrend_official'
            updated += 1
            print(f'XTrend reading time: {minutes} min | {article.get("title", "")[:90]}')
        else:
            failed += 1
            if error:
                article['reading_time_xtrend_error'] = error

    if checked:
        meta = payload.setdefault('meta', {})
        meta['xtrend_reading_time_direct'] = True
        meta['xtrend_reading_time_checked_at'] = now
        ART_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'XTrend reading time direct read: checked={checked}, updated={updated}, failed={failed}')
    return {'checked': checked, 'updated': updated, 'failed': failed}


if __name__ == '__main__':
    apply_reading_times()
