#!/usr/bin/env python3
"""Build the encrypted semantic index and attach temporal metadata to Notion chunks."""
from __future__ import annotations

import json

import build_semantic_index as base
import build_system_model as crypto

TEMPORAL_FIELDS=(
    'effective_date','evidence_period','published_at','collected_at',
    'temporal_confidence','temporal_basis','time_sensitive','time_domain'
)


def main()->int:
    rc=base.main()
    if rc:
        return rc
    know=crypto.decrypt(crypto.KNOW_ENC) or {}
    payload=crypto.decrypt(base.OUT_ENC) or {}
    by_id={str(a.get('id') or ''):a for a in (know.get('items') or [])}
    enriched=0
    for e in payload.get('entries') or []:
        if e.get('kind')!='notion':
            continue
        a=by_id.get(str(e.get('id') or ''))
        if not a:
            continue
        temporal={k:a.get(k) for k in TEMPORAL_FIELDS if a.get(k) not in (None,'',[],{})}
        if temporal:
            e['temporal']=temporal
            enriched+=1
    meta=payload.setdefault('meta',{})
    meta['temporal_index_version']=1
    meta['notion_temporal_chunk_count']=enriched
    base.OUT_ENC.write_text(json.dumps(crypto.encrypt(payload),ensure_ascii=False),encoding='utf-8')
    try:
        public=json.loads(base.OUT_META.read_text(encoding='utf-8'))
        pm=public.setdefault('meta',{})
        pm['temporal_index_version']=1
        pm['temporal_metadata_encrypted']=True
        base.OUT_META.write_text(json.dumps(public,ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:
        pass
    print(f'Temporal semantic index enriched: {enriched} Notion chunks')
    return 0


if __name__=='__main__':
    raise SystemExit(main())
