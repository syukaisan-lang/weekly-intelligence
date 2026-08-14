#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

import build_system_model as crypto

ROOT = Path(__file__).resolve().parents[1]
OUT_META = ROOT / 'data' / 'semantic-index.json'
OUT_ENC = ROOT / 'data' / 'semantic-index.enc.json'
MODEL_ID = os.getenv('SEMANTIC_MODEL_ID', 'intfloat/multilingual-e5-small').strip()
BROWSER_MODEL_ID = os.getenv('SEMANTIC_BROWSER_MODEL_ID', 'Xenova/multilingual-e5-small').strip()
MAX_CHARS = int(os.getenv('SEMANTIC_CHUNK_CHARS', '720'))
OVERLAP = int(os.getenv('SEMANTIC_CHUNK_OVERLAP', '100'))
MAX_CHUNKS_PER_ITEM = int(os.getenv('SEMANTIC_MAX_CHUNKS', '10'))
TEMPORAL_FIELDS = ('effective_date','evidence_period','published_at','collected_at','temporal_confidence','temporal_basis','time_sensitive','time_domain')

WS_RE = re.compile(r'\s+')


def clean(text: str) -> str:
    return WS_RE.sub(' ', str(text or '')).strip()


def split_chunks(text: str, max_chars: int = MAX_CHARS, overlap: int = OVERLAP) -> list[tuple[int, str]]:
    text = clean(text)
    if not text:
        return []
    if len(text) <= max_chars:
        return [(0, text)]
    chunks: list[tuple[int, str]] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(n, start + max_chars)
        if end < n:
            window = text[start:end]
            cut = max(window.rfind('。'), window.rfind('！'), window.rfind('？'), window.rfind('. '), window.rfind(' '))
            if cut >= int(max_chars * 0.58):
                end = start + cut + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append((start, chunk))
        if end >= n:
            break
        start = max(start + 1, end - overlap)
    if len(chunks) <= MAX_CHUNKS_PER_ITEM:
        return chunks
    idx = np.linspace(0, len(chunks) - 1, MAX_CHUNKS_PER_ITEM).round().astype(int)
    return [chunks[i] for i in sorted(set(idx.tolist()))]


def note_body(n: dict) -> str:
    return clean(' '.join([
        str(n.get('source_label') or ''),
        str(n.get('section') or ''),
        str(n.get('title') or ''),
        str(n.get('text') or ''),
        ' '.join(x.get('name', '') for x in (n.get('domains') or []) if isinstance(x, dict)),
    ]))


def knowledge_body(a: dict) -> str:
    comments = ' '.join(str(c.get('text') or '') for c in (a.get('comments') or []) if isinstance(c, dict))
    return clean(' '.join([
        str(a.get('category') or ''),
        str(a.get('title') or ''),
        str(a.get('summary') or ''),
        str(a.get('page_body') or ''),
        ' '.join(a.get('topics') or []),
        comments,
    ]))


def rule_body(r: dict) -> str:
    return clean(' '.join([
        str(r.get('domain') or ''),
        str(r.get('title') or ''),
        str(r.get('decision_rule') or r.get('principle') or r.get('detail') or ''),
        str(r.get('when') or ''),
        ' '.join(r.get('not_when') or []),
        ' '.join(r.get('questions') or []),
        ' '.join(r.get('steps') or []),
        ' '.join(r.get('metrics') or []),
        ' '.join(r.get('traps') or []),
        ' '.join(r.get('tensions') or []),
    ]))


def temporal_meta(a: dict) -> dict:
    return {k:a.get(k) for k in TEMPORAL_FIELDS if a.get(k) not in (None,'',[],{})}


def add_item(rows: list[dict], texts: list[str], *, kind: str, item_id: str, title: str, body: str, metadata: dict | None = None) -> None:
    if not item_id or not body:
        return
    chunks = split_chunks(body)
    for chunk_idx, (start, chunk) in enumerate(chunks):
        passage = f'passage: {title}\n{chunk}' if title else f'passage: {chunk}'
        texts.append(passage)
        row={
            'kind': kind,
            'id': str(item_id),
            'chunk': chunk_idx,
            'start': start,
            'snippet': chunk[:360],
        }
        if metadata:
            row['temporal']=metadata
        rows.append(row)


def quantize(vectors: np.ndarray) -> tuple[str, list[float]]:
    packed = bytearray()
    scales: list[float] = []
    for vec in vectors:
        max_abs = float(np.max(np.abs(vec))) if vec.size else 0.0
        scale = max(max_abs / 127.0, 1e-8)
        q = np.clip(np.rint(vec / scale), -127, 127).astype(np.int8)
        packed.extend(q.tobytes())
        scales.append(round(scale, 10))
    return base64.b64encode(bytes(packed)).decode('ascii'), scales


def main() -> int:
    work = crypto.decrypt(crypto.WORK_ENC)
    know = crypto.decrypt(crypto.KNOW_ENC)
    system = crypto.decrypt(crypto.OUT_ENC)
    if not work or not know:
        raise RuntimeError('Work System and Knowledge encrypted snapshots must exist before semantic indexing.')

    rows: list[dict] = []
    texts: list[str] = []

    for n in work.get('notes') or []:
        add_item(rows, texts, kind='private', item_id=str(n.get('id') or ''), title=str(n.get('title') or n.get('section') or ''), body=note_body(n))

    for a in know.get('items') or []:
        add_item(rows, texts, kind='notion', item_id=str(a.get('id') or ''), title=str(a.get('title') or ''), body=knowledge_body(a), metadata=temporal_meta(a))

    for r in (system or {}).get('rules') or []:
        add_item(rows, texts, kind='rule', item_id=str(r.get('id') or ''), title=str(r.get('title') or ''), body=rule_body(r))

    if not texts:
        raise RuntimeError('No semantic indexable text was found.')

    print(f'Loading semantic model: {MODEL_ID}')
    model = SentenceTransformer(MODEL_ID)
    vectors = model.encode(
        texts,
        batch_size=32,
        show_progress_bar=True,
        normalize_embeddings=True,
        convert_to_numpy=True,
    ).astype(np.float32)
    if vectors.ndim != 2 or vectors.shape[0] != len(rows):
        raise RuntimeError(f'Unexpected embedding shape: {vectors.shape}')

    vectors_b64, scales = quantize(vectors)
    now = datetime.now(timezone.utc).isoformat()
    item_keys = {(r['kind'], r['id']) for r in rows}
    counts: dict[str, int] = {}
    for kind, _ in item_keys:
        counts[kind] = counts.get(kind, 0) + 1
    temporal_chunks=sum(1 for r in rows if r.get('kind')=='notion' and r.get('temporal'))

    payload = {
        'meta': {
            'schema_version': 2,
            'built_at': now,
            'model': MODEL_ID,
            'browser_model': BROWSER_MODEL_ID,
            'embedding_family': 'multilingual-e5',
            'dimension': int(vectors.shape[1]),
            'vector_count': len(rows),
            'item_count': len(item_keys),
            'prefix_policy': {'query': 'query: ', 'passage': 'passage: '},
            'quantization': 'per-vector-int8',
            'normalized': True,
            'chunk_chars': MAX_CHARS,
            'chunk_overlap': OVERLAP,
            'max_chunks_per_item': MAX_CHUNKS_PER_ITEM,
            'temporal_index_version': 1,
            'notion_temporal_chunk_count': temporal_chunks,
        },
        'entries': rows,
        'scales': scales,
        'vectors_b64': vectors_b64,
    }
    OUT_ENC.write_text(json.dumps(crypto.encrypt(payload), ensure_ascii=False), encoding='utf-8')
    public = {
        'meta': {
            'schema_version': 2,
            'built_at': now,
            'encrypted_full_data': True,
            'model': BROWSER_MODEL_ID,
            'embedding_family': 'multilingual-e5',
            'dimension': int(vectors.shape[1]),
            'vector_count': len(rows),
            'item_count': len(item_keys),
            'item_counts': counts,
            'query_runs_locally': True,
            'private_text_sent_to_external_api': False,
            'temporal_index_version': 1,
            'temporal_metadata_encrypted': True,
        }
    }
    OUT_META.write_text(json.dumps(public, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Semantic index built: {len(item_keys)} items / {len(rows)} chunks / dim={vectors.shape[1]} / temporal_chunks={temporal_chunks}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
