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
    require('scripts/build_semantic_index.py','multilingual-e5','semantic-index.enc.json','private','notion','rule','temporal_index_version','TEMPORAL_FIELDS')
    require('scripts/weekly_semantic.py','semantic-index.enc.json','weekly_embed_node.mjs','multilingual-e5')
    require('scripts/weekly_embed_node.mjs','semantic-worker.bundle.js','rule_similarity','knowledge_similarity','experience_similarity')
    require('scripts/update_feeds_personalized.py','SemanticMatcher','semantic_v6','semantic_vector','increment_type')
    require('scripts/update_feeds_temporal.py','temporal_update','semantic_v8_adaptive_temporal','lifecycle.prepare_sources','lifecycle.refresh_hot_only','lifecycle.compact_articles')
    require('scripts/weekly_lifecycle.py','HOT_DAYS = 90','SOURCE_WINDOW_DAYS = 56','UNLABELED_EXPIRE_DAYS = 7','decrypt_weekly_state','source_yield','source_mode','implicit_skipped','pass_rate','sa_adopted','storage_tier','cold','_adaptive_skip')
    require('weekly-progress.js','semantic_vector','semanticPreferenceDelta','subjectAffinity','旅游/观光','内容主题 + 研究/呈现方式 + 意图')
    require('weekly-attention-v8.js','FEEDBACK_WINDOW_MS=84','MIN_BUDGET=8','BASE_BUDGET=14','MAX_BUDGET=20','rebuildPrefs=function','S级始终保留')
    require('weekly-source-audit-v9.js','sourceStats','isRecommendedUnread','isExpiredUnlabeled','EXPIRE_MS=7','implicitSkip','explicitSkip','S/A采纳','建议停用','复制来源统计',"if(status==='later')return true")
    require('index.html','weekly-attention-v8.js','weekly-source-audit-v9.js','最近12周反馈','最近90天','最近8周','超过 7 天','0/18','隐性跳过')
    require('work-system.html','work-system-vector-v6.js','work-system-temporal-v7.js')

    require('scripts/temporal_knowledge.py','evidence_period','published_at','collected_at','effective_date','temporal_confidence','time_sensitive','time_domain','collected_at_fallback','ISO_DATE','evidence\\s*period')
    require('scripts/sync_notion_temporal.py','enrich_item_temporal','base.build_item','confidence_counts')
    require('scripts/save_to_notion.py','import temporal_knowledge as temporal','Published at:','Evidence period:','temporal.evidence_period')
    require('knowledge.html','knowledge-temporal-v7.js','knowledge-temporal-list-v7.js','调查/数据时间','最新证据优先','证据 / 发布 / 收录')
    require('knowledge-temporal-v7.js','TEMPORAL_RE','semantic-index.enc.json','evidence_period','temporal_confidence','变化信号',"x.tm.confidence!=='low'",'证据不足')
    require('knowledge-temporal-list-v7.js','有效证据时间','证据 ','发布 ','收录 ','effective_date')
    require('work-system-temporal-v7.js','freshness','CHANGE_RE','CURRENT_RE','time_sensitive')
    require('scripts/weekly_semantic_runtime.py','article_temporal_meta','article_temporal_confidence','evidence_period','first_seen_fallback','temporal_update_bonus','knowledge_effective_date','knowledge_temporal_confidence','knowledge_time_sensitive','repetition_penalty')
    require('weekly-relations-v6.js','时间更新','temporal_update_bonus','证据时间')

    weekly=read('weekly-progress.js')
    if 'f.topics.forEach(x=>add(prefs.topics,x,strong?-.14:-.06))' not in weekly:
        raise AssertionError('ordinary negative feedback must primarily penalize content subject')
    if 'if(s.w<0)affinity*=subjectAffinity' not in weekly:
        raise AssertionError('negative semantic transfer must be gated by subject affinity')

    source_audit=read('weekly-source-audit-v9.js')
    if "humanState(a).status==='skip'" not in source_audit:
        raise AssertionError('explicit source skip must still come from human status')
    if "status==='new'&&!s.feedback" not in source_audit:
        raise AssertionError('unlabeled source pass must require no human status and no feedback')
    if 'applyFeedback(' in source_audit:
        raise AssertionError('implicit source passes must never directly train content preference')

    sources=json.loads(read('config/sources.json'))
    names={str(x.get('name') or '') for x in sources}
    stopped={'AV Watch','ギズモード・ジャパン','PR EDGE'}
    if names & stopped:
        raise AssertionError(f'stopped sources returned to active config: {sorted(names & stopped)}')
    if len(sources)!=18:
        raise AssertionError(f'active source count must be 18 after manual pruning, got {len(sources)}')

    require('weekly-state-sync.js','feedback','updated_at','恢复云端','备份本周标记')
    require('weekly-progress.js',"gf.value='ALL'",'isMarked')

    model_lock='personal-intelligence-model-write'
    require('.github/workflows/work-system-sync.yml','build_semantic_index.py','build_system_model_precision.py',model_lock,'git reset --hard origin/main','/tmp/work-system-model-output')
    require('.github/workflows/notion-sync.yml','sync_notion_temporal.py','build_semantic_index.py','temporal evidence',model_lock,'git reset --hard origin/main','/tmp/notion-model-output')
    update=read('.github/workflows/update.yml')
    for trigger in ('config/sources.json','scripts/weekly_lifecycle.py','data/knowledge.enc.json','data/system-model.enc.json','data/semantic-index.enc.json'):
        if trigger not in update:raise AssertionError(f'Weekly must rescore after {trigger} changes')
    for upstream in ('workflow_run:','Sync Notion knowledge','Sync personal work system','github.event.workflow_run.conclusion'):
        if upstream not in update:raise AssertionError(f'Weekly must listen to successful upstream workflow completion: {upstream}')
    for safe_commit in ('ref: main','fetch-depth: 0','/tmp/weekly-articles.json','/tmp/weekly-source-status.json','git reset --hard origin/main','git add data/articles.json data/source_status.json','for attempt in 1 2 3'):
        if safe_commit not in update:raise AssertionError(f'Weekly commit path must remain conflict-safe: {safe_commit}')
    if 'run: python scripts/update_feeds_temporal.py' not in update:raise AssertionError('Weekly workflow must run adaptive temporal updater')
    if 'build_system_model_v2.py' in update or 'build_system_model_v3.py' in update:
        raise AssertionError('Weekly workflow must not overwrite the unified Work System model')

    meta_path=ROOT/'data'/'semantic-index.json'
    if meta_path.exists():
        raw=json.loads(meta_path.read_text(encoding='utf-8'));meta=raw.get('meta') or {}
        if meta.get('embedding_family')!='multilingual-e5':raise AssertionError('semantic-index model family drift')
        if not meta.get('encrypted_full_data'):raise AssertionError('full semantic index must remain encrypted')
        if 'vectors_b64' in raw:raise AssertionError('public semantic metadata must not contain vectors')
        if 'entries' in raw:raise AssertionError('public semantic metadata must not contain private temporal entries')

    print('Global impact validation passed: 18 active sources -> explicit + implicit source passes -> 7-day S/A unread expiry -> rolling content feedback remains separate -> semantic/temporal Weekly -> encrypted backup -> conflict-safe commits are aligned.')
    return 0


if __name__=='__main__':raise SystemExit(main())
