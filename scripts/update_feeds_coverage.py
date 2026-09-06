#!/usr/bin/env python3
"""Weekly v19: daily discovery cache + weekly semantic screening + explicit coverage audit."""
from __future__ import annotations

import json
import re
from types import SimpleNamespace

import update_feeds_temporal as t
import update_source_discovery as discovery
import enrich_xtrend_reading_time as xtrend_reading
import enrich_reading_time_estimates as reading_time_estimates
import weekly_dedupe

CACHE_PATH = t.p.base.ROOT / 'data' / 'source_discovery.json'
_original_fetch_feed = t.p.base.fetch_feed
_original_fetch_text = t.p.base.fetch_text
_cache_payload = {'articles': [], 'source_meta': {}}
_content_char_counts = {}
_content_completeness = {}
PARTIAL_RE = re.compile(
    r'ここから先は|続き(?:は|を).{0,18}(?:会員|ログイン|購読|有料|登録)|'
    r'全文(?:を)?読む.{0,18}(?:会員|ログイン|購読|登録)|'
    r'(?:会員|有料会員|購読者)限定|ログインして.{0,18}(?:続き|全文)|'
    r'残り\s*\d+\s*(?:文字|ページ)|次のページ|この記事は\s*\d+\s*ページ',
    re.I,
)


def load_cache():
    global _cache_payload
    try:
        _cache_payload = json.loads(CACHE_PATH.read_text(encoding='utf-8'))
    except Exception:
        _cache_payload = {'articles': [], 'source_meta': {}}
    return _cache_payload


def cache_entries(source_name):
    out = []
    for a in _cache_payload.get('articles') or []:
        if a.get('source') != source_name:
            continue
        out.append(SimpleNamespace(
            title=a.get('title') or '',
            link=a.get('url') or '',
            summary=a.get('summary') or '',
            description=a.get('summary') or '',
            published=a.get('published'),
            updated=None,
            created=None,
            published_parsed=None,
            updated_parsed=None,
            created_parsed=None,
        ))
    return out


def fetch_feed_with_discovery_cache(src):
    cached = cache_entries(src.get('name'))
    live = []
    live_error = None
    try:
        feed = _original_fetch_feed(src)
        live = list(getattr(feed, 'entries', []) or [])
    except Exception as exc:
        live_error = exc
        if not cached:
            raise

    merged = []
    seen = set()
    for e in live + cached:
        url = t.p.base.norm_url(getattr(e, 'link', '') or '')
        title = t.p.base.clean(getattr(e, 'title', '') or '')
        if not url or not title or url in seen:
            continue
        seen.add(url)
        merged.append(e)
    if live_error:
        print(f"Feed live fetch failed but rolling discovery cache recovered {src.get('name')}: {str(live_error)[:140]}")
    return SimpleNamespace(entries=merged)


def classify_content_completeness(content: str) -> tuple[str, str]:
    compact = ''.join(str(content or '').split())
    if PARTIAL_RE.search(content or ''):
        return 'partial', 'public_page_signals_paywall_or_continuation'
    # The base extractor currently returns at most 12k characters. Near the cap means the end of the
    # real article is unknown, so do not claim that the whole body was captured.
    if len(compact) >= 11800:
        return 'unknown', 'extractor_length_cap_reached'
    if len(compact) < 240:
        return 'unknown', 'extracted_body_too_short_to_verify'
    return 'full', 'extracted_body_finished_without_partial_marker'


def fetch_text_with_metrics(url):
    content, checked, error = _original_fetch_text(url)
    if checked and content:
        key = t.p.base.norm_url(url)
        if key:
            _content_char_counts[key] = len(''.join(str(content).split()))
            completeness, reason = classify_content_completeness(content)
            _content_completeness[key] = {'status': completeness, 'reason': reason}
    return content, checked, error


def apply_content_char_counts():
    """Persist body length plus completeness; keep function name for compatibility with existing CI."""
    if (not _content_char_counts and not _content_completeness) or not t.p.base.ART_PATH.exists():
        return 0
    payload = json.loads(t.p.base.ART_PATH.read_text(encoding='utf-8'))
    changed = 0
    for article in payload.get('articles') or []:
        key = t.p.base.norm_url(article.get('url') or '')
        count = int(_content_char_counts.get(key) or 0)
        meta = _content_completeness.get(key) or {}
        row_changed = False
        if count > 0 and int(article.get('content_char_count') or 0) != count:
            article['content_char_count'] = count
            row_changed = True
        if meta.get('status') and article.get('content_completeness') != meta['status']:
            article['content_completeness'] = meta['status']
            row_changed = True
        if meta.get('reason') and article.get('content_completeness_reason') != meta['reason']:
            article['content_completeness_reason'] = meta['reason']
            row_changed = True
        if row_changed:
            changed += 1
    if changed:
        t.p.base.ART_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Body metrics captured: {changed}; completeness={len(_content_completeness)}')
    return changed


def annotate_coverage():
    if not t.p.base.STATUS_PATH.exists():
        return
    status = json.loads(t.p.base.STATUS_PATH.read_text(encoding='utf-8'))
    meta_by_source = (_cache_payload.get('source_meta') or {})
    counts = {'enhanced': 0, 'cached': 0, 'partial': 0, 'unverified': 0}
    for rec in status.get('sources') or []:
        name = rec.get('name') or ''
        meta = dict(meta_by_source.get(name) or {})
        if name == t.XTREND_SOURCE:
            meta = {
                'coverage_status': 'enhanced',
                'methods': ['official_rss', 'feeder', 'rolling_cache', 'direct_listing'],
                'cached_count': 0,
                'errors': [],
            }
        coverage = meta.get('coverage_status') or 'unverified'
        if coverage not in counts:
            coverage = 'unverified'
        counts[coverage] += 1
        rec['coverage_status'] = coverage
        rec['coverage_methods'] = meta.get('methods') or []
        rec['coverage_cached_count'] = int(meta.get('cached_count') or 0)
        rec['coverage_errors'] = meta.get('errors') or []
    status['coverage_audit'] = {
        'generated_at': _cache_payload.get('generated_at'),
        'retention_days': _cache_payload.get('retention_days') or 45,
        'tracking_start': _cache_payload.get('tracking_start') or '2026-08-10',
        'enhanced_count': counts['enhanced'],
        'cached_count': counts['cached'],
        'partial_count': counts['partial'],
        'unverified_count': counts['unverified'],
        'meaning': {
            'transport': 'status=ok means this weekly ingestion completed',
            'enhanced': 'RSS/listing or multiple independent discovery paths plus rolling cache',
            'cached': 'daily rolling RSS discovery protects against weekly feed rollover but lacks independent listing verification',
            'partial': 'one or more configured discovery paths failed or only partial coverage is available',
            'unverified': 'request may succeed but publication completeness is not independently verified',
        },
    }
    t.p.base.STATUS_PATH.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    discovery.update_cache()
    load_cache()
    t.p.base.fetch_feed = fetch_feed_with_discovery_cache
    t.p.base.fetch_text = fetch_text_with_metrics

    original_sources = list(t.p.base.SOURCES)
    prepared, source_counts = t.lifecycle.prepare_sources(original_sources)
    # Discovery must always cover every configured source. Adaptive source control may raise the
    # deep-read threshold, but it must never remove a source from title/summary/RSS discovery.
    t.p.base.SOURCES = prepared
    t.p.base.heuristic = t.adaptive_pre_read_heuristic
    t.p.deep_read_semantic_candidates = t.adaptive_semantic_deep_read

    t.p.base.main()
    apply_content_char_counts()
    # Exact/canonical URL identity happens in base.main(). This conservative second pass suppresses
    # same-story aliases across publishers before semantic rescoring, without rewriting old IDs.
    weekly_dedupe.apply(t.p.base.ART_PATH, t.p.base.STATUS_PATH)
    t.enrich_xtrend_from_feeder_cache()
    xtrend_reading.apply_reading_times()
    t.lifecycle.refresh_hot_only(t.p.refresh_existing_scores)
    apply_content_char_counts()
    reading_time_estimates.apply_estimates()
    t.mark_version()
    storage_counts = t.lifecycle.compact_articles()
    t.lifecycle.annotate_status(source_counts, storage_counts)
    annotate_coverage()


if __name__ == '__main__':
    main()
