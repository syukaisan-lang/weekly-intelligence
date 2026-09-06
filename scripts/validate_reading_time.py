#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def text(path: str) -> str:
    p = ROOT / path
    if not p.exists():
        raise AssertionError(f'missing: {path}')
    return p.read_text(encoding='utf-8')


def need(path: str, *needles: str) -> str:
    raw = text(path)
    for n in needles:
        if n not in raw:
            raise AssertionError(f'{path} must contain: {n}')
    return raw


def main() -> int:
    xtrend = need(
        'scripts/enrich_xtrend_reading_time.py',
        'reading_time_source',
        'xtrend_official',
        'reading_time_confidence',
        'timeRequired',
        'application/ld+json',
        'parse_miss',
        "decode('utf-8', errors='replace')",
        'fetch_variants',
    )
    if 'MAX_FETCH = 60' in xtrend:
        raise AssertionError('XTrend backfill cap must not regress to the old 60-item limit')

    estimates = need(
        'scripts/enrich_reading_time_estimates.py',
        'estimated_reading_minutes',
        'reading_time_estimate_source',
        'content_char_count',
        'body_full',
        'source_format_prior',
    )

    coverage = need(
        'scripts/update_feeds_coverage.py',
        'fetch_text_with_metrics',
        '_content_char_counts',
        "article['content_char_count']",
        'reading_time_estimates.apply_estimates()',
        'xtrend_reading.apply_reading_times()',
        't.p.base.SOURCES = prepared',
    )
    if "[s for s in prepared if not s.get('_adaptive_skip')]" in coverage:
        raise AssertionError('Weekly discovery must not drop sources before reading-time enrichment')

    ui = need(
        'weekly-reading-time-v21.js',
        'readingTimeInfo',
        'XTrend官方',
        'reading_time_source',
        'content_char_count',
        'sourcePrior',
        'estimated_reading_minutes',
    )
    if 'Math.min(20,Math.round(explicit))' in ui:
        raise AssertionError('Official reading times must not be capped at 20 minutes')

    index = need('index.html', 'weekly-reading-time-v21.js?v=20260906-0952')
    workflow = need(
        '.github/workflows/update.yml',
        'scripts/enrich_xtrend_reading_time.py',
        'scripts/enrich_reading_time_estimates.py',
    )
    print('Reading-time validation passed: XTrend official-first extraction, body-length estimates, source-aware fallback, UI confidence labels.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
