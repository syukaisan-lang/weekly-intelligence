#!/usr/bin/env python3
"""Task-aware system model.

Adds a second-level real-work scenario to every rule where the source supports
one. Scenario selection is scored by title/body relevance rather than by first
regex match, so a rule containing several concepts does not automatically get
the first generic context in the list.
"""
from __future__ import annotations

import re

import build_system_model as base
import build_system_model_v2 as v2
from work_taxonomy_v4 import DOMAIN_BY_ID, TAXONOMY_VERSION, best_task, classify

GENERIC_WHEN = {
    '遇到与该规则同类的问题时，先核对前提条件。',
    '同类问题发生时先核对前提。',
}


def rule_source_text(r: dict) -> str:
    return ' '.join([
        str(r.get('principle') or r.get('decision_rule') or r.get('detail') or ''),
        str(r.get('when') or ''),
        ' '.join(r.get('steps') or []),
        ' '.join(r.get('metrics') or []),
        ' '.join(r.get('traps') or []),
        ' '.join(r.get('tensions') or []),
    ])


def apply_task(r: dict) -> dict:
    title = str(r.get('title') or '')
    body = rule_source_text(r)
    task = best_task(title, body)
    if task:
        r['scenario_id'] = task['id']
        r['scenario_label'] = task['label']
        r['domain'] = DOMAIN_BY_ID[task['domain']]['name']
        r['when'] = task['when']
        r['questions'] = task['questions']
        r['context_quality'] = 'task_specific'
    else:
        domains, _ = classify(title, body)
        if domains and (not r.get('domain') or r.get('domain') == '其他'):
            r['domain'] = domains[0]['name']
        if str(r.get('when') or '').strip() in GENERIC_WHEN:
            r['when'] = ''
        # If v2 attached a generic/context-first question block but no scored
        # task survives, remove it rather than fabricate a diagnostic context.
        if r.get('context_quality') in ('topic_specific', 'source_only'):
            r['questions'] = []
        r['context_quality'] = 'source_only'
    r['taxonomy_version'] = TAXONOMY_VERSION
    return r


def normalized_base_rules_v3(work: dict) -> list[dict]:
    rows = v2.normalized_base_rules_v2(work)
    return [apply_task(dict(r)) for r in rows]


def enrich_deterministic_v3(work: dict, know: dict) -> list[dict]:
    rows = v2.enrich_deterministic_v2(work, know)
    return [apply_task(dict(r)) for r in rows]


base.normalized_base_rules = normalized_base_rules_v3
base.enrich_deterministic = enrich_deterministic_v3

if __name__ == '__main__':
    raise SystemExit(base.main())
