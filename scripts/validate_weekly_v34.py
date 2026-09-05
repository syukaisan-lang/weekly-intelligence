#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    p = ROOT / path
    if not p.exists():
        raise AssertionError(f"missing required file: {path}")
    return p.read_text(encoding="utf-8")


def need(path: str, *needles: str) -> str:
    text = read(path)
    for needle in needles:
        if needle not in text:
            raise AssertionError(f"{path} must contain: {needle}")
    return text


def main() -> int:
    index = need(
        "index.html",
        "weekly-state-complete-backup-v20.js?v=20260905-1055",
        "weekly-preference-memory-v32.js",
        "weekly-ui-stability-v33.js?v=20260905-1055",
        "0/16",
    )
    if "knowledge-relations.js" in index:
        raise AssertionError("Weekly must not load client-side Knowledge relation UI")
    order = [
        "weekly-queue-clarity-v29.js",
        "weekly-preference-guard-v30.js",
        "weekly-adaptive-learning-v31.js",
        "weekly-preference-memory-v32.js",
        "weekly-ui-stability-v33.js",
    ]
    positions = [index.find(x) for x in order]
    if any(x < 0 for x in positions) or positions != sorted(positions):
        raise AssertionError("Weekly learning layers must load deterministically v29 -> v30 -> v31 -> v32 -> v33")

    backup = need(
        "weekly-state-complete-backup-v20.js",
        "schema:6",
        "backup_schema=6",
        "later_interest_at",
        "decryptPrivateEnvelopeData(baseEnv,{prompt:true})",
        "tools.dataset.backupSchema='6'",
    )
    if "loadKnowledgeData({prompt:true})" in backup:
        raise AssertionError("Weekly backup must validate against Weekly encrypted state, not load private Knowledge")
    if "Number(v.later_interest_at||0)" not in backup or "if(lia)item.later_interest_at=Number(lia)" not in backup:
        raise AssertionError("Later learning timestamp must survive encrypted backup and restore")

    stability = need(
        "weekly-ui-stability-v33.js",
        "historySwitching",
        "if(!historySwitching)laterHistoryOnly=false",
        "const laterAt=Number(s.later_interest_at||0);if(laterAt>0)return laterAt",
        "本周前保存",
        "weeklyStickyStatus",
    )
    if "api.invalidate?.();return api.currentFocus" in stability:
        raise AssertionError("Final UI sync must not force a full Priority recomputation every time")

    need(
        "weekly-preference-memory-v32.js",
        "article_count",
        "combo:",
        "laterHistory",
        "knowledge_context",
        "sample_count",
    )
    need(
        "weekly-performance-v28.js",
        "scoreCache",
        "featureCache",
        "server-semantic + lightweight-client-personalization",
    )

    sources = json.loads(read("config/sources.json"))
    if len(sources) != 16:
        raise AssertionError(f"active source count must be 16, got {len(sources)}")
    names = {str(x.get("name") or "") for x in sources}
    if "CNET Japan" in names:
        raise AssertionError("CNET Japan must remain removed")

    print("Weekly focused invariants passed: 16 sources, deterministic learning stack, durable Later memory, no Weekly Knowledge load, stable Priority/history UI.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
