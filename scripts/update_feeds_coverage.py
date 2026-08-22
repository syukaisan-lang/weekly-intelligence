#!/usr/bin/env python3
"""Weekly v19: daily discovery cache + weekly semantic screening + explicit coverage audit."""
from __future__ import annotations

import json
from types import SimpleNamespace

import update_feeds_temporal as t
import update_source_discovery as discovery

CACHE_PATH = t.p.base.ROOT / 'data' / 'source_discovery.json'
_original_fetch_feed = t.p.base.fetch_feed
_cache_payload = {'articles': [], 'source_meta': {}}


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

    original_sources = list(t.p.base.SOURCES)
    prepared, source_counts = t.lifecycle.prepare_sources(original_sources)
    t.p.base.SOURCES = [s for s in prepared if not s.get('_adaptive_skip')]
    t.p.base.heuristic = t.adaptive_pre_read_heuristic
    t.p.deep_read_semantic_candidates = t.adaptive_semantic_deep_read

    t.p.base.main()
    t.enrich_xtrend_from_feeder_cache()
    t.lifecycle.refresh_hot_only(t.p.refresh_existing_scores)
    t.mark_version()
    storage_counts = t.lifecycle.compact_articles()
    t.lifecycle.annotate_status(source_counts, storage_counts)
    annotate_coverage()


if __name__ == '__main__':
    main()
