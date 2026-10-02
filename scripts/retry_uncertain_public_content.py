"""Give evidence-poor recent articles one bounded, robots-aware public read.

No API model or private feedback leaves this process. Encrypted, previously
backed-up feedback only changes the order of public fetch attempts.
"""
from __future__ import annotations

import base64
import json
import re
import subprocess
import time
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ARTICLES = ROOT / 'data' / 'articles.json'
MAX_ATTEMPTS = 288  # Fetch budget, never a recommendation quota.
MAX_PER_HOST = 48
RETRY_DAYS = 7
MAX_SECONDS = 600
USER_AGENT = 'Mozilla/5.0 (compatible; PersonalReadingDashboard/1.0)'


def candidate_ids(path=ARTICLES):
    result = subprocess.run(
        ['node', str(ROOT / 'scripts' / 'free_review_candidates.cjs'), str(path)],
        check=True, capture_output=True, text=True, timeout=30,
    )
    return set(json.loads(result.stdout))


def vector(a):
    v = a.get('semantic_vector') or {}
    if v.get('dim') != 384 or not v.get('q'):
        return None
    try:
        x = np.frombuffer(base64.b64decode(v['q'], validate=True), dtype=np.int8)
        if x.size != 384:
            return None
        x = x.astype(np.float32)
        norm = np.linalg.norm(x)
        return x / norm if norm else None
    except (ValueError, TypeError):
        return None


def feedback_examples(rows, state):
    """Only restored encrypted feedback; no IDs or preferences are published."""
    examples = []
    for a in rows:
        s = state.get(str(a.get('id'))) or {}
        if not s:
            continue
        negative = s.get('feedback') in ('bad', 'less')
        skipped = s.get('status') == 'skip'
        positive = (s.get('status') == 'later' or s.get('later_interest_at')
                    or s.get('feedback_reason') == 'manual_b_pick'
                    or s.get('status') == 'save' or s.get('feedback') in ('accurate', 'more'))
        if not negative and not positive and not skipped:
            continue
        v = vector(a)
        if v is not None:
            examples.append((v, -1 if negative else -.25 if skipped else 1))
    return examples


def rank(a, examples):
    summary = str(a.get('summary') or '')
    # Summary richness is a fallback, not evidence of reading value.
    score = min(len(summary), 500) / 500 + max(0, float(a.get('retrieval_reading_score') or 5) - 5) * .06
    if any(x in summary for x in ('新着一覧', '今すぐフォロー', '最新の投稿')):
        score -= 2
    v = vector(a)
    if v is not None:
        pos = neg = 0.0
        for historical, polarity in examples:
            similarity = float(np.dot(v, historical))
            closeness = max(0.0, min(1.0, (similarity - .925) / .065))
            if polarity > 0:
                pos = max(pos, closeness)
            else:
                neg = max(neg, closeness * abs(polarity))
        score += 1.4 * pos - 1.7 * neg
    return score


def due(a, now):
    try:
        if a.get('free_public_retry_next_at'):
            return now >= datetime.fromisoformat(a['free_public_retry_next_at'])
        last = datetime.fromisoformat(str(a.get('free_public_retry_at') or '').replace('Z', '+00:00'))
        status = a.get('free_public_retry_status')
        wait = timedelta(days=RETRY_DAYS) if status in ('robots_or_unavailable', 'access_restricted', 'paywall') else timedelta(hours=6)
        return now - last >= wait
    except (ValueError, TypeError):
        return True


def select(rows, ids, state, now=None, max_attempts=MAX_ATTEMPTS):
    now = now or datetime.now(timezone.utc)
    examples = feedback_examples(rows, state)
    ranked = sorted((a for a in rows if str(a.get('id')) in ids and due(a, now)
                     and str(a.get('url') or '').startswith(('https://', 'http://'))
                     ),
                    key=lambda a: (-rank(a, examples), str(a.get('id'))))
    picked, host_counts = [], {}
    for a in ranked:
        host = urlsplit(a['url']).hostname or ''
        if not host or host_counts.get(host, 0) >= MAX_PER_HOST:
            continue
        picked.append(a)
        host_counts[host] = host_counts.get(host, 0) + 1
        if len(picked) >= max_attempts:
            break
    # Interleave hosts so one slow site cannot consume the whole time budget.
    groups = {}
    for a in picked:
        groups.setdefault(urlsplit(a['url']).hostname, []).append(a)
    return [group[i] for i in range(max((len(g) for g in groups.values()), default=0))
            for group in groups.values() if i < len(group)]


@lru_cache(maxsize=64)
def robots_rules(host, scheme):
    """Fail closed on missing/unreachable robots rules; no login or alternate URL."""
    try:
        request = Request(f'{scheme}://{host}/robots.txt', headers={'User-Agent': USER_AGENT})
        with urlopen(request, timeout=6) as response:
            if response.status != 200:
                return False
            content = response.read(512_000).decode('utf-8', errors='replace')
        parser = RobotFileParser()
        parser.parse(content.splitlines())
        return parser
    except HTTPError as exc:
        return exc.code == 404
    except (URLError, TimeoutError, OSError):
        return False


def robots_allow(host, scheme, url):
    rules = robots_rules(host, scheme)
    return rules is True or bool(rules and rules.can_fetch(USER_AGENT, url))


def fetch_public_text(url, feeds):
    """Check each redirect's robots policy before requesting its target."""
    current = url
    for _ in range(4):
        parts = urlsplit(current)
        if parts.scheme not in ('http', 'https') or not parts.netloc or not robots_allow(parts.netloc, parts.scheme, current):
            return '', False, 'robots_or_unavailable'
        try:
            response = feeds.requests.get(current, headers={'User-Agent': USER_AGENT}, timeout=12,
                                           allow_redirects=False)
        except feeds.requests.RequestException as exc:
            return '', False, str(exc)[:120]
        if response.status_code in (301, 302, 303, 307, 308) and response.headers.get('Location'):
            current = urljoin(current, response.headers['Location'])
            continue
        if response.status_code != 200:
            return '', False, f'HTTP {response.status_code}'
        if 'html' not in response.headers.get('content-type', ''):
            return '', False, '非HTML正文'
        soup = feeds.BeautifulSoup(response.text, 'html.parser')
        paid = bool(re.search(r'"isAccessibleForFree"\s*:\s*(?:false|"false")', response.text, re.I))
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside']):
            element.decompose()
        selectors = ['.article-body', '.articleBody', '.article-body__content', '.article__body',
                     '#article-body', '#cmsBody', '.entry-content', '[itemprop="articleBody"]', 'article', 'main']
        chunks = []
        for selector in selectors:
            nodes = soup.select(selector)
            if nodes:
                chunks = [n.get_text(' ', strip=True) for n in nodes]
                if len(' '.join(chunks)) >= 160:
                    break
        text = feeds.clean(' '.join(dict.fromkeys(chunks)))
        limited = paid or bool(re.search(r'会員限定|有料会員|ここから先は|ログインして.*(?:全文|続き)', text))
        return text[:12000], bool(text), 'paywall' if limited else None if text else '未抽取到正文'
    return '', False, '跳转次数过多'


def main():
    import update_feeds as feeds
    import weekly_lifecycle
    payload = json.loads(ARTICLES.read_text(encoding='utf-8'))
    rows = payload.get('articles') or []
    ids = candidate_ids()
    # The passphrase only unlocks an existing, user-initiated encrypted backup.
    state = weekly_lifecycle.decrypt_weekly_state()
    picked = select(rows, ids, state)
    counts = {'candidate': len(ids), 'queued': len(picked), 'attempted': 0,
              'readable': 0, 'robots_blocked': 0, 'unavailable': 0}
    deadline = time.monotonic() + MAX_SECONDS
    for a in picked:
        if time.monotonic() >= deadline:
            break
        url = a['url']
        parts = urlsplit(url)
        now = datetime.now(timezone.utc).isoformat()
        a['free_public_retry_at'] = now
        a['free_public_retry_attempts'] = int(a.get('free_public_retry_attempts') or 0) + 1
        counts['attempted'] += 1
        content, checked, error = fetch_public_text(url, feeds)
        a['free_public_retry_error'] = error or ''
        wait_hours = 168 if error in ('robots_or_unavailable', 'paywall', 'HTTP 403', 'HTTP 401', 'HTTP 404') else 24 if error == '未抽取到正文' else 6
        if error and wait_hours == 6:
            wait_hours = min(72, 6 * 2 ** min(4, a['free_public_retry_attempts'] - 1))
        a['free_public_retry_next_at'] = (datetime.now(timezone.utc) + timedelta(hours=wait_hours)).isoformat()
        if error == 'robots_or_unavailable':
            counts['robots_blocked'] += 1
            a['free_public_retry_status'] = 'robots_or_unavailable'
            continue
        if checked and content and len(content) > len(a.get('content_excerpt') or ''):
            a['content_excerpt'] = content[:5000]
            a['content_checked'] = True
            a['content_char_count'] = len(''.join(content.split()))
            partial = error == 'paywall' or bool(re.search(r'次のページ|残り\s*\d+\s*文字|続きを読む', content))
            a['content_completeness'] = 'partial' if partial else 'unknown' if len(content) >= 11800 or len(content) < 240 else 'full'
            a['content_completeness_reason'] = 'public_paywall_or_continuation' if partial else 'public_extracted_body'
            a['free_public_retry_status'] = 'paywall' if error == 'paywall' else 'readable'
            counts['readable'] += 1
        else:
            a['free_public_retry_status'] = 'paywall' if error == 'paywall' else 'access_restricted' if error in ('HTTP 403', 'HTTP 401') else 'unavailable'
            counts['unavailable'] += 1
            if error and not a.get('screening_note'):
                a['screening_note'] = f'公开正文暂不可读：{str(error)[:100]}'
    counts['checked_at'] = datetime.now(timezone.utc).isoformat()
    counts['time_budget_exhausted'] = time.monotonic() >= deadline
    ARTICLES.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    remaining_ids = candidate_ids()
    remaining = [a for a in rows if str(a.get('id')) in remaining_ids]
    counts['remaining'] = len(remaining)
    counts['remaining_due'] = sum(due(a, datetime.now(timezone.utc)) for a in remaining)
    counts['remaining_by_status'] = {s: sum(a.get('free_public_retry_status', 'not_attempted') == s for a in remaining)
                                     for s in sorted({a.get('free_public_retry_status', 'not_attempted') for a in remaining})}
    payload.setdefault('meta', {})['free_public_retry_audit'] = counts
    ARTICLES.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(counts, ensure_ascii=False))


if __name__ == '__main__':
    main()
