#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ART_PATH = ROOT / 'data' / 'articles.json'
PARTIAL_RE = re.compile(
    r'ここから先は|続き(?:は|を).{0,18}(?:会員|ログイン|購読|有料|登録)|'
    r'全文(?:を)?読む.{0,18}(?:会員|ログイン|購読|登録)|'
    r'(?:会員|有料会員|購読者)限定|ログインして.{0,18}(?:続き|全文)|'
    r'残り\s*\d+\s*(?:文字|ページ)|次のページ|この記事は\s*\d+\s*ページ',
    re.I,
)


def compact_len(value: str) -> int:
    return len(re.sub(r'\s+', '', str(value or '')))


def rounded_minutes(value: float, low: int = 1, high: int = 60) -> int:
    # Normal rounding is more realistic than always rounding upward for short work-reading sessions.
    return max(low, min(high, int(math.floor(float(value) + 0.5))))


def source_prior(source: str) -> float:
    s = str(source or '')
    if 'Agenda note' in s:
        return 6
    if 'MarkeZine' in s:
        return 5
    if '日経クロストレンド' in s:
        return 5
    if 'ウェブ電通報' in s:
        return 5
    if 'wisdom-evolution' in s:
        return 5
    if 'ネットショップ担当者' in s:
        return 4
    if 'ITmedia マーケティング' in s:
        return 4
    if 'AdverTimes' in s:
        return 4
    if 'ITmedia ビジネス' in s:
        return 4
    return 4


def inferred_completeness(a: dict, full_chars: int, excerpt: str) -> str:
    explicit = str(a.get('content_completeness') or '').lower()
    if explicit in {'full', 'partial', 'unknown'}:
        return explicit
    if PARTIAL_RE.search(excerpt or ''):
        return 'partial'
    # Legacy extraction was capped at 12k characters, so a row near that cap cannot be claimed full.
    if full_chars >= 11800 or compact_len(excerpt) >= 4900:
        return 'unknown'
    if a.get('content_checked') and (full_chars > 0 or compact_len(excerpt) >= 250):
        return 'unknown'
    return 'unknown'


def reading_speed(chars: int, formats: str, intents: str) -> float:
    """Japanese characters/minute for normal work reading, not careful word-by-word study."""
    deep_interview = bool(re.search(r'インタビュー|対談', formats)) and chars >= 3500
    deep_report = bool(re.search(r'調査レポート', formats)) and chars >= 4000
    deep_explain = bool(re.search(r'事例|ケース|解説|ハウツー', formats)) and chars >= 4500
    short_result_news = chars <= 3000 and bool(re.search(r'調査結果共有', intents))
    if chars <= 1800 or short_result_news:
        return 800.0
    if chars <= 3000:
        return 750.0
    if deep_interview:
        return 600.0
    if deep_report:
        return 625.0
    if deep_explain:
        return 650.0
    return 700.0


def prior_for_format(a: dict, formats: str) -> float:
    mins = source_prior(a.get('source') or '')
    if re.search(r'インタビュー|対談', formats):
        mins = max(mins, 8)
    elif re.search(r'調査レポート', formats):
        mins = max(mins, 7)
    elif re.search(r'事例|ケース|解説|ハウツー', formats):
        mins = max(mins, 6)
    elif re.search(r'ランキング|まとめ', formats):
        mins = max(mins, 5)
    elif re.search(r'セミナー|イベント|キャンペーン|販促', formats):
        mins = min(mins, 2)
    elif re.search(r'新商品|新サービス', formats):
        mins = min(mins, 3)
    return mins


def estimate(a: dict) -> tuple[int, str, str]:
    official = int(a.get('reading_time_minutes') or 0)
    if 1 <= official <= 120:
        return official, 'official', 'official'

    features = a.get('learning_features') or {}
    formats = ' '.join(features.get('formats') or [])
    intents = ' '.join(features.get('intents') or [])
    summary = str(a.get('summary') or '')
    excerpt = str(a.get('content_excerpt') or '')
    full_chars = int(a.get('content_char_count') or 0)
    excerpt_chars = compact_len(excerpt)
    chars = full_chars or excerpt_chars

    if a.get('content_checked') and chars > 0:
        completeness = inferred_completeness(a, full_chars, excerpt)
        speed = reading_speed(chars, formats, intents)
        observed = rounded_minutes(chars / speed, 1, 60)
        if completeness == 'full':
            return observed, 'body_full', 'high'
        if completeness == 'partial':
            # Visible text is only a lower bound. Use article/source form as the whole-article prior.
            prior = prior_for_format(a, formats)
            mins = max(observed + 1, rounded_minutes(prior, 2, 30))
            return max(2, min(60, mins)), 'body_partial', 'medium'
        # Legacy/uncertain body: use observed readable text without pretending it proves completeness.
        # Very long capped excerpts receive a small uncertainty allowance.
        mins = observed + (1 if chars >= 8000 else 0)
        return max(1, min(60, mins)), 'body_unknown', 'medium'

    mins = prior_for_format(a, formats)
    summary_chars = compact_len(summary)
    if summary_chars >= 800:
        mins += 0.5
    if summary_chars >= 1300:
        mins += 0.5
    return rounded_minutes(mins, 2, 30), 'source_format_prior', 'low'


def apply_estimates() -> dict:
    if not ART_PATH.exists():
        return {'updated': 0, 'body_based': 0, 'heuristic': 0}
    payload = json.loads(ART_PATH.read_text(encoding='utf-8'))
    updated = body_based = heuristic = partial = unknown = 0
    for a in payload.get('articles') or []:
        if 1 <= int(a.get('reading_time_minutes') or 0) <= 120:
            a.pop('estimated_reading_minutes', None)
            a.pop('reading_time_estimate_source', None)
            a.pop('reading_time_estimate_confidence', None)
            continue
        mins, source, confidence = estimate(a)
        if (
            a.get('estimated_reading_minutes') != mins
            or a.get('reading_time_estimate_source') != source
            or a.get('reading_time_estimate_confidence') != confidence
        ):
            a['estimated_reading_minutes'] = mins
            a['reading_time_estimate_source'] = source
            a['reading_time_estimate_confidence'] = confidence
            updated += 1
        if source.startswith('body_'):
            body_based += 1
            partial += int(source == 'body_partial')
            unknown += int(source == 'body_unknown')
        elif source == 'source_format_prior':
            heuristic += 1
    meta = payload.setdefault('meta', {})
    meta['reading_time_estimation_version'] = 'v3_completeness_calibrated'
    meta['reading_time_body_based_count'] = body_based
    meta['reading_time_partial_body_count'] = partial
    meta['reading_time_unknown_body_count'] = unknown
    meta['reading_time_heuristic_count'] = heuristic
    ART_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(
        f'Reading time estimates: updated={updated}, body_based={body_based}, '
        f'partial={partial}, unknown={unknown}, heuristic={heuristic}'
    )
    return {'updated': updated, 'body_based': body_based, 'partial': partial, 'unknown': unknown, 'heuristic': heuristic}


if __name__ == '__main__':
    apply_estimates()
