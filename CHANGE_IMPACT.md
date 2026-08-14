# Cross-system change policy

This repository is one personal intelligence system, not a set of independent pages.

## Dependency chain

Google work sources + Notion Knowledge
→ encrypted snapshots
→ Work System rules + taxonomy
→ encrypted multilingual semantic index
→ Work System question retrieval
→ Weekly article screening / increment judgment
→ user feedback learning
→ reading state backup / restore
→ future Weekly ranking

## Required impact review

For any material change to taxonomy, scoring, embeddings, data schema, UI retrieval, or sync workflows, review all of these before considering the change complete:

1. **Source ingestion** — does the change alter what Google / Notion data is read or how it is parsed?
2. **Knowledge model** — do Work System categories, rules, evidence links, maturity or gaps need rebuilding?
3. **Semantic index** — must existing Knowledge / rules / notes or old Weekly articles be re-embedded?
4. **Weekly selection** — does article ranking, duplicate penalty, knowledge-gap detection, evidence/boundary detection still use the latest model?
5. **Feedback learning** — do 👍 / ⭐ / 👎 / 🚫 still distinguish content subject from research method, format, intent and quality signals?
6. **UI explanation** — do displayed related Knowledge / Work System items explain the same logic that produced the score?
7. **Persistence** — do read/later/save/skip/feedback states survive rescoring, restore and device changes?
8. **Privacy** — does public GitHub Pages expose only non-sensitive metadata while private originals, rules and semantic index remain encrypted?
9. **Automation** — do Google sync, Notion sync and Weekly update run in the correct order, avoid overwriting newer models, and handle concurrent commits safely?
10. **Backward compatibility** — can older browser state / article records still be interpreted, or is a migration required?

## Architecture rules

- Classification answers **what the content is mainly about**; retrieval answers **whether it helps the current problem**. Do not conflate them.
- Semantic similarity alone is not recommendation value. Weekly must distinguish **new evidence, knowledge gaps, boundaries/counterexamples, direct work use, and duplication**.
- User feedback is multi-layered: **content subject + semantic meaning + research method + content format + author intent + quality/use signals**.
- Negative feedback must be attributed to the most plausible layer. A rejected tourism survey should primarily teach **tourism ↓**, not **survey/research ↓**. A rejected AI webinar should primarily teach **webinar/event-promotion ↓**, not **AI ↓**.
- Negative semantic transfer across articles must be gated by subject affinity so methodologically similar but topically unrelated articles do not contaminate one another.
- Manual reading state is independent from recommendation score. A grade change must never hide or delete user history.
- Weekly consumes the current Knowledge / Work System model; it must not rebuild an older competing model.
- Concrete private Knowledge / Rule titles are decrypted only after dashboard unlock. Public Weekly data may contain scores and non-sensitive diagnostics, not private source text.
- Changes to core Weekly semantic code automatically trigger a rescore so UI code and `articles.json` do not stay on different model generations.

## Completion gate

A core change is complete only when:

- JavaScript and Python syntax checks pass;
- `scripts/validate_global_impact.py` passes;
- relevant GitHub Actions complete successfully;
- any required semantic index / Weekly rescore has been regenerated;
- manual state backup behavior remains intact.
