#!/usr/bin/env python3
"""Run Weekly with unified Knowledge + Work System + semantic screening."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import update_feeds as base
from personal_relevance import (
    CONTRADICTION_RE,
    PRACTICAL_RE,
    QUALITY_RE,
    prompt_context,
    score_text,
)
from weekly_semantic import SemanticMatcher, semantic_adjustment

_original_heuristic = base.heuristic


def clamp(x: float, lo: float = 0.0, hi: float = 10.0) -> float:
    return max(lo, min(hi, x))


def article_full_text(a: dict) -> str:
    return ' '.join([
        a.get('title', '') or '',
        a.get('summary', '') or '',
        (a.get('content_excerpt', '') or '')[:5000],
    ])


def apply_personal_context(src, title, summary, content=''):
    """Fast lexical pass used before semantic batching; also decides first deep-read candidates."""
    score, notion, tags, features, reason = _original_heuristic(src, title, summary, content)
    full = ' '.join([title or '', summary or '', (content or '')[:5000]])
    bonus, why, diag = score_text(full)
    reading = clamp(score + bonus)
    notion_delta = bonus
    if diag.get('repetition_penalty', 0):
        notion_delta -= min(.45, diag['repetition_penalty'] * .55)
    notion = clamp(notion + notion_delta)
    if why:
        reason = (reason + '；' if reason else '') + '个人体系增量：' + why
    return score, reading, notion, tags, features, reason, diag


def personalized_heuristic(src, title, summary, content=''):
    _, reading, notion, tags, features, reason, _ = apply_personal_context(src, title, summary, content)
    return reading, notion, tags, features, reason


def personalized_llm_screen(a):
    key = os.getenv('OPENAI_API_KEY')
    model = os.getenv('OPENAI_MODEL')
    if not key or not model:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        feature_schema = {'type': 'object', 'properties': {
            'topics': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 6},
            'formats': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 3},
            'intents': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 3},
            'signals': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 3}
        }, 'required': ['topics', 'formats', 'intents', 'signals'], 'additionalProperties': False}
        schema = {'type': 'object', 'properties': {
            'grade': {'type': 'string', 'enum': ['S', 'A', 'B', 'C']},
            'reading_score': {'type': 'number', 'minimum': 0, 'maximum': 10},
            'notion_score': {'type': 'number', 'minimum': 0, 'maximum': 10},
            'reason': {'type': 'string'},
            'increment_type': {'type': 'string', 'enum': ['rule_evidence', 'knowledge_gap', 'boundary_or_counterexample', 'direct_work_use', 'mostly_duplicate', 'general_relevance']},
            'tags': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 6},
            'learning_features': feature_schema
        }, 'required': ['grade', 'reading_score', 'notion_score', 'reason', 'increment_type', 'tags', 'learning_features'], 'additionalProperties': False}
        _, local_why, _ = score_text(article_full_text(a))
        context = prompt_context()
        prompt = f'''你在维护一个个人工作知识系统。用户长期做日本EC/Marketing/GTM，个人体系由真实工作经验、读书笔记、Amazon/EC实战手册和Notion知识库组成。\n\n{context}\n\n本地词面知识匹配提示：{local_why or '无明显匹配'}（只作为辅助；后续还会使用统一 multilingual-e5 语义向量与 Knowledge / Work System 做比较）。\n\n筛选目标不是“主题越像越好”，而是判断新文章对既有工作体系的增量：\n1. rule_evidence：为已有工作判断补充更强数据、案例或验证；\n2. knowledge_gap：补足体系里相关但薄弱的知识空白；\n3. boundary_or_counterexample：提供反例、失败案例、边界条件，可能修正规则；\n4. direct_work_use：可以马上用于GTM/EC/品牌/广告/消费者研究/AI工作流/管理决策；\n5. mostly_duplicate：虽然相关，但大部分只是用户已经知道的内容，且没有新证据/方法/反例；\n6. general_relevance：一般相关。\n\n评分要求：mostly_duplicate原则上降到B/C；有强数据、反例、边界条件，即使挑战用户现有认知，也应升高。不要制造过滤泡泡。S=高增量且值得精读；A=明确增量；B=摘要足够；C=跳过。\n\n来源：{a['source']}\n标题：{a['title']}\n摘要：{a.get('summary','')}\n正文可见片段：{a.get('content_excerpt','')}\n仅根据可见信息判断。\n\nlearning_features 必须拆成四维：topics / formats / intents / signals。主题和文章形式必须分开，例如“AI线上研讨会”同时标AI主题、线上研讨会形式、活动告知意图。'''
        resp = client.responses.create(model=model, input=prompt, text={'format': {'type': 'json_schema', 'name': 'screening', 'schema': schema, 'strict': True}}, store=False)
        out = json.loads(resp.output_text)
        out['reason'] = f"[{out['increment_type']}] " + out['reason']
        return out
    except Exception as e:
        print('Personalized LLM fallback:', e)
        return None


def increment_type(lex_diag: dict, sem_diag: dict, practical: bool) -> str:
    if max(float(lex_diag.get('boundary_bonus', 0)), float(sem_diag.get('boundary_bonus', 0))) > 0:
        return 'boundary_or_counterexample'
    if max(float(lex_diag.get('gap_bonus', 0)), float(sem_diag.get('gap_bonus', 0))) >= .25:
        return 'knowledge_gap'
    if max(float(lex_diag.get('evidence_bonus', 0)), float(sem_diag.get('evidence_bonus', 0))) > 0:
        return 'rule_evidence'
    if max(float(lex_diag.get('repetition_penalty', 0)), float(sem_diag.get('repetition_penalty', 0))) >= .35:
        return 'mostly_duplicate'
    if practical and max(float(sem_diag.get('rule_similarity', 0)), float(sem_diag.get('experience_similarity', 0))) >= .74:
        return 'direct_work_use'
    return 'general_relevance'


def score_one(a: dict, src: dict, sem) -> tuple[float, float, dict, dict, str, list, dict]:
    raw, raw_notion, tags, features, base_reason = _original_heuristic(
        src, a.get('title', ''), a.get('summary', ''), a.get('content_excerpt', '')
    )
    full = article_full_text(a)
    lex_bonus, lex_why, lex_diag = score_text(full)
    quality = bool(QUALITY_RE.search(full))
    contradiction = bool(CONTRADICTION_RE.search(full))
    practical = bool(PRACTICAL_RE.search(full))
    sem_bonus, sem_why, sem_diag = semantic_adjustment(
        full, sem, quality=quality, contradiction=contradiction, practical=practical
    )

    # Semantic relevance is the primary personal-context signal; lexical matching remains a
    # complementary guardrail for exact terms, formats and explicit evidence/boundary language.
    combined = max(-1.1, min(1.95, .45 * lex_bonus + .88 * sem_bonus))

    if a.get('screening') == 'openai_api' or a.get('api_reading_score') is not None:
        if a.get('api_reading_score') is None:
            a['api_reading_score'] = float(a.get('reading_score') or raw)
            a['api_notion_score'] = float(a.get('notion_score') or raw_notion)
            a['api_reason'] = a.get('reason') or ''
        baseline = float(a.get('api_reading_score') or raw)
        notion_baseline = float(a.get('api_notion_score') or raw_notion)
        leading_reason = a.get('api_reason') or base_reason
    else:
        baseline = raw
        notion_baseline = raw_notion
        leading_reason = base_reason

    reading = clamp(baseline + combined)
    extra_notion = .8 * combined + .12 * (
        float(sem_diag.get('gap_bonus', 0)) + float(sem_diag.get('evidence_bonus', 0)) + float(sem_diag.get('boundary_bonus', 0))
    ) - .18 * float(sem_diag.get('repetition_penalty', 0))
    notion = clamp(notion_baseline + extra_notion)
    inc = increment_type(lex_diag, sem_diag, practical)

    why_parts = []
    if sem_why:
        why_parts.append('语义增量：' + sem_why)
    if lex_why and not sem_why:
        why_parts.append('知识信号：' + lex_why)
    reason = leading_reason or ''
    if why_parts:
        reason = (reason + '；' if reason else '') + '；'.join(why_parts)

    knowledge_context = {
        'used': True,
        'version': 'semantic_v6',
        'knowledge_match_strength': round(max(float(lex_diag.get('knowledge_match_strength', 0)) / 6.0, float(sem_diag.get('knowledge_similarity', 0))), 3),
        'rule_match_strength': round(max(float(lex_diag.get('rule_match_strength', 0)) / 6.0, float(sem_diag.get('rule_similarity', 0))), 3),
        'experience_similarity': round(float(sem_diag.get('experience_similarity', 0)), 3),
        'repetition_penalty': round(max(float(lex_diag.get('repetition_penalty', 0)), float(sem_diag.get('repetition_penalty', 0))), 3),
        'gap_bonus': round(max(float(lex_diag.get('gap_bonus', 0)), float(sem_diag.get('gap_bonus', 0))), 3),
        'evidence_bonus': round(max(float(lex_diag.get('evidence_bonus', 0)), float(sem_diag.get('evidence_bonus', 0))), 3),
        'boundary_bonus': round(max(float(lex_diag.get('boundary_bonus', 0)), float(sem_diag.get('boundary_bonus', 0))), 3),
        'semantic_bonus': round(float(sem_diag.get('semantic_bonus', 0)), 3),
        'increment_type': inc,
    }
    return reading, notion, knowledge_context, sem.vector_dict(), reason, tags, features


def deep_read_semantic_candidates(payload: dict, matcher: SemanticMatcher, sem_results: dict, by_name: dict) -> int:
    candidates = []
    for a in payload.get('articles', []):
        if a.get('content_checked') or a.get('semantic_deep_read_attempted_at'):
            continue
        src = by_name.get(a.get('source'))
        sem = sem_results.get(str(a.get('id') or ''))
        if not src or not sem or src.get('type') == 'html_listing':
            continue
        try:
            reading, _, kc, _, _, _, _ = score_one(a, src, sem)
        except Exception:
            continue
        work_fit = max(kc.get('rule_match_strength', 0), kc.get('experience_similarity', 0))
        duplicate = kc.get('repetition_penalty', 0)
        if reading >= 7.0 or (work_fit >= .79 and duplicate < .5):
            candidates.append((reading + work_fit, a, src))
    candidates.sort(key=lambda x: x[0], reverse=True)
    changed = 0
    now = datetime.now(timezone.utc).isoformat()
    for _, a, src in candidates[:10]:
        content, checked, err = base.fetch_text(a.get('url', ''))
        a['semantic_deep_read_attempted_at'] = now
        if checked:
            a['content_checked'] = True
            a['content_excerpt'] = content[:5000]
            changed += 1
        elif err and not a.get('screening_note'):
            a['screening_note'] = f'正文未自动读取：{err}'
    return changed


def refresh_existing_scores():
    """Re-score every candidate using the same semantic model as Work System."""
    if not base.ART_PATH.exists():
        return
    payload = json.loads(base.ART_PATH.read_text(encoding='utf-8'))
    by_name = {s.get('name'): s for s in base.SOURCES}
    articles = [a for a in payload.get('articles', []) if by_name.get(a.get('source'))]
    if not articles:
        return

    try:
        matcher = SemanticMatcher()
        sem_results = matcher.analyze(articles)
    except Exception as e:
        print('Weekly semantic fallback to lexical:', e)
        sem_results = {}
        matcher = None

    semantic_deep = 0
    if matcher and sem_results:
        semantic_deep = deep_read_semantic_candidates(payload, matcher, sem_results, by_name)
        if semantic_deep:
            sem_results = matcher.analyze(articles)

    changed = 0
    for a in articles:
        src = by_name.get(a.get('source'))
        raw, lexical_reading, lexical_notion, tags, features, lexical_reason, lex_diag = apply_personal_context(
            src, a.get('title', ''), a.get('summary', ''), a.get('content_excerpt', '')
        )
        a['base_score'] = round(raw, 2)
        if sem_results.get(str(a.get('id') or '')):
            sem = sem_results[str(a.get('id') or '')]
            reading, notion, kc, vector, reason, tags, features = score_one(a, src, sem)
            a['reading_score'] = round(reading, 2)
            a['notion_score'] = round(notion, 2)
            a['knowledge_context'] = kc
            a['semantic_vector'] = vector
            a['reason'] = reason
            a['screening'] = 'semantic_v6' if a.get('api_reading_score') is None else 'openai_api_plus_semantic_v6'
        else:
            a['reading_score'] = round(lexical_reading, 2)
            a['notion_score'] = round(lexical_notion, 2)
            a['reason'] = lexical_reason
            a['screening'] = 'knowledge_aware_heuristic'
            a['knowledge_context'] = {
                'used': True,
                'version': 'lexical_fallback',
                'knowledge_match_strength': lex_diag.get('knowledge_match_strength', 0),
                'rule_match_strength': lex_diag.get('rule_match_strength', 0),
                'repetition_penalty': lex_diag.get('repetition_penalty', 0),
                'gap_bonus': lex_diag.get('gap_bonus', 0),
                'evidence_bonus': lex_diag.get('evidence_bonus', 0),
                'boundary_bonus': lex_diag.get('boundary_bonus', 0),
            }
        a['grade'] = 'S' if a['reading_score'] >= 8.7 else 'A' if a['reading_score'] >= 7.2 else 'B' if a['reading_score'] >= 5.5 else 'C'
        a['tags'] = tags
        a['learning_features'] = features
        a['concepts'] = features.get('topics', [])
        changed += 1

    meta = payload.setdefault('meta', {})
    meta['knowledge_context_refreshed_at'] = datetime.now(timezone.utc).isoformat()
    meta['knowledge_context_rescored_count'] = changed
    meta['personalization_version'] = 'semantic_v6'
    meta['semantic_model_family'] = 'multilingual-e5'
    meta['semantic_rescored_count'] = len(sem_results)
    meta['semantic_deep_read_count'] = semantic_deep
    base.ART_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')

    if base.STATUS_PATH.exists():
        st = json.loads(base.STATUS_PATH.read_text(encoding='utf-8'))
        st['semantic_model_family'] = 'multilingual-e5'
        st['semantic_rescored_count'] = len(sem_results)
        st['semantic_deep_read_count'] = semantic_deep
        st['deep_read_count'] = int(st.get('deep_read_count') or 0) + semantic_deep
        base.STATUS_PATH.write_text(json.dumps(st, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Rescored {changed} Weekly candidates; semantic={len(sem_results)}, semantic deep reads={semantic_deep}')


base.heuristic = personalized_heuristic
base.llm_screen = personalized_llm_screen

if __name__ == '__main__':
    base.main()
    refresh_existing_scores()
