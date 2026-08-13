#!/usr/bin/env python3
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone

import build_system_model as crypto
from work_taxonomy_v4 import TAXONOMY_VERSION, classify


def main() -> int:
    work = crypto.decrypt(crypto.WORK_ENC)
    if not work:
        raise RuntimeError('Encrypted Work System is missing or cannot be decrypted.')

    notes = work.get('notes') or []
    note_map = {}
    for n in notes:
        domains, scenarios = classify(
            str(n.get('title') or ''),
            str(n.get('text') or ''),
            str(n.get('section') or ''),
            str(n.get('source_kind') or ''),
        )
        n['domains'] = domains
        n['scenarios'] = scenarios
        if n.get('id'):
            note_map[n['id']] = n

    for c in work.get('candidate_principles') or []:
        evidence = [note_map[x] for x in (c.get('evidence_ids') or []) if x in note_map]
        if evidence:
            primary = evidence[0]
            c['domains'] = primary.get('domains') or []
            c['scenarios'] = primary.get('scenarios') or []
        else:
            domains, scenarios = classify(str(c.get('title') or ''), str(c.get('detail') or ''))
            c['domains'] = domains
            c['scenarios'] = scenarios

    for r in work.get('rules') or []:
        domains, scenarios = classify(
            str(r.get('title') or ''),
            ' '.join([
                str(r.get('principle') or ''),
                str(r.get('when') or ''),
                ' '.join(r.get('steps') or []),
                ' '.join(r.get('metrics') or []),
                ' '.join(r.get('traps') or []),
            ]),
        )
        if domains:
            r['domain'] = domains[0]['name']
            r['domains'] = domains
        r['scenarios'] = scenarios

    now = datetime.now(timezone.utc).isoformat()
    work.setdefault('meta', {})['taxonomy_version'] = TAXONOMY_VERSION
    work['meta']['classification_updated_at'] = now

    primary_domains = Counter()
    primary_scenarios = Counter()
    for n in notes:
        if n.get('domains'):
            primary_domains[n['domains'][0]['name']] += 1
        if n.get('scenarios'):
            primary_scenarios[n['scenarios'][0]['label']] += 1
    work['domain_counts'] = [{'name': k, 'count': v} for k, v in primary_domains.most_common()]
    work['scenario_counts'] = [{'name': k, 'count': v} for k, v in primary_scenarios.most_common()]

    crypto.WORK_ENC.write_text(json.dumps(crypto.encrypt(work), ensure_ascii=False), encoding='utf-8')

    if crypto.ROOT.joinpath('data/work-system.json').exists():
        public_path = crypto.ROOT / 'data' / 'work-system.json'
        public = json.loads(public_path.read_text(encoding='utf-8'))
        public.setdefault('meta', {})['taxonomy_version'] = TAXONOMY_VERSION
        public['meta']['classification_updated_at'] = now
        public['domain_counts'] = work['domain_counts']
        public['scenario_counts'] = work['scenario_counts'][:30]
        public_path.write_text(json.dumps(public, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f'Reclassified Work System: {len(notes)} notes, taxonomy v{TAXONOMY_VERSION}, domains={len(primary_domains)}, scenarios={len(primary_scenarios)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
