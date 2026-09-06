#!/usr/bin/env python3
from __future__ import annotations

import html as html_lib
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
MAX_FETCH = 80
READING_PATTERNS = [
    re.compile(r'読了時間\s*(?:の?目安)?\s*[:：]?\s*(?:約\s*)?(\d{1,3})\s*分', re.I),
    re.compile(r'読了(?:目安|時間)?\s*[:：]?\s*(?:約\s*)?(\d{1,3})\s*分', re.I),
    re.compile(r'(?:この記事|本記事)は?\s*(?:約\s*)?(\d{1,3})\s*分(?:ほど)?で読', re.I),
    re.compile(r'(?:読む|読了)(?:の)?に\s*(?:約\s*)?(\d{1,3})\s*分', re.I),
]
ISO_DURATION_RE = re.compile(r'PT(?:(\d{1,2})H)?(?:(\d{1,3})M)?', re.I)
SCRIPT_PATTERNS = [
    re.compile(r'["\'](?:readingTime|readTime|estimatedReadingTime|reading_time)["\']\s*[:=]\s*["\']?(\d{1,3})', re.I),
    re.compile(r'data-(?:reading|read)-time\s*=\s*["\'](\d{1,3})', re.I),
    re.compile(r'["\']timeRequired["\']\s*:\s*["\'](PT[^"\']+)', re.I),
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


def valid_minutes(value) -> int | None:
    try:
        n = int(value)
    except Exception:
        return None
    return n if 1 <= n <= 120 else None


def minutes_from_duration(value: str) -> int | None:
    m = ISO_DURATION_RE.search(str(value or ''))
    if not m:
        return None
    hours = int(m.group(1) or 0)
    mins = int(m.group(2) or 0)
    return valid_minutes(hours * 60 + mins)


def _json_time_required(value) -> int | None:
    if isinstance(value, dict):
        for k, v in value.items():
            if str(k).lower() in {'timerequired', 'readingtime', 'readtime', 'estimatedreadingtime'}:
                if isinstance(v, (int, float)):
                    found = valid_minutes(v)
                else:
                    found = minutes_from_duration(str(v)) or valid_minutes(re.sub(r'\D+', '', str(v)))
                if found:
                    return found
            found = _json_time_required(v)
            if found:
                return found
    elif isinstance(value, list):
        for v in value:
            found = _json_time_required(v)
            if found:
                return found
    return None


def parse_minutes(html_text: str) -> int | None:
    if not html_text:
        return None
    raw = html_lib.unescape(html_text)
    soup = BeautifulSoup(raw, 'html.parser')
    visible = re.sub(r'\s+', ' ', soup.get_text(' ', strip=True))

    # 1) Human-visible Japanese label, including cases where label/value are split across tags.
    for text in (visible, raw):
        for pattern in READING_PATTERNS:
            m = pattern.search(text)
            if m:
                found = valid_minutes(m.group(1))
                if found:
                    return found

    # 2) Structured JSON-LD / embedded app state.
    for node in soup.find_all('script'):
        body = node.string or node.get_text(' ', strip=False) or ''
        if not body:
            continue
        if (node.get('type') or '').lower() == 'application/ld+json':
            try:
                found = _json_time_required(json.loads(body))
                if found:
                    return found
            except Exception:
                pass
        for pattern in SCRIPT_PATTERNS:
            m = pattern.search(body)
            if not m:
                continue
            if 'timeRequired' in pattern.pattern:
                found = minutes_from_duration(m.group(1))
            else:
                found = valid_minutes(m.group(1))
            if found:
                return found

    # 3) Raw HTML attributes / serialized state outside script tags.
    for pattern in SCRIPT_PATTERNS:
        m = pattern.search(raw)
        if not m:
            continue
        if 'timeRequired' in pattern.pattern:
            found = minutes_from_duration(m.group(1))
        else:
            found = valid_minutes(m.group(1))
        if found:
            return found
    return None


def diagnostic_hint(html_text: str) -> str:
    text = html_lib.unescape(html_text or '')
    soup = BeautifulSoup(text, 'html.parser')
    visible = re.sub(r'\s+', ' ', soup.get_text(' ', strip=True))
    for needle in ('読了', 'timeRequired', 'readingTime', 'readTime'):
        i = visible.find(needle)
        if i >= 0:
            return re.sub(r'\s+', ' ', visible[max(0, i - 60):i + 180])[:220]
        i = text.find(needle)
        if i >= 0:
            return re.sub(r'\s+', ' ', text[max(0, i - 60):i + 180])[:220]
    title = soup.title.get_text(' ', strip=True) if soup.title else ''
    return ('no reading-time marker; title=' + title)[:220]


def fetch_variants(url: str) -> list[str]:
    base = norm_xtrend(url)
    if not base:
        return []
    out = [base + '/', base]
    original = str(url or '').split('#', 1)[0].split('?', 1)[0]
    if original and original not in out:
        out.append(original)
    return out


def fetch_minutes(url: str) -> tuple[int | None, str | None, str | None]:
    errors = []
    headers = {
        'User-Agent': UA,
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.6',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://xtrend.nikkei.com/atcl/contents/new/',
        'Cache-Control': 'no-cache',
    }
    for candidate in fetch_variants(url):
        try:
            r = requests.get(candidate, headers=headers, timeout=18, allow_redirects=True)
            if r.status_code != 200:
                errors.append(f'{candidate} HTTP {r.status_code}')
                continue
            # XTrend pages are UTF-8; explicit decode avoids requests guessing ISO-8859-1 and
            # turning the Japanese "読了時間" label into mojibake.
            text = r.content.decode('utf-8', errors='replace')
            minutes = parse_minutes(text)
            if minutes:
                return minutes, None, r.url
            errors.append(f'{candidate} parse_miss: {diagnostic_hint(text)}')
        except Exception as exc:
            errors.append(f'{candidate} {str(exc)[:120]}')
    return None, ' | '.join(errors)[:700] or 'no fetch variants', None


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
        minutes, error, fetched_url = fetch_minutes(url)
        article['reading_time_xtrend_checked_at'] = now
        if minutes:
            article['reading_time_minutes'] = minutes
            article['reading_time_source'] = 'xtrend_official'
            article['reading_time_confidence'] = 'official'
            if fetched_url:
                article['reading_time_fetched_url'] = fetched_url
            article.pop('reading_time_xtrend_error', None)
            updated += 1
            print(f'XTrend reading time: {minutes} min | {article.get("title", "")[:90]}')
        else:
            failed += 1
            article['reading_time_xtrend_error'] = error or 'parse_miss'
            if failed <= 5:
                print(f'XTrend reading time miss: {article.get("title", "")[:80]} | {article["reading_time_xtrend_error"][:360]}')

    if checked:
        meta = payload.setdefault('meta', {})
        meta['xtrend_reading_time_direct'] = True
        meta['xtrend_reading_time_checked_at'] = now
        meta['xtrend_reading_time_checked_count'] = checked
        meta['xtrend_reading_time_updated_count'] = updated
        meta['xtrend_reading_time_failed_count'] = failed
        ART_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'XTrend reading time direct read: checked={checked}, updated={updated}, failed={failed}')
    return {'checked': checked, 'updated': updated, 'failed': failed}


if __name__ == '__main__':
    apply_reading_times()
