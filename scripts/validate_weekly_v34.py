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
        "weekly-mobile-performance-v18.js?v=20260905-1115",
        "weekly-state-integrity-v22.js?v=20260905-1115",
        "weekly-later-click-v22-1.js?v=20260905-1108",
        "weekly-runtime-consistency-v35.js?v=20260905-1108",
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
        "weekly-runtime-consistency-v35.js",
    ]
    positions = [index.find(x) for x in order]
    if any(x < 0 for x in positions) or positions != sorted(positions):
        raise AssertionError("Weekly learning/runtime layers must load deterministically v29 -> v30 -> v31 -> v32 -> v33 -> v35")

    backup = need(
        "weekly-state-complete-backup-v20.js",
        "schema:6",
        "backup_schema=6",
        "later_interest_at",
        "decryptPrivateEnvelopeData(baseEnv,{prompt:true})",
        "tools.dataset.backupSchema='6'",
    )
    if "loadKnowledgeData({prompt:true})" in backup:
        raise AssertionError("Weekly complete backup must validate against Weekly encrypted state, not private Knowledge")
    if "Number(v.later_interest_at||0)" not in backup or "if(lia)item.later_interest_at=Number(lia)" not in backup:
        raise AssertionError("Later learning timestamp must survive encrypted backup and restore")

    integrity = need(
        "weekly-state-integrity-v22.js",
        "const [id,s,f,u,o,a,su,fr,fru,lia]=row",
        "if(lia)item.later_interest_at=Number(lia)",
        "const laterInterest=Math.max(Number(prev.later_interest_at||0),Number(next.later_interest_at||0))",
        "Opening Later is navigation only",
    )
    if "later.addEventListener('click'" in integrity:
        raise AssertionError("State-integrity layer must not attach encrypted recovery to the Later tab")

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

    # v35 is the final runtime invariant layer. It must make Priority independent from temporary
    # mobile data slices, reset stale subordinate filters on top-level navigation, block private
    # Knowledge/System loaders on Weekly, and reject any background password prompt.
    runtime = need(
        "weekly-runtime-consistency-v35.js",
        "window.weeklyUiFixesV25?.allRows?.()",
        "activePriorityIds",
        "computePriority({respectFilters=false}",
        "if(status)status.value='all';if(source)source.value='all'",
        "if(typeof readingProgress!=='undefined'&&readingProgress==='focus')return activePriorityIds.has",
        "BLOCKED_PRIVATE_RE=/knowledge|work-system|system-model|semantic-index/i",
        "throw new Error('Unlock cancelled')",
        "recoverHistoricalLater=async()=>({restoredLater:0,updated:0,disabled_on_weekly:true})",
        "automatic_later_recovery:false",
        "private_data_blocked:true",
    )
    if runtime.find("weekly-runtime-consistency-v35.js") >= 0:
        raise AssertionError("runtime file must contain executable JS, not self-referential loader text")

    # The pagination layer used to intersect v21 Priority with the legacy v17 queue. That can make
    # a nonzero Priority badge render zero cards. It must now take v21 currentFocus directly and
    # preserve its value-ranked ordering.
    mobile = need(
        "weekly-mobile-performance-v18.js",
        "Priority must use the same v21 selection",
        "const api=window.weeklyReadingTimeV21",
        "const selected=api.currentFocus()?.selected||[]",
        "if(typeof readingProgress!=='undefined'&&readingProgress==='focus')return rows",
    )
    if "window.weeklyFocusFeedbackV17?.focusRows" in mobile:
        raise AssertionError("Mobile Priority must not intersect the canonical v21 list with legacy v17 focusRows")

    # Later tab click is navigation only. The capture guard must suppress old v12/v22 automatic
    # cloud-recovery listeners and must not call recovery itself.
    later_click = need(
        "weekly-later-click-v22-1.js",
        "Later navigation is local-only",
        "e.stopImmediatePropagation()",
        "setProgress('later')",
    )
    if "recoverHistoricalLater" in later_click or "recoverWeeklyLater" in later_click:
        raise AssertionError("Opening Later must not trigger encrypted historical recovery/password prompts")

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

    # URL identity remains primary; the second pass only suppresses current-run title aliases,
    # preserves historical IDs, records alias sources/URLs, and reports raw vs deduped counts.
    need(
        "scripts/weekly_dedupe.py",
        "SequenceMatcher",
        "exact_title",
        "fuzzy_title",
        "contained_title",
        "duplicate_sources",
        "duplicate_urls",
        "near_duplicate_count",
        "dedupe_version",
        "old = [a for a in rows if not is_new(a)]",
    )
    coverage = need(
        "scripts/update_feeds_coverage.py",
        "import weekly_dedupe",
        "weekly_dedupe.apply(t.p.base.ART_PATH, t.p.base.STATUS_PATH)",
    )
    if coverage.find("weekly_dedupe.apply") > coverage.find("t.lifecycle.refresh_hot_only"):
        raise AssertionError("Near-duplicate suppression must run before semantic rescoring")

    sources = json.loads(read("config/sources.json"))
    if len(sources) != 16:
        raise AssertionError(f"active source count must be 16, got {len(sources)}")
    names = {str(x.get("name") or "") for x in sources}
    if "CNET Japan" in names:
        raise AssertionError("CNET Japan must remain removed")

    print("Weekly focused invariants passed: 16 sources, URL+title dedupe, durable schema-6 Later memory, local-only Later navigation, blocked Weekly private loaders, and one canonical v21 Priority source for count/list/time/pagination.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
