#!/usr/bin/env python3
"""Higher-quality deterministic consolidation for My Work System.

This layer keeps the encrypted/private architecture intact while improving the
non-LLM fallback: career intent reclassification, low-value candidate removal,
exact/near-duplicate merging, and evidence aggregation.
"""
from __future__ import annotations

import re
from collections import defaultdict

import build_system_model as base

CAREER_RE = re.compile(
    r"転職|转职|换工作|跳槽|キャリア|職業|职业|職務経歴|職歴|面接|面談|オファー|offer|求人|年収|給与|待遇|退職|入社|志望動機|職種|雇用",
    re.I,
)
LOW_VALUE_RE = re.compile(r"^(その他|まとめ|メモ|memo|参考|参考資料|未分類|general|マーケティング|marketing)$", re.I)

base.GENERIC_QUESTIONS['职业 / 转职 / Career'] = [
    '今回の転職で、何を変えたいのか（仕事内容・裁量・年収・働き方・成長）を優先順位まで明確にしたか？',
    '会社・職種・上司・報酬・将来性を同じ条件で比較できているか？',
    '入社後に期待する役割と、自分が実際に再現できる強みは一致しているか？',
]


def norm(s: str) -> str:
    return re.sub(r"[^0-9a-z一-龥ぁ-んァ-ヶ]+", "", (s or "").lower())


def grams(text: str, n: int = 3) -> set[str]:
    s = norm(text)
    if len(s) < n:
        return {s} if s else set()
    return {s[i:i+n] for i in range(len(s)-n+1)}


def near_duplicate(a: dict, b: dict) -> bool:
    ta = str(a.get('title') or '')
    tb = str(b.get('title') or '')
    if norm(ta) and norm(ta) == norm(tb):
        return True
    aa = grams(ta + ' ' + str(a.get('detail') or ''))
    bb = grams(tb + ' ' + str(b.get('detail') or ''))
    if not aa or not bb:
        return False
    inter = len(aa & bb)
    union = len(aa | bb)
    if not union:
        return False
    j = inter / union
    contain = inter / min(len(aa), len(bb))
    return j >= 0.72 or (contain >= 0.86 and inter >= 8)


def candidate_domain(c: dict) -> str:
    text = f"{c.get('title','')} {c.get('detail','')}"
    if CAREER_RE.search(text):
        return '职业 / 转职 / Career'
    return ((c.get('domains') or [{}])[0].get('name') or '其他')


def useful(c: dict) -> bool:
    title = str(c.get('title') or '').strip()
    detail = str(c.get('detail') or '').strip()
    if len(title) < 4 or len(detail) < 8:
        return False
    if LOW_VALUE_RE.match(title):
        return False
    # Headings copied as a row often have almost no incremental content.
    if norm(title) == norm(detail) and len(title) < 18:
        return False
    return True


def normalized_base_rules_v2(work: dict) -> list[dict]:
    rules = work.get('rules') or []
    if rules:
        out = []
        for r in rules[:100]:
            x = dict(r)
            if CAREER_RE.search(base.rule_text(x)):
                x['domain'] = '职业 / 转职 / Career'
            out.append(x)
        return out

    candidates = [dict(c) for c in (work.get('candidate_principles') or []) if useful(c)]
    by_domain: dict[str, list[dict]] = defaultdict(list)
    for c in candidates:
        by_domain[candidate_domain(c)].append(c)

    merged: list[dict] = []
    for domain, rows in by_domain.items():
        clusters: list[dict] = []
        for c in rows:
            hit = None
            for cluster in clusters:
                if near_duplicate(cluster['rep'], c):
                    hit = cluster
                    break
            if hit is None:
                clusters.append({'rep': c, 'evidence_ids': list(c.get('evidence_ids') or []), 'source_kinds': list(c.get('source_kinds') or [])})
                continue
            hit['evidence_ids'].extend(c.get('evidence_ids') or [])
            hit['source_kinds'].extend(c.get('source_kinds') or [])
            # Keep the richer wording as representative, but preserve all evidence.
            if len(str(c.get('detail') or '')) > len(str(hit['rep'].get('detail') or '')):
                hit['rep'] = c

        for cluster in clusters:
            c = cluster['rep']
            merged.append({
                'id': c.get('id'),
                'title': c.get('title'),
                'principle': c.get('detail'),
                'when': '',
                'steps': [],
                'metrics': [],
                'traps': [],
                'tensions': [],
                'domain': domain,
                'evidence_ids': list(dict.fromkeys(cluster['evidence_ids']))[:12],
                'confidence': 'low',
            })

    # Prefer domains that are directly callable; keep "其他" but avoid letting it dominate.
    merged.sort(key=lambda r: (r['domain'] == '其他', r['domain'], str(r.get('title') or '')))
    non_other = [r for r in merged if r['domain'] != '其他']
    other = [r for r in merged if r['domain'] == '其他'][:45]
    return (non_other + other)[:180]


base.normalized_base_rules = normalized_base_rules_v2

if __name__ == '__main__':
    raise SystemExit(base.main())
