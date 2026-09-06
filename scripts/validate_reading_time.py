#!/usr/bin/env python3
from pathlib import Path
import importlib.util

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


def load_estimator():
    path = ROOT / 'scripts' / 'enrich_reading_time_estimates.py'
    spec = importlib.util.spec_from_file_location('reading_time_estimator', path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


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
        'reading_time_estimate_confidence',
        'content_char_count',
        'body_full',
        'body_partial',
        'body_unknown',
        'v3_completeness_calibrated',
        'readingSpeed' if False else 'reading_speed',
    )
    if 'chars / 550.0' in estimates or 'math.ceil(mins)' in estimates:
        raise AssertionError('Old slow/always-round-up reading-time formula must not return')

    coverage = need(
        'scripts/update_feeds_coverage.py',
        'fetch_text_with_metrics',
        '_content_char_counts',
        '_content_completeness',
        'classify_content_completeness',
        "article['content_char_count']",
        "article['content_completeness']",
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
        '正文完整',
        '正文部分',
        '正文未确认完整',
        'reading_time_source',
        'content_char_count',
        'estimated_reading_minutes',
        'reading_time_estimate_confidence',
    )
    if 'Math.min(20,Math.round(explicit))' in ui:
        raise AssertionError('Official reading times must not be capped at 20 minutes')

    est = load_estimator()
    short_market_news = {
        'source': 'ネットショップ担当者フォーラム',
        'content_checked': True,
        'content_completeness': 'full',
        'content_char_count': 1400,
        'content_excerpt': '通販市場の調査結果を紹介する短い記事',
        'learning_features': {'formats': ['調査レポート'], 'intents': ['調査結果共有'], 'signals': ['一次データ']},
    }
    mins, src, confidence = est.estimate(short_market_news)
    if not (mins == 2 and src == 'body_full' and confidence == 'high'):
        raise AssertionError(f'short market-news calibration regressed: {(mins, src, confidence)}')

    partial_interview = {
        'source': 'Agenda note (アジェンダノート)',
        'content_checked': True,
        'content_completeness': 'partial',
        'content_char_count': 1500,
        'content_excerpt': 'インタビュー前半のみ。ここから先は会員限定です。',
        'learning_features': {'formats': ['インタビュー／対談'], 'intents': ['知識解説'], 'signals': []},
    }
    mins, src, confidence = est.estimate(partial_interview)
    if not (mins >= 8 and src == 'body_partial' and confidence == 'medium'):
        raise AssertionError(f'partial-body lower-bound handling regressed: {(mins, src, confidence)}')

    unknown_capped = {
        'source': 'MarkeZine:新着一覧',
        'content_checked': True,
        'content_char_count': 12000,
        'content_excerpt': '長い本文' * 1000,
        'learning_features': {'formats': ['解説／ハウツー'], 'intents': ['知識解説'], 'signals': []},
    }
    _, src, confidence = est.estimate(unknown_capped)
    if src != 'body_unknown' or confidence != 'medium':
        raise AssertionError(f'capped legacy body must remain uncertain: {(src, confidence)}')

    index = need('index.html', 'weekly-reading-time-v21.js')
    workflow = need(
        '.github/workflows/update.yml',
        'scripts/enrich_xtrend_reading_time.py',
        'scripts/enrich_reading_time_estimates.py',
    )
    print('Reading-time validation passed: official-first, completeness-aware body handling, calibrated short reads, and partial-body lower bounds.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
