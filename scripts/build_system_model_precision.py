#!/usr/bin/env python3
from __future__ import annotations

import build_system_model_v3 as v3
import work_taxonomy_v4 as tax

v3.DOMAIN_BY_ID = tax.DOMAIN_BY_ID
v3.TAXONOMY_VERSION = tax.TAXONOMY_VERSION
v3.best_task = tax.best_task
v3.classify = tax.classify

if __name__ == '__main__':
    raise SystemExit(v3.base.main())
