#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from sentence_transformers import SentenceTransformer

import build_system_model as crypto
import build_semantic_index as semantic_index

ROOT = Path(__file__).resolve().parents[1]
INDEX_ENC = ROOT / 'data' / 'semantic-index.enc.json'


def _b64decode_int8(s: str) -> np.ndarray:
    return np.frombuffer(base64.b64decode(s), dtype=np.int8)


def _normalize_rows(x: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(x, axis=1, keepdims=True)
    n[n == 0] = 1.0
    return x / n


def _quantize_one(vec: np.ndarray) -> tuple[str, float]:
    max_abs = float(np.max(np.abs(vec))) if vec.size else 0.0
    scale = max(max_abs / 127.0, 1e-8)
    q = np.clip(np.rint(vec / scale), -127, 127).astype(np.int8)
    return base64.b64encode(q.tobytes()).decode('ascii'), round(scale, 10)


def article_text(a: dict) -> str:
    return semantic_index.clean(' '.join([
        str(a.get('title') or ''),
        str(a.get('summary') or ''),
        str(a.get('content_excerpt') or ''),
    ]))


def article_chunks(a: dict, max_chunks: int = 5) -> list[str]:
    title = semantic_index.clean(str(a.get('title') or ''))
    body = article_text(a)
    chunks = semantic_index.split_chunks(body)
    if len(chunks) > max_chunks:
        idx = np.linspace(0, len(chunks) - 1, max_chunks).round().astype(int)
        chunks = [chunks[i] for i in sorted(set(idx.tolist()))]
    out = []
    for _, chunk in chunks:
        out.append(f'query: {title}\n{chunk}' if title else f'query: {chunk}')
    return out or [f'query: {title}' if title else 'query: unknown']


@dataclass
class SemanticResult:
    vector_b64: str
    vector_scale: float
    dimension: int
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
        return {
            'version': 1,
            'family': 'multilingual-e5',
            'dim': self.dimension,
            'q': self.vector_b64,
            'scale': self.vector_scale,
            'normalized': True,
        }


class SemanticMatcher:
    def __init__(self) -> None:
        payload = crypto.decrypt(INDEX_ENC)
        if not payload:
            raise RuntimeError('Encrypted semantic index is unavailable or could not be decrypted.')
        self.meta = payload.get('meta') or {}
        self.entries = payload.get('entries') or []
        self.scales = np.asarray(payload.get('scales') or [], dtype=np.float32)
        self.dim = int(self.meta.get('dimension') or 0)
        raw = _b64decode_int8(payload.get('vectors_b64') or '')
        if not self.dim or len(self.entries) == 0 or raw.size != len(self.entries) * self.dim:
            raise RuntimeError('Semantic index shape is invalid.')
        q = raw.reshape(len(self.entries), self.dim).astype(np.float32)
        if self.scales.shape[0] != len(self.entries):
            raise RuntimeError('Semantic index scale count does not match entries.')
        self.matrix = _normalize_rows(q * self.scales[:, None])
        self.kinds = np.asarray([str(e.get('kind') or '') for e in self.entries], dtype=object)
        self.ids = np.asarray([str(e.get('id') or '') for e in self.entries], dtype=object)
        self.model_id = str(self.meta.get('model') or os.getenv('SEMANTIC_MODEL_ID') or 'intfloat/multilingual-e5-small')
        self._model: SentenceTransformer | None = None

    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            print(f'Loading Weekly semantic model: {self.model_id}')
            self._model = SentenceTransformer(self.model_id)
        return self._model

    def _aggregate_kind(self, sims: np.ndarray, kind: str) -> tuple[float, float]:
        mask = self.kinds == kind
        if not np.any(mask):
            return 0.0, 0.0
        vals = sims[mask]
        ids = self.ids[mask]
        best_by_id: dict[str, float] = {}
        for item_id, score in zip(ids.tolist(), vals.tolist()):
            best_by_id[item_id] = max(best_by_id.get(item_id, -1.0), float(score))
        top = sorted(best_by_id.values(), reverse=True)[:3]
        if not top:
            return 0.0, 0.0
        return top[0], sum(top) / len(top)

    def analyze(self, articles: Iterable[dict]) -> dict[str, SemanticResult]:
        articles = list(articles)
        all_texts: list[str] = []
        spans: list[tuple[int, int]] = []
        for a in articles:
            chunks = article_chunks(a)
            start = len(all_texts)
            all_texts.extend(chunks)
            spans.append((start, len(all_texts)))
        if not all_texts:
            return {}
        vectors = self.model.encode(
            all_texts,
            batch_size=32,
            show_progress_bar=False,
            normalize_embeddings=True,
            convert_to_numpy=True,
        ).astype(np.float32)
        out: dict[str, SemanticResult] = {}
        for a, (start, end) in zip(articles, spans):
            av = vectors[start:end]
            if av.size == 0:
                continue
            doc = av.mean(axis=0)
            norm = float(np.linalg.norm(doc))
            if norm:
                doc = doc / norm
            packed, scale = _quantize_one(doc.astype(np.float32))
            sims = np.max(av @ self.matrix.T, axis=0)
            rule_max, rule_mean = self._aggregate_kind(sims, 'rule')
            know_max, know_mean = self._aggregate_kind(sims, 'notion')
            exp_max, exp_mean = self._aggregate_kind(sims, 'private')
            out[str(a.get('id') or '')] = SemanticResult(
                vector_b64=packed,
                vector_scale=scale,
                dimension=self.dim,
                rule_similarity=rule_max,
                knowledge_similarity=know_max,
                experience_similarity=exp_max,
                rule_top3_mean=rule_mean,
                knowledge_top3_mean=know_mean,
                experience_top3_mean=exp_mean,
            )
        return out


def semantic_adjustment(text: str, result: SemanticResult, *, quality: bool, contradiction: bool, practical: bool) -> tuple[float, str, dict]:
    rule = result.rule_similarity
    know = result.knowledge_similarity
    exp = result.experience_similarity
    work_fit = max(rule, exp * 0.98)

    fit_bonus = max(0.0, min(0.75, (work_fit - 0.72) / 0.14 * 0.75))
    gap_bonus = 0.0
    if work_fit >= 0.77 and know <= work_fit - 0.045:
        gap_bonus = min(0.5, (work_fit - know - 0.045) * 4.2 + 0.14)
    evidence_bonus = 0.32 if quality and rule >= 0.75 else (0.18 if quality and work_fit >= 0.73 else 0.0)
    boundary_bonus = 0.48 if contradiction and rule >= 0.74 else (0.28 if contradiction and work_fit >= 0.72 else 0.0)
    practical_bonus = 0.24 if practical and work_fit >= 0.75 else 0.0

    repetition_penalty = 0.0
    if know >= 0.86 and not quality and not contradiction and gap_bonus == 0:
        repetition_penalty = min(0.8, 0.22 + (know - 0.86) * 4.0)
    elif know >= 0.9 and quality and rule < 0.76:
        repetition_penalty = min(0.35, 0.12 + (know - 0.9) * 2.0)

    bonus = max(-0.9, min(1.65, fit_bonus + gap_bonus + evidence_bonus + boundary_bonus + practical_bonus - repetition_penalty))
    labels: list[str] = []
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
