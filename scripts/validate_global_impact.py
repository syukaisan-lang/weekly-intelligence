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
    # One semantic architecture must feed Work System, Weekly selection and feedback learning.
    require('scripts/build_semantic_index.py','multilingual-e5','semantic-index.enc.json','private','notion','rule')
    require('scripts/weekly_semantic.py','semantic-index.enc.json','weekly_embed_node.mjs','multilingual-e5')
    require('scripts/weekly_embed_node.mjs','semantic-worker.bundle.js','rule_similarity','knowledge_similarity','experience_similarity')
    require('scripts/update_feeds_personalized.py','SemanticMatcher','semantic_v6','semantic_vector','increment_type')
    require('weekly-progress.js','semantic_vector','semanticPreferenceDelta','subjectAffinity','旅游/观光','内容主题 + 研究/呈现方式 + 意图')
    require('work-system.html','work-system-vector-v6.js')

    # Feedback attribution must distinguish subject from method/format.
    weekly=read('weekly-progress.js')
    if 'f.topics.forEach(x=>add(prefs.topics,x,strong?-.14:-.06))' not in weekly:
        raise AssertionError('ordinary negative feedback must primarily penalize content subject')
    if 'if(s.w<0)affinity*=subjectAffinity' not in weekly:
        raise AssertionError('negative semantic transfer must be gated by subject affinity')

    # State/history must stay independent from recommendation rescoring and remain recoverable.
    require('weekly-state-sync.js','feedback','updated_at','恢复云端','备份本周标记')
    require('weekly-progress.js',"gf.value='ALL'",'isMarked')

    # Synchronization ownership: Google/Notion rebuild system+index; Weekly only consumes latest state.
    require('.github/workflows/work-system-sync.yml','build_semantic_index.py','build_system_model_precision.py')
    require('.github/workflows/notion-sync.yml','build_semantic_index.py','build_system_model_precision.py')
    update=read('.github/workflows/update.yml')
    if 'update_feeds_personalized.py' not in update:raise AssertionError('Weekly workflow must run personalized updater')
    if 'build_system_model_v2.py' in update or 'build_system_model_v3.py' in update:
        raise AssertionError('Weekly workflow must not overwrite the unified Work System model')

    # Public semantic metadata may expose counts/model family, never private titles/text/vectors.
    meta_path=ROOT/'data'/'semantic-index.json'
    if meta_path.exists():
        meta=json.loads(meta_path.read_text(encoding='utf-8')).get('meta') or {}
        if meta.get('embedding_family')!='multilingual-e5':raise AssertionError('semantic-index model family drift')
        if not meta.get('encrypted_full_data'):raise AssertionError('full semantic index must remain encrypted')
        if 'vectors_b64' in json.loads(meta_path.read_text(encoding='utf-8')):raise AssertionError('public semantic metadata must not contain vectors')

    print('Global impact validation passed: Work System -> Knowledge -> Weekly -> subject-aware feedback -> backup are aligned.')
    return 0


if __name__=='__main__':raise SystemExit(main())
