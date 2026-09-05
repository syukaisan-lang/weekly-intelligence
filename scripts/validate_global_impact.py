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
    require('scripts/update_feeds_temporal.py','temporal_update','semantic_v8_adaptive_temporal','lifecycle.prepare_sources','lifecycle.refresh_hot_only','lifecycle.compact_articles','DENTSU_SOURCE','html_feed_fallback','/articles/')
    require('scripts/weekly_lifecycle.py','HOT_DAYS = 90','SOURCE_WINDOW_DAYS = 56','UNLABELED_EXPIRE_DAYS = 7','TRUSTED_STATUS_ORIGIN','human_v10','STATUS_ACTION_STATUS','_normalized_status','_is_positive_adoption','status_action','queue_grades','source_yield','source_mode','implicit_skipped','pass_rate','sa_adopted','storage_tier','cold','_adaptive_skip')
    require('weekly-progress.js','semantic_vector','semanticPreferenceDelta','subjectAffinity','旅游/观光','内容主题 + 研究/呈现方式 + 意图','later')
    require('weekly-attention-v8.js','FEEDBACK_WINDOW_MS=84','MIN_BUDGET=8','BASE_BUDGET=14','MAX_BUDGET=20','rebuildPrefs=function','S级始终保留','status_action',"['S','A']")
    require('weekly-source-audit-v9.js','TRUSTED_STATUS_ORIGIN','human_v10','STATUS_ACTION_FEEDBACK','QUEUE_GRADES','baseFeedback=feedback','status_action=STATUS_ACTION_FEEDBACK','sourceStats','isRecommendedUnread','isAutoArchived','EXPIRE_MS=7','implicitSkip','explicitSkip','S/A采纳','未处理归档','建议停用','复制来源统计')
    require('weekly-later-recovery-v12.js','RECOVERY_KEY','preserveLater',"prev.status==='later'&&next.status==='read'&&next.status_action==='feedback'",'recoverWeeklyLater',"if(st(a.id).status==='later')return false","gf.value='ALL'",'status_updated_at')
    require('index.html','weekly-attention-v8.js','weekly-source-audit-v9.js','weekly-state-sync.js','weekly-later-recovery-v12.js','未处理归档','S + A','稍后看','weekly-preference-guard-v30.js','weekly-adaptive-learning-v31.js','weekly-preference-memory-v32.js','weekly-ui-stability-v33.js')
    require('weekly-preference-guard-v30.js','会议/活动告知','宣传/促销','广告CM/创意报道','topic','later_interest')
    require('weekly-adaptive-learning-v31.js','reasonUsage','更多原因','priorityRows','skipSuppression')
    require('weekly-preference-memory-v32.js','Preference Memory','combo:','laterHistory','sample_count','knowledge_context')
    require('weekly-ui-stability-v33.js','weekly-no-knowledge','本周前保存','weeklyStickyStatus','truePriority','repairCaches')
    require('work-system.html','work-system-vector-v6.js','work-system-temporal-v7.js')

    index=read('index.html')
    if index.find('weekly-later-recovery-v12.js') < index.find('weekly-source-audit-v9.js'):
        raise AssertionError('Later recovery guard must load after source-audit queue wrappers')
    if index.find('weekly-later-recovery-v12.js') < index.find('weekly-state-sync.js'):
        raise AssertionError('Later recovery must load after encrypted state restore helpers')
    if 'knowledge-relations.js' in index:
        raise AssertionError('Weekly must not load client-side Knowledge/Work-System relation data')
    ordered=['weekly-queue-clarity-v29.js','weekly-preference-guard-v30.js','weekly-adaptive-learning-v31.js','weekly-preference-memory-v32.js','weekly-ui-stability-v33.js']
    positions=[index.find(x) for x in ordered]
    if any(x<0 for x in positions) or positions!=sorted(positions):
        raise AssertionError('Weekly learning layers must load deterministically v29 -> v30 -> v31 -> v32 -> v33')

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
    if "status_origin!==TRUSTED_STATUS_ORIGIN" not in source_audit:
        raise AssertionError('legacy read/save state must not count as trusted human reading')
    if "effective.status==='new'" not in source_audit:
        raise AssertionError('feedback must auto-process NEW articles in one click')
    if "raw.status_action=STATUS_ACTION_FEEDBACK" not in source_audit:
        raise AssertionError('auto-read caused by feedback must remain distinguishable from explicit read')
    if "s.status==='read'&&s.status_action===STATUS_ACTION_STATUS" not in source_audit:
        raise AssertionError('source adoption must distinguish explicit read from feedback auto-read')
    if 'applyFeedback(' in source_audit:
        raise AssertionError('implicit source passes must never directly train content preference')

    later=read('weekly-later-recovery-v12.js')
    if "const wasLater=before.status==='later'" not in later or "cur.status='later'" not in later:
        raise AssertionError('feedback must preserve an explicit Later bookmark')
    if "local.status==='read'&&local.status_action==='feedback'" not in later:
        raise AssertionError('historical feedback-auto-read Later records must remain recoverable')
    if "if(key==='later')" not in later or "sf.value='all'" not in later:
        raise AssertionError('Later view must be independent from grade/status filters')

    lifecycle=read('scripts/weekly_lifecycle.py')
    if "status in ('read', 'save') and st.get('status_origin') != TRUSTED_STATUS_ORIGIN" not in lifecycle:
        raise AssertionError('backend source yield must ignore legacy untrusted read/save state')
    if "feedback in ('accurate', 'more')" not in lifecycle or "feedback not in ('bad', 'less')" not in lifecycle:
        raise AssertionError('backend adoption must not treat negative-feedback auto-read as positive')

    state_sync=read('weekly-state-sync.js')
    for needle in ('schema:4','weekly-reading-delta','weekly-state-delta','deltaCandidates','compactRows','decodeRows','MAX_DELTA_ENTRIES=50','MAX_ISSUE_URL_LENGTH=7500','body=`STATE_ENVELOPE_B64: ${encoded}','fetchDeltaEnvelopes','backupWeeklyStateBtn'):
        if needle not in state_sync:raise AssertionError(f'Weekly backup must preserve one-click encrypted delta behavior: {needle}')
    if 'copyBackupLine' in state_sync or 'clipboardLine' in state_sync:
        raise AssertionError('Weekly backup must not require clipboard copy/paste')
    if 'meaningfulEntries();\n      const payload={schema:3' in state_sync:
        raise AssertionError('Weekly backup must not place the full state snapshot into the issue URL')
    if 'MAX_ISSUE_URL_LENGTH' not in state_sync:
        raise AssertionError('Weekly incremental backup must guard GitHub URL length')
    if "window.open(url,'_blank','noopener,noreferrer')" in state_sync:
        raise AssertionError('backup must not reintroduce noopener null-return double-navigation bug')

    require('scripts/save_weekly_state.py','weekly-state-delta','weekly-state-deltas','cursor_updated_at','cursor_id','entry_count','save_delta','Base Weekly state backup is missing')
    require('.github/workflows/weekly-state-sync.yml','data/weekly-state-deltas','增量会自动与历史基线合并恢复')

    sources=json.loads(read('config/sources.json'))
    names={str(x.get('name') or '') for x in sources}
    stopped={'AV Watch','ギズモード・ジャパン','PR EDGE','ECZine:新着一覧','CNET Japan'}
    if names & stopped:
        raise AssertionError(f'stopped/merged sources returned to active config: {sorted(names & stopped)}')
    if len(sources)!=16:
        raise AssertionError(f'active source count must be 16 after pruning CNET and merged/stopped sources, got {len(sources)}')
    dentsu=next((x for x in sources if str(x.get('name') or '').startswith('ウェブ電通報')),None)
    if not dentsu or dentsu.get('type')!='html_feed_fallback' or 'dentsu-ho.com' not in str(dentsu.get('url') or ''):
        raise AssertionError('Dentsu must use official HTML listing fallback rather than retired RSS')

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

    print('Global impact validation passed: 16 sources -> S/A priority queue -> durable Later/feedback Preference Memory -> encrypted recoverable history -> deterministic v29-v33 UI.')
    return 0


if __name__=='__main__':raise SystemExit(main())
