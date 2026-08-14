#!/usr/bin/env python3
"""Run the existing Notion sync with temporal metadata enrichment enabled."""
from __future__ import annotations

import sync_notion as base
from temporal_knowledge import enrich_item_temporal

_original_build_item=base.build_item


def build_item_temporal(page):
    return enrich_item_temporal(_original_build_item(page))


base.build_item=build_item_temporal

if __name__=='__main__':
    raise SystemExit(base.main())
