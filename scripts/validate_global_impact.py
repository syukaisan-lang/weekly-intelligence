#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def read(path:str)->str:
    p=ROOT/path
    if not p.exists():raise AssertionError(f'missing required file: {path}')
    return p.read_text(encoding='utf-8')


def require(path:str,*needles:str)->None:
    text=read(path)
    for needle in needles:
        if needle not in text:raise AssertionError(f'{path} must contain: {needle}')


def main()->int:
    # One semantic architecture must feed Work System, Knowledge temporal retrieval,
    # Weekly selection and feedback learning.
    require('scripts/build_semantic_index.py','multilingual-e5','semantic-index.enc.json','private','notion','rule','temporal_index_version','TEMPORAL_FIELDS')
    require('scripts/weekly_semantic.py','semantic-index.enc.json','weekly_embed_node.mjs','multilingual-e5')
    require('scripts/weekly_embed_node.mjs','semantic-worker.bundle.js','rule_similarity','knowledge_similarity','experience_similarity')
    require('scripts/update_feeds_personalized.py','SemanticMatcher','semantic_v6','semantic_vector','increment_type')
    require('scripts/update_feeds_temporal.py','temporal_update','semantic_v7_temporal','p.refresh_existing_scores')
    require('weekly-progress.js','semantic_vector','semanticPreferenceDelta','subjectAffinity','旅游/观光','内容主题 + 研究/呈现方式 + 意图')
    require('work-system.html','work-system-vector-v6.js','work-system-temporal-v7.js')

    # Temporal evidence: occurrence time > publication time > collection time.
    require('scripts/temporal_knowledge.py','evidence_period','published_at','collected_at','effective_date','temporal_confidence','time_sensitive','time_domain','collected_at_fallback')
    require('scripts/sync_notion_temporal.py','enrich_item_temporal','base.build_item')
    require('knowledge.html','knowledge-temporal-v7.js','knowledge-temporal-list-v7.js','调查期','Notion 收录日','最新证据优先')
    require('knowledge-temporal-v7.js','TEMPORAL_RE','semantic-index.enc.json','evidence_period','temporal_confidence','变化信号')
    require('knowledge-temporal-list-v7.js','有效证据时间','证据 ','发布 ','收录 ','effective_date')
    require('work-system-temporal-v7.js','freshness','CHANGE_RE','CURRENT_RE','time_sensitive')
    require('scripts/weekly_semantic_runtime.py','temporal_update_bonus','knowledge_effective_date','knowledge_temporal_confidence','knowledge_time_sensitive','repetition_penalty')
    require('weekly-relations-v6.js','时间更新','temporal_update_bonus','证据时间')

    # Feedback attribution must distinguish subject from method/format.
    weekly=read('weekly-progress.js')
    if 'f.topics.forEach(x=>add(prefs.topics,x,strong?-.14:-.06))' not in weekly:
        raise AssertionError('ordinary negative feedback must primarily penalize content subject')
    if 'if(s.w<0)affinity*=subjectAffinity' not in weekly:
        raise AssertionError('negative semantic transfer must be gated by subject affinity')

    # State/history must stay independent from recommendation rescoring and remain recoverable.
    require('weekly-state-sync.js','feedback','updated_at','恢复云端','备份本周标记')
    require('weekly-progress.js',"gf.value='ALL'",'isMarked')

    # Synchronization ownership: Google/Notion rebuild system+index; they share one writer lock
    # and restore generated outputs on top of latest main before committing.
    model_lock='personal-intelligence-model-write'
    require('.github/workflows/work-system-sync.yml','build_semantic_index.py','build_system_model_precision.py',model_lock,'git reset --hard origin/main','/tmp/work-system-model-output')
    require('.github/workflows/notion-sync.yml','sync_notion_temporal.py','build_semantic_index.py','temporal evidence',model_lock,'git reset --hard origin/main','/tmp/notion-model-output')
    update=read('.github/workflows/update.yml')
    for trigger in ('data/knowledge.enc.json','data/system-model.enc.json','data/semantic-index.enc.json'):
        if trigger not in update:raise AssertionError(f'Weekly must rescore after {trigger} changes')
    if 'run: python scripts/update_feeds_temporal.py' not in update:raise AssertionError('Weekly workflow must run temporal v7 updater')
    if 'build_system_model_v2.py' in update or 'build_system_model_v3.py' in update:
        raise AssertionError('Weekly workflow must not overwrite the unified Work System model')

    # Public semantic metadata may expose counts/model family and temporal capability flags,
    # never private titles/text/vectors or per-item temporal evidence.
    meta_path=ROOT/'data'/'semantic-index.json'
    if meta_path.exists():
        raw=json.loads(meta_path.read_text(encoding='utf-8'));meta=raw.get('meta') or {}
        if meta.get('embedding_family')!='multilingual-e5':raise AssertionError('semantic-index model family drift')
        if not meta.get('encrypted_full_data'):raise AssertionError('full semantic index must remain encrypted')
        if 'vectors_b64' in raw:raise AssertionError('public semantic metadata must not contain vectors')
        if 'entries' in raw:raise AssertionError('public semantic metadata must not contain private temporal entries')

    print('Global impact validation passed: time-aware Knowledge -> Work System -> Weekly temporal v7 -> subject-aware feedback -> backup are aligned; model writers are serialized.')
    return 0


if __name__=='__main__':raise SystemExit(main())
