from __future__ import annotations

"""Precision layer for Work System task classification.

A task should not be assigned merely because a long note happens to mention one
keyword once. Strong body evidence requires repeated mentions, or one mention in
a compact note; title/section matches remain strong signals.
"""

import work_taxonomy as base

TAXONOMY_VERSION = 4
DOMAINS = base.DOMAINS
DOMAIN_BY_ID = base.DOMAIN_BY_ID
TASKS = base.TASKS


def task_scores(title: str, text: str, section: str = '') -> list[dict]:
    title = title or ''
    text = text or ''
    section = section or ''
    compact_len = len(''.join(text.split()))
    rows = []
    for task in TASKS:
        title_hits = base._count(task['patterns'], title)
        section_hits = base._count(task['patterns'], section)
        body_hits = base._count(task['patterns'], text)
        body_strong = body_hits >= 2 or (body_hits == 1 and compact_len <= 320)
        if not (title_hits or section_hits or body_strong):
            continue
        score = float(task['priority']) + title_hits * 7.0 + section_hits * 3.0
        if body_strong:
            score += min(body_hits, 4) * 1.6
            if body_hits >= 2:
                score += min(2.5, (body_hits - 1) * 0.55)
        rows.append({**task, 'score': round(score, 2)})
    return sorted(rows, key=lambda x: (-x['score'], -x['priority'], x['id']))


# base.domain_scores/classify resolve task_scores from the base module at runtime.
# Patch that one dependency so all existing domain logic is retained.
base.task_scores = task_scores


def domain_scores(title: str, text: str, section: str = '', source_kind: str = '') -> list[dict]:
    return base.domain_scores(title, text, section, source_kind)


def classify(title: str, text: str, section: str = '', source_kind: str = '') -> tuple[list[dict], list[dict]]:
    domains = domain_scores(title, text, section, source_kind)
    tasks = task_scores(title, text, section)
    domain_tags = domains[:3]
    scenario_tags = [
        {'id':x['id'],'label':x['label'],'domain':DOMAIN_BY_ID[x['domain']]['name'],'score':x['score']}
        for x in tasks[:3]
    ]
    return domain_tags, scenario_tags


def best_task(title: str, text: str, section: str = '') -> dict | None:
    rows = task_scores(title, text, section)
    return rows[0] if rows else None
