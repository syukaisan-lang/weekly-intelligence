#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ART_PATH = ROOT / 'data' / 'articles.json'


def compact_len(value: str) -> int:
    return len(re.sub(r'\s+', '', str(value or '')))


def source_prior(source: str) -> float:
    s = str(source or '')
    if 'Agenda note' in s:
        return 8
    if 'MarkeZine' in s:
        return 7
    if '日経クロストレンド' in s:
        return 7
    if 'ウェブ電通報' in s:
        return 7
    if 'wisdom-evolution' in s:
        return 7
    if 'ネットショップ担当者' in s:
        return 6
    if 'ITmedia マーケティング' in s:
        return 6
    if 'AdverTimes' in s:
        return 5
    if 'ITmedia ビジネス' in s:
        return 5
    return 5


def estimate(a: dict) -> tuple[int, str]:
    official = int(a.get('reading_time_minutes') or 0)
    if 1 <= official <= 120:
        return official, 'official'

    formats = ' '.join((a.get('learning_features') or {}).get('formats') or [])
    signals = ' '.join((a.get('learning_features') or {}).get('signals') or [])
    summary = str(a.get('summary') or '')
    full_chars = int(a.get('content_char_count') or 0)
    excerpt_chars = compact_len(a.get('content_excerpt') or '')

    if a.get('content_checked') and (full_chars > 0 or excerpt_chars > 0):
        chars = full_chars or excerpt_chars
        if not full_chars and excerpt_chars >= 4700:
            chars = max(chars, 7200)
        mins = chars / 550.0
        if re.search(r'調査レポート|インタビュー|対談', formats):
            mins *= 1.12
        if re.search(r'一次データ', signals) or re.search(r'調査|データ|統計|アンケート', summary):
            mins += .7
        return max(2, min(60, math.ceil(mins))), 'body_full' if full_chars else 'body_excerpt'

    mins = source_prior(a.get('source') or '')
    if re.search(r'インタビュー|対談', formats):
        mins = max(mins, 10)
    elif re.search(r'調査レポート', formats):
        mins = max(mins, 9)
    elif re.search(r'事例|ケース|解説|ハウツー', formats):
        mins = max(mins, 8)
    elif re.search(r'ランキング|まとめ', formats):
        mins = max(mins, 6)
    elif re.search(r'セミナー|イベント|キャンペーン|販促', formats):
        mins = min(mins, 3)
    elif re.search(r'新商品|新サービス', formats):
        mins = min(mins, 4)
    summary_chars = compact_len(summary)
    if summary_chars >= 650:
        mins += 1
    if summary_chars >= 1050:
        mins += 1
    return max(2, min(30, int(math.ceil(mins)))), 'source_format_prior'


def apply_estimates() -> dict:
    if not ART_PATH.exists():
        return {'updated': 0, 'body_based': 0, 'heuristic': 0}
    payload = json.loads(ART_PATH.read_text(encoding='utf-8'))
    updated = body_based = heuristic = 0
    for a in payload.get('articles') or []:
        if 1 <= int(a.get('reading_time_minutes') or 0) <= 120:
            a.pop('estimated_reading_minutes', None)
            a.pop('reading_time_estimate_source', None)
            continue
        mins, source = estimate(a)
        if a.get('estimated_reading_minutes') != mins or a.get('reading_time_estimate_source') != source:
            a['estimated_reading_minutes'] = mins
            a['reading_time_estimate_source'] = source
            updated += 1
        if source.startswith('body_'):
            body_based += 1
        elif source == 'source_format_prior':
            heuristic += 1
    meta = payload.setdefault('meta', {})
    meta['reading_time_estimation_version'] = 'v2_source_format_body_length'
    meta['reading_time_body_based_count'] = body_based
    meta['reading_time_heuristic_count'] = heuristic
    ART_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Reading time estimates: updated={updated}, body_based={body_based}, heuristic={heuristic}')
    return {'updated': updated, 'body_based': body_based, 'heuristic': heuristic}


if __name__ == '__main__':
    apply_estimates()
