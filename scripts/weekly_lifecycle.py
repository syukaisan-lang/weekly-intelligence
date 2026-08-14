#!/usr/bin/env python3
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import os
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from dateutil import parser as dtparser

ROOT = Path(__file__).resolve().parents[1]
ART_PATH = ROOT / 'data' / 'articles.json'
STATE_PATH = ROOT / 'data' / 'weekly-state.enc.json'
STATUS_PATH = ROOT / 'data' / 'source_status.json'
PASS = os.getenv('DASHBOARD_PASSPHRASE', '')
HOT_DAYS = 90
SOURCE_WINDOW_DAYS = 56
UNLABELED_EXPIRE_DAYS = 7
TRUSTED_STATUS_ORIGIN = 'human_v10'


def _dt(value):
    if not value:
        return None
    try:
        x = dtparser.parse(str(value))
        if not x.tzinfo:
            x = x.replace(tzinfo=timezone.utc)
        return x.astimezone(timezone.utc)
    except Exception:
        return None


def article_time(a: dict):
    return _dt(a.get('published') or a.get('first_seen'))


def queue_time(a: dict):
    # first_seen represents how long this item has occupied the user's Weekly queue.
    return _dt(a.get('first_seen') or a.get('published'))


def decrypt_weekly_state() -> dict:
    if not PASS or not STATE_PATH.exists():
        return {}
    try:
        env = json.loads(STATE_PATH.read_text(encoding='utf-8'))
        salt = base64.b64decode(env['salt'])
        iv = base64.b64decode(env['iv'])
        ct = base64.b64decode(env['ciphertext'])
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(), length=32, salt=salt,
            iterations=int(env.get('iterations') or 600_000),
        )
        key = kdf.derive(PASS.encode('utf-8'))
        raw = AESGCM(key).decrypt(iv, ct, None)
        if env.get('compression') == 'gzip':
            raw = gzip.decompress(raw)
        payload = json.loads(raw.decode('utf-8'))
        return payload.get('state') or {}
    except Exception as exc:
        print('Weekly lifecycle: encrypted feedback unavailable:', exc)
        return {}


def _normalized_status(st: dict) -> str:
    status = st.get('status') or 'new'
    # Historical read/save records did not record whether the user explicitly chose them.
    # The user confirmed the true historical read/save count is zero, so only v10+ human actions
    # can count as reading/adoption. Old records are treated as unlabeled for source-yield purposes.
    if status in ('read', 'save') and st.get('status_origin') != TRUSTED_STATUS_ORIGIN:
        return 'new'
    return status


def _is_unlabeled(st: dict) -> bool:
    return _normalized_status(st) == 'new' and not st.get('feedback')


def _is_expired_unlabeled(a: dict, st: dict, now: datetime) -> bool:
    if not _is_unlabeled(st):
        return False
    qt = queue_time(a)
    return bool(qt and now - qt >= timedelta(days=UNLABELED_EXPIRE_DAYS))


def source_yield(articles: list[dict], state: dict, now=None) -> dict[str, dict]:
    """Evaluate source usefulness separately from content-preference learning.

    A completely unlabeled article is an *implicit pass* for source-quality purposes because
    the user does not want untouched material to accumulate. It is NOT written back as a
    human skip and therefore never becomes a strong negative content-training sample.
    Legacy read/save records without a trusted human-origin marker are also treated as unlabeled.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=SOURCE_WINDOW_DAYS)
    rows: dict[str, dict] = {}
    for a in articles:
        at = article_time(a)
        if not at or at < cutoff:
            continue
        name = str(a.get('source') or '')
        if not name:
            continue
        r = rows.setdefault(name, {
            'total': 0, 'sa': 0, 's': 0, 'saved': 0, 'read': 0,
            'positive': 0, 'strong_positive': 0, 'negative': 0,
            'skipped': 0, 'implicit_skipped': 0, 'expired_unlabeled': 0,
            'sa_adopted': 0, 'duplicates': 0,
        })
        r['total'] += 1
        grade = str(a.get('grade') or '')
        is_sa = grade in ('S', 'A')
        if is_sa:
            r['sa'] += 1
        if grade == 'S':
            r['s'] += 1
        st = state.get(str(a.get('id') or '')) or {}
        status = _normalized_status(st)
        fb = st.get('feedback')
        if status == 'save':
            r['saved'] += 1
        elif status == 'read':
            r['read'] += 1
        elif status == 'skip':
            r['skipped'] += 1
        if _is_unlabeled(st):
            r['implicit_skipped'] += 1
            if _is_expired_unlabeled(a, st, now):
                r['expired_unlabeled'] += 1
        if fb in ('accurate', 'more'):
            r['positive'] += 1
        if fb == 'more':
            r['strong_positive'] += 1
        if fb in ('bad', 'less'):
            r['negative'] += 1
        if is_sa and (status in ('read', 'save') or fb in ('accurate', 'more')):
            r['sa_adopted'] += 1
        if (a.get('knowledge_context') or {}).get('increment_type') == 'mostly_duplicate':
            r['duplicates'] += 1
    for r in rows.values():
        t = max(1, r['total'])
        r['sa_rate'] = r['sa'] / t
        r['duplicate_rate'] = r['duplicates'] / t
        r['pass_count'] = r['skipped'] + r['implicit_skipped']
        r['pass_rate'] = r['pass_count'] / t
        r['explicit_skip_rate'] = r['skipped'] / t
        r['implicit_skip_rate'] = r['implicit_skipped'] / t
        r['sa_adoption_rate'] = r['sa_adopted'] / max(1, r['sa'])
    return rows


def source_mode(metrics: dict | None) -> str:
    if not metrics or metrics.get('total', 0) < 24:
        return 'active'
    total = metrics['total']
    sa_rate = metrics.get('sa_rate', 0)
    pass_rate = metrics.get('pass_rate', 0)
    sa_adopted = metrics.get('sa_adopted', 0)
    sa_adoption_rate = metrics.get('sa_adoption_rate', 0)

    # Very large, repeatedly ignored sources can be reduced even if the model occasionally
    # assigns an A. Human adoption is the stronger signal than model grade for source control.
    if total >= 50 and pass_rate >= .90 and sa_adopted == 0:
        return 'probe'
    if total >= 30 and pass_rate >= .80 and sa_adopted <= 1:
        return 'cold'
    if total >= 24 and pass_rate >= .70 and sa_adoption_rate < .15 and metrics.get('positive', 0) == 0:
        return 'cold'

    # Existing semantic-yield guardrails remain as a secondary signal.
    if total >= 50 and sa_rate < .025 and metrics.get('positive', 0) == 0:
        return 'probe'
    if total >= 30 and sa_rate < .08 and metrics.get('positive', 0) == 0:
        return 'cold'
    if total >= 24 and sa_rate < .11 and metrics.get('negative', 0) + metrics.get('skipped', 0) >= 3:
        return 'cold'
    return 'active'


def _probe_week(name: str, now=None) -> bool:
    now = now or datetime.now(timezone.utc)
    week = int(now.strftime('%V'))
    slot = int(hashlib.sha1(name.encode('utf-8')).hexdigest()[:4], 16) % 4
    return week % 4 == slot


def prepare_sources(sources: list[dict], articles_path: Path = ART_PATH) -> tuple[list[dict], dict]:
    articles = []
    if articles_path.exists():
        try:
            articles = json.loads(articles_path.read_text(encoding='utf-8')).get('articles') or []
        except Exception:
            articles = []
    state = decrypt_weekly_state()
    yields = source_yield(articles, state)
    out = []
    counts = {'active': 0, 'cold': 0, 'probe': 0, 'probe_skipped': 0}
    for src0 in sources:
        src = deepcopy(src0)
        mode = source_mode(yields.get(src.get('name')))
        src['_adaptive_mode'] = mode
        counts[mode] += 1
        if mode == 'cold':
            src['_deep_read_min'] = 8.0
        elif mode == 'probe':
            src['_deep_read_min'] = 8.4
            if not _probe_week(str(src.get('name') or '')):
                src['_adaptive_skip'] = True
                counts['probe_skipped'] += 1
        out.append(src)
    return out, counts


def refresh_hot_only(refresh_fn) -> None:
    if not ART_PATH.exists():
        refresh_fn()
        return
    original = json.loads(ART_PATH.read_text(encoding='utf-8'))
    cold = [a for a in (original.get('articles') or []) if a.get('storage_tier') == 'cold']
    if not cold:
        refresh_fn()
        return
    hot = [a for a in (original.get('articles') or []) if a.get('storage_tier') != 'cold']
    temporary = dict(original)
    temporary['articles'] = hot
    ART_PATH.write_text(json.dumps(temporary, ensure_ascii=False, indent=2), encoding='utf-8')
    try:
        refresh_fn()
        refreshed = json.loads(ART_PATH.read_text(encoding='utf-8'))
        merged = (refreshed.get('articles') or []) + cold
        merged.sort(key=lambda a: (a.get('published') or a.get('first_seen') or ''), reverse=True)
        refreshed['articles'] = merged
        ART_PATH.write_text(json.dumps(refreshed, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        ART_PATH.write_text(json.dumps(original, ensure_ascii=False, indent=2), encoding='utf-8')
        raise


def compact_articles(now=None) -> dict:
    if not ART_PATH.exists():
        return {'hot': 0, 'cold': 0}
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=HOT_DAYS)
    payload = json.loads(ART_PATH.read_text(encoding='utf-8'))
    hot = cold = 0
    for a in payload.get('articles') or []:
        at = article_time(a)
        if not at or at >= cutoff:
            a.pop('storage_tier', None)
            hot += 1
            continue
        cold += 1
        a['storage_tier'] = 'cold'
        a['content_archived'] = bool(a.get('content_checked') or a.get('content_excerpt'))
        a['content_checked'] = False
        a['summary'] = str(a.get('summary') or '')[:600]
        a['reason'] = str(a.get('reason') or '')[:360]
        for key in (
            'content_excerpt', 'semantic_vector', 'knowledge_context', 'api_reason',
            'semantic_deep_read_attempted_at', 'screening_note'
        ):
            a.pop(key, None)
    meta = payload.setdefault('meta', {})
    meta['lifecycle_version'] = 'adaptive_v10'
    meta['hot_retention_days'] = HOT_DAYS
    meta['unlabeled_source_pass_days'] = 0
    meta['unread_expiry_days'] = UNLABELED_EXPIRE_DAYS
    meta['trusted_status_origin'] = TRUSTED_STATUS_ORIGIN
    meta['hot_article_count'] = hot
    meta['cold_article_count'] = cold
    meta['cold_records_keep'] = 'id/url/title/date/source/score/feedback-features for dedupe and learning memory'
    ART_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'hot': hot, 'cold': cold}


def annotate_status(source_counts: dict, storage_counts: dict) -> None:
    if not STATUS_PATH.exists():
        return
    st = json.loads(STATUS_PATH.read_text(encoding='utf-8'))
    st['adaptive_source_control'] = {
        'enabled': True,
        'window_days': SOURCE_WINDOW_DAYS,
        'unlabeled_counts_as_implicit_pass': True,
        'unread_expiry_days': UNLABELED_EXPIRE_DAYS,
        'trusted_status_origin': TRUSTED_STATUS_ORIGIN,
        # Deliberately expose only aggregate counts; per-source feedback-derived modes stay private.
        'active_count': source_counts.get('active', 0),
        'cold_count': source_counts.get('cold', 0),
        'probe_count': source_counts.get('probe', 0),
        'probe_skipped_count': source_counts.get('probe_skipped', 0),
    }
    st['storage_lifecycle'] = {
        'hot_retention_days': HOT_DAYS,
        'hot_count': storage_counts.get('hot', 0),
        'cold_count': storage_counts.get('cold', 0),
    }
    STATUS_PATH.write_text(json.dumps(st, ensure_ascii=False, indent=2), encoding='utf-8')
