# Cross-system change policy

This repository is one personal intelligence system, not a set of independent pages.

## Dependency chain

Google work sources + Notion Knowledge
→ encrypted snapshots + evidence-time metadata
→ Work System rules + taxonomy
→ encrypted multilingual semantic + temporal index
→ Work System question retrieval
→ Weekly article screening / increment judgment
→ user feedback learning
→ reading state backup / restore
→ future Weekly ranking

## Required impact review

For any material change to taxonomy, scoring, embeddings, temporal logic, data schema, UI retrieval, or sync workflows, review all of these before considering the change complete:

1. **Source ingestion** — does the change alter what Google / Notion data is read or how it is parsed?
2. **Knowledge model** — do Work System categories, rules, evidence links, maturity, gaps or evidence time need rebuilding?
3. **Semantic + temporal index** — must existing Knowledge / rules / notes or old Weekly articles be re-embedded or have their time metadata refreshed?
4. **Weekly selection** — does article ranking, duplicate penalty, knowledge-gap detection, evidence/boundary detection and temporal-update detection still use the latest model?
5. **Feedback learning** — do 👍 / ⭐ / 👎 / 🚫 still distinguish content subject from research method, format, intent and quality signals?
6. **UI explanation** — do displayed related Knowledge / Work System items explain the same semantic and temporal logic that produced the score?
7. **Persistence** — do read/later/save/skip/feedback states survive rescoring, restore and device changes?
8. **Privacy** — does public GitHub Pages expose only non-sensitive metadata while private originals, rules, evidence-time records and semantic index remain encrypted?
9. **Automation** — do Google sync, Notion sync and Weekly update run in the correct order, avoid overwriting newer models, and handle concurrent commits safely?
10. **Backward compatibility** — can older browser state / article records without temporal fields still fall back safely, or is a migration required?

## Architecture rules

- Classification answers **what the content is mainly about**; retrieval answers **whether it helps the current problem**. Do not conflate them.
- Semantic similarity alone is not recommendation value. Weekly must distinguish **new evidence, knowledge gaps, boundaries/counterexamples, direct work use, temporal updates, and duplication**.
- Knowledge time has three meanings and must not be conflated: **evidence occurrence time > publication time > collection time**. A 2026 Notion save of a survey conducted in 2022 is 2022 evidence, not 2026 consumer reality.
- Time weighting is query-dependent. **Current/latest** questions favor fresh evidence for time-sensitive domains; **change/trend** questions preserve comparable evidence across years; low-time-sensitivity methodology/theory must not decay merely because it is old.
- Time-sensitive domains include technology/platform changes and many consumer/market/price signals. Time sensitivity is not proof of obsolescence; it changes retrieval priority, not truth status.
- A highly similar new article can be valuable when it refreshes old evidence. Weekly must suppress ordinary duplicate penalties when a newer high/medium-confidence time signal updates older time-sensitive Knowledge.
- Temporal synthesis must expose confidence. Explicit survey/data periods are high confidence, publication dates are medium, and collection-date fallback is low. Low-confidence dates must not be presented as precise evidence occurrence dates.
- User feedback is multi-layered: **content subject + semantic meaning + research method + content format + author intent + quality/use signals**.
- Negative feedback must be attributed to the most plausible layer. A rejected tourism survey should primarily teach **tourism ↓**, not **survey/research ↓**. A rejected AI webinar should primarily teach **webinar/event-promotion ↓**, not **AI ↓**.
- Negative semantic transfer across articles must be gated by subject affinity so methodologically similar but topically unrelated articles do not contaminate one another.
- Manual reading state is independent from recommendation score. A grade change must never hide or delete user history.
- Weekly consumes the current Knowledge / Work System model; it must not rebuild an older competing model.
- Concrete private Knowledge / Rule titles, evidence periods and source snippets are decrypted only after dashboard unlock. Public Weekly data may contain scores and non-sensitive temporal diagnostics, not private source text.
- Changes to core Weekly semantic code or encrypted Knowledge/system/index snapshots automatically trigger a rescore so UI code and `articles.json` do not stay on different model generations.

## Completion gate

A core change is complete only when:

- JavaScript and Python syntax checks pass;
- `scripts/validate_global_impact.py` passes;
- relevant GitHub Actions complete successfully;
- any required Notion temporal refresh, semantic index rebuild and Weekly rescore has been regenerated;
- manual state backup behavior remains intact.
