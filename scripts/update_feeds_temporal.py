#!/usr/bin/env python3
"""Weekly v7: run semantic screening with temporal-update attribution."""
from __future__ import annotations

import json
import re

import update_feeds_personalized as p

_original_increment=p.increment_type
_original_score_one=p.score_one
TEMPORAL_REASON_RE=re.compile(r'更新20\d{2}|时间证据|時間証拠|temporal',re.I)


def temporal_increment_type(lex_diag:dict,sem_diag:dict,practical:bool)->str:
    if float(sem_diag.get('temporal_update_bonus',0) or 0)>0:
        return 'temporal_update'
    return _original_increment(lex_diag,sem_diag,practical)


def score_one_temporal(a,src,sem):
    reading,notion,kc,vector,reason,tags,features=_original_score_one(a,src,sem)
    if kc.get('increment_type')=='temporal_update' or TEMPORAL_REASON_RE.search(reason or ''):
        kc['increment_type']='temporal_update'
        kc['temporal_update']=True
        # A fresh comparable signal should not be pushed down by legacy lexical duplicate penalties.
        notion=p.clamp(notion+.22)
    return reading,notion,kc,vector,reason,tags,features


p.increment_type=temporal_increment_type
p.score_one=score_one_temporal


def mark_version()->None:
    if not p.base.ART_PATH.exists():return
    payload=json.loads(p.base.ART_PATH.read_text(encoding='utf-8'))
    meta=payload.setdefault('meta',{})
    meta['personalization_version']='semantic_v7_temporal'
    meta['temporal_update_enabled']=True
    for a in payload.get('articles') or []:
        kc=a.get('knowledge_context') or {}
        if kc.get('increment_type')=='temporal_update':
            a['screening']='semantic_v7_temporal'
    p.base.ART_PATH.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':
    p.base.main()
    p.refresh_existing_scores()
    mark_version()
