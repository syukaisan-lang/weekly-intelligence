"""Give evidence-poor recent articles one bounded, robots-aware public read.

No API model or private feedback leaves this process. Encrypted, previously
backed-up feedback only changes the order of public fetch attempts.
"""
from __future__ import annotations

import base64
import json
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
MAX_ATTEMPTS = 48  # Fetch budget, never a recommendation quota.
MAX_PER_HOST = 6
RETRY_DAYS = 7
MAX_SECONDS = 150
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
        last = datetime.fromisoformat(str(a.get('free_public_retry_at') or '').replace('Z', '+00:00'))
        return now - last >= timedelta(days=RETRY_DAYS)
    except (ValueError, TypeError):
        return True


def select(rows, ids, state, now=None, max_attempts=MAX_ATTEMPTS):
    now = now or datetime.now(timezone.utc)
    examples = feedback_examples(rows, state)
    ranked = sorted((a for a in rows if str(a.get('id')) in ids and due(a, now)
                     and str(a.get('url') or '').startswith(('https://', 'http://'))
                     and urlsplit(a['url']).hostname != 'xtrend.nikkei.com'),
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
    return picked


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
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside']):
            element.decompose()
        text = feeds.clean(' '.join(p.get_text(' ', strip=True)
                                    for p in soup.select('article p, main p, .article p, .entry-content p')))
        return text[:12000], bool(text), None if text else '未抽取到正文'
    return '', False, '跳转次数过多'


def main():
    import update_feeds as feeds
    import update_feeds_coverage as coverage
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
        if not robots_allow(parts.netloc, parts.scheme, url):
            counts['robots_blocked'] += 1
            a['free_public_retry_status'] = 'robots_or_unavailable'
            continue
        now = datetime.now(timezone.utc).isoformat()
        a['free_public_retry_at'] = now
        counts['attempted'] += 1
        content, checked, error = fetch_public_text(url, feeds)
        if error == 'robots_or_unavailable':
            counts['robots_blocked'] += 1
            a['free_public_retry_status'] = 'robots_or_unavailable'
            continue
        if checked and content and len(content) > len(a.get('content_excerpt') or ''):
            a['content_excerpt'] = content[:5000]
            a['content_checked'] = True
            a['content_char_count'] = len(''.join(content.split()))
            a['content_completeness'], a['content_completeness_reason'] = coverage.classify_content_completeness(content)
            a['free_public_retry_status'] = 'readable'
            counts['readable'] += 1
        else:
            a['free_public_retry_status'] = 'unavailable'
            counts['unavailable'] += 1
            if error and not a.get('screening_note'):
                a['screening_note'] = f'公开正文暂不可读：{str(error)[:100]}'
    counts['checked_at'] = datetime.now(timezone.utc).isoformat()
    counts['time_budget_exhausted'] = time.monotonic() >= deadline
    payload.setdefault('meta', {})['free_public_retry_audit'] = counts
    ARTICLES.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(counts, ensure_ascii=False))


if __name__ == '__main__':
    main()
