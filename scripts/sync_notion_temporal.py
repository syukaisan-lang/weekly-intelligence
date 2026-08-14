#!/usr/bin/env python3
"""Run the existing Notion sync with temporal metadata enrichment enabled."""
from __future__ import annotations

import json
from collections import Counter

import sync_notion as base
from temporal_knowledge import enrich_item_temporal

_original_build_item=base.build_item
TEMPORAL_COUNTS=Counter()
DOMAIN_COUNTS=Counter()


def build_item_temporal(page):
    item=enrich_item_temporal(_original_build_item(page))
    TEMPORAL_COUNTS[item.get('temporal_confidence') or 'unknown']+=1
    DOMAIN_COUNTS[item.get('time_domain') or 'general']+=1
    return item


def publish_aggregate_temporal_stats()->None:
    if not base.PUBLIC_OUT.exists():return
    public=json.loads(base.PUBLIC_OUT.read_text(encoding='utf-8'))
    public.setdefault('meta',{})['temporal_evidence']={
        'enabled':True,
        'priority':'evidence_period > published_at > collected_at',
        'confidence_counts':dict(TEMPORAL_COUNTS),
        'domain_counts':dict(DOMAIN_COUNTS),
    }
    base.PUBLIC_OUT.write_text(json.dumps(public,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Temporal evidence coverage:',dict(TEMPORAL_COUNTS),'domains=',dict(DOMAIN_COUNTS))


base.build_item=build_item_temporal

if __name__=='__main__':
    rc=base.main()
    if rc==0:publish_aggregate_temporal_stats()
    raise SystemExit(rc)
