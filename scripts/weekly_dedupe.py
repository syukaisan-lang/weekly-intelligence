#!/usr/bin/env python3
"""Conservative Weekly near-duplicate suppression for newly ingested articles.

Exact/canonical URL remains the primary identity in update_feeds.py. This pass only removes
newly-added cross-source aliases when titles are effectively the same story, preserving older
article IDs so browser reading state is never orphaned.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import urlsplit

DAY = 86400


def _ts(value: object) -> float:
    try:
        return datetime.fromisoformat(str(value or '').replace('Z', '+00:00')).timestamp()
    except Exception:
        return 0.0


def _title(value: object) -> str:
    text = unicodedata.normalize('NFKC', str(value or '')).lower()
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'[\s\u3000]+', '', text)
    text = re.sub(r'[「」『』【】\[\]（）()〈〉《》“”"\'’‘・:：,，.。!！?？/／\\|｜_—–―〜~+＋=＝]', '', text)
    return text.strip()


def _bigrams(text: str) -> set[str]:
    return {text[i:i+2] for i in range(max(0, len(text)-1))}


def _numbers(text: object) -> tuple[str, ...]:
    return tuple(re.findall(r'\d+', unicodedata.normalize('NFKC', str(text or ''))))


def _same_story(a: dict, b: dict) -> tuple[bool, float, str]:
    ta, tb = _title(a.get('title')), _title(b.get('title'))
    if not ta or not tb:
        return False, 0.0, ''
    if ta == tb and len(ta) >= 10:
        return True, 1.0, 'exact_title'
    if min(len(ta), len(tb)) < 16:
        return False, 0.0, ''

    # Similar-number recurring columns are a common false-positive source. If the numeric
    # identifiers differ, require virtually identical text rather than ordinary fuzzy matching.
    na, nb = _numbers(a.get('title')), _numbers(b.get('title'))
    ratio = SequenceMatcher(None, ta, tb, autojunk=False).ratio()
    if na and nb and na != nb and ratio < .975:
        return False, ratio, ''

    short, long = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    containment = short in long and len(short) / max(1, len(long)) >= .84
    ba, bb = _bigrams(ta), _bigrams(tb)
    jaccard = len(ba & bb) / max(1, len(ba | bb)) if ba and bb else 0.0
    if ratio >= .93 and jaccard >= .78:
        return True, max(ratio, jaccard), 'fuzzy_title'
    if containment and ratio >= .90:
        return True, ratio, 'contained_title'
    return False, max(ratio, jaccard), ''


def _date_close(a: dict, b: dict, exact: bool) -> bool:
    aa = _ts(a.get('published') or a.get('first_seen'))
    bb = _ts(b.get('published') or b.get('first_seen'))
    if not aa or not bb:
        return exact
    return abs(aa-bb) <= (14 if exact else 5) * DAY


def _domain(url: object) -> str:
    try:
        return urlsplit(str(url or '')).netloc.lower().removeprefix('www.')
    except Exception:
        return ''


def _merge_alias(rep: dict, dup: dict, method: str, similarity: float) -> None:
    sources = list(rep.get('duplicate_sources') or [])
    if dup.get('source') and dup.get('source') != rep.get('source') and dup.get('source') not in sources:
        sources.append(dup['source'])
    urls = list(rep.get('duplicate_urls') or [])
    if dup.get('url') and dup.get('url') != rep.get('url') and dup.get('url') not in urls:
        urls.append(dup['url'])
    if sources:
        rep['duplicate_sources'] = sources[:8]
    if urls:
        rep['duplicate_urls'] = urls[:8]
    rep['dedupe_method'] = method
    rep['dedupe_similarity'] = round(float(similarity), 3)
    # Keep the richer public summary without changing the representative ID/URL.
    if len(str(dup.get('summary') or '')) > len(str(rep.get('summary') or '')) * 1.25:
        rep['summary'] = dup.get('summary') or rep.get('summary')


def apply(articles_path: Path, status_path: Path) -> int:
    if not articles_path.exists():
        return 0
    doc = json.loads(articles_path.read_text(encoding='utf-8'))
    rows = list(doc.get('articles') or [])
    generated = _ts((doc.get('meta') or {}).get('generated_at')) or datetime.now(timezone.utc).timestamp()
    # first_seen is assigned by the current ingestion run. A generous 2h window tolerates slow CI.
    is_new = lambda a: bool(_ts(a.get('first_seen')) and abs(generated-_ts(a.get('first_seen'))) <= 2*3600)

    old = [a for a in rows if not is_new(a)]
    fresh = [a for a in rows if is_new(a)]
    kept_new: list[dict] = []
    removed = 0
    methods: dict[str, int] = {}

    # Preserve old IDs. For each new item, compare against older history and already-accepted
    # current-run items. Near-title dedupe is primarily cross-source/domain; exact title may also
    # clean duplicate feed entries from the same publisher.
    for a in fresh:
        match = None
        for b in old + kept_new:
            same_source = a.get('source') == b.get('source') and _domain(a.get('url')) == _domain(b.get('url'))
            ok, sim, method = _same_story(a, b)
            if not ok:
                continue
            if same_source and method != 'exact_title':
                continue
            if not _date_close(a, b, method == 'exact_title'):
                continue
            match = (b, sim, method)
            break
        if match:
            rep, sim, method = match
            _merge_alias(rep, a, method, sim)
            removed += 1
            methods[method] = methods.get(method, 0) + 1
        else:
            kept_new.append(a)

    if not removed:
        return 0

    keep_ids = {id(a) for a in old + kept_new}
    doc['articles'] = [a for a in rows if id(a) in keep_ids]
    meta = doc.setdefault('meta', {})
    meta['new_this_run'] = max(0, int(meta.get('new_this_run') or len(fresh)) - removed)
    meta['near_duplicate_removed_this_run'] = removed
    meta['dedupe_version'] = 'url+title-v1'
    articles_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding='utf-8')

    if status_path.exists():
        status = json.loads(status_path.read_text(encoding='utf-8'))
        status['deduped_count'] = max(0, int(status.get('raw_new_count') or 0) - removed)
        status['near_duplicate_count'] = removed
        status['dedupe_methods'] = methods
        status['dedupe_version'] = 'url+title-v1'
        status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Near-duplicate suppression removed {removed} current-run aliases: {methods}')
    return removed


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    apply(root/'data'/'articles.json', root/'data'/'source_status.json')
