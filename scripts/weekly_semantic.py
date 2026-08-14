#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import build_system_model as crypto

ROOT = Path(__file__).resolve().parents[1]
INDEX_ENC = ROOT / 'data' / 'semantic-index.enc.json'
NODE_RUNNER = ROOT / 'scripts' / 'weekly_embed_node.mjs'
WS_RE = re.compile(r'\s+')
MAX_CHARS = 720
OVERLAP = 100
MAX_CHUNKS = 3


def clean(text: str) -> str:
    return WS_RE.sub(' ', str(text or '')).strip()


def split_chunks(text: str) -> list[str]:
    text = clean(text)
    if not text:
        return []
    if len(text) <= MAX_CHARS:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + MAX_CHARS)
        if end < len(text):
            window = text[start:end]
            cut = max(window.rfind('。'), window.rfind('！'), window.rfind('？'), window.rfind('. '), window.rfind(' '))
            if cut >= int(MAX_CHARS * .58):
                end = start + cut + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(start + 1, end - OVERLAP)
    if len(chunks) <= MAX_CHUNKS:
        return chunks
    if MAX_CHUNKS == 1:
        return [chunks[0]]
    idx = sorted(set(round(i * (len(chunks) - 1) / (MAX_CHUNKS - 1)) for i in range(MAX_CHUNKS)))
    return [chunks[i] for i in idx]


def article_chunks(a: dict) -> list[str]:
    title = clean(a.get('title') or '')
    body = clean(' '.join([
        title,
        str(a.get('summary') or ''),
        str(a.get('content_excerpt') or ''),
    ]))
    chunks = split_chunks(body)
    return [f'{title}\n{x}' if title else x for x in chunks] or [title or 'unknown']


@dataclass
class SemanticResult:
    vector: dict
    rule_similarity: float
    knowledge_similarity: float
    experience_similarity: float
    rule_top3_mean: float
    knowledge_top3_mean: float
    experience_top3_mean: float

    def public_dict(self) -> dict:
        return {
            'version': 1,
            'model_family': 'multilingual-e5',
            'rule_similarity': round(self.rule_similarity, 4),
            'knowledge_similarity': round(self.knowledge_similarity, 4),
            'experience_similarity': round(self.experience_similarity, 4),
            'rule_top3_mean': round(self.rule_top3_mean, 4),
            'knowledge_top3_mean': round(self.knowledge_top3_mean, 4),
            'experience_top3_mean': round(self.experience_top3_mean, 4),
        }

    def vector_dict(self) -> dict:
        return dict(self.vector or {})


class SemanticMatcher:
    def __init__(self) -> None:
        payload = crypto.decrypt(INDEX_ENC)
        if not payload:
            raise RuntimeError('Encrypted semantic index is unavailable or could not be decrypted.')
        meta = payload.get('meta') or {}
        self.dim = int(meta.get('dimension') or 0)
        self.payload = {
            'dim': self.dim,
            'entries': payload.get('entries') or [],
            'scales': payload.get('scales') or [],
            'vectors_b64': payload.get('vectors_b64') or '',
        }
        if not self.dim or not self.payload['entries'] or not self.payload['vectors_b64']:
            raise RuntimeError('Semantic index payload is incomplete.')
        if not NODE_RUNNER.exists():
            raise RuntimeError('Weekly semantic Node runner is missing.')

    def analyze(self, articles: Iterable[dict]) -> dict[str, SemanticResult]:
        rows = []
        for a in articles:
            item_id = str(a.get('id') or '')
            if item_id:
                rows.append({'id': item_id, 'chunks': article_chunks(a)})
        if not rows:
            return {}
        req = {'index': self.payload, 'articles': rows}
        proc = subprocess.run(
            ['node', str(NODE_RUNNER)],
            input=json.dumps(req, ensure_ascii=False),
            text=True,
            capture_output=True,
            cwd=str(ROOT),
            timeout=900,
        )
        if proc.returncode != 0:
            raise RuntimeError('Node semantic matcher failed: ' + (proc.stderr or proc.stdout)[-600:])
        raw = json.loads(proc.stdout or '{}').get('results') or {}
        out = {}
        for item_id, r in raw.items():
            out[item_id] = SemanticResult(
                vector=r.get('vector') or {},
                rule_similarity=float(r.get('rule_similarity') or 0),
                knowledge_similarity=float(r.get('knowledge_similarity') or 0),
                experience_similarity=float(r.get('experience_similarity') or 0),
                rule_top3_mean=float(r.get('rule_top3_mean') or 0),
                knowledge_top3_mean=float(r.get('knowledge_top3_mean') or 0),
                experience_top3_mean=float(r.get('experience_top3_mean') or 0),
            )
        return out


def semantic_adjustment(text: str, result: SemanticResult, *, quality: bool, contradiction: bool, practical: bool) -> tuple[float, str, dict]:
    rule = result.rule_similarity
    know = result.knowledge_similarity
    exp = result.experience_similarity
    work_fit = max(rule, exp * .98)

    fit_bonus = max(0.0, min(.75, (work_fit - .72) / .14 * .75))
    gap_bonus = 0.0
    if work_fit >= .77 and know <= work_fit - .045:
        gap_bonus = min(.5, (work_fit - know - .045) * 4.2 + .14)
    evidence_bonus = .32 if quality and rule >= .75 else (.18 if quality and work_fit >= .73 else 0.0)
    boundary_bonus = .48 if contradiction and rule >= .74 else (.28 if contradiction and work_fit >= .72 else 0.0)
    practical_bonus = .24 if practical and work_fit >= .75 else 0.0

    repetition_penalty = 0.0
    if know >= .86 and not quality and not contradiction and gap_bonus == 0:
        repetition_penalty = min(.8, .22 + (know - .86) * 4.0)
    elif know >= .9 and quality and rule < .76:
        repetition_penalty = min(.35, .12 + (know - .9) * 2.0)

    bonus = max(-.9, min(1.65, fit_bonus + gap_bonus + evidence_bonus + boundary_bonus + practical_bonus - repetition_penalty))
    labels = []
    if boundary_bonus:
        labels.append('可能补充反例/边界')
    if gap_bonus:
        labels.append('与现有规则相关但 Knowledge 覆盖较薄')
    if evidence_bonus:
        labels.append('可能补充证据/案例')
    if practical_bonus:
        labels.append('与实际工作场景语义接近')
    if repetition_penalty:
        labels.append('与既有 Knowledge 语义重复较高')
    if not labels and fit_bonus:
        labels.append('与 Work System 语义相关')
    diag = {
        **result.public_dict(),
        'fit_bonus': round(fit_bonus, 3),
        'gap_bonus': round(gap_bonus, 3),
        'evidence_bonus': round(evidence_bonus, 3),
        'boundary_bonus': round(boundary_bonus, 3),
        'practical_bonus': round(practical_bonus, 3),
        'repetition_penalty': round(repetition_penalty, 3),
        'semantic_bonus': round(bonus, 3),
    }
    return round(bonus, 3), '；'.join(labels), diag
