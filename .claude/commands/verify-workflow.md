# /verify-workflow — rent-runner

Full Phase 2–4 orchestration for a feature branch, without spawning separate sub-agents (use this for smaller/solo verification passes; use `/ac-verify` + `/ui-verify` sub-agents directly for larger features per the parallelism note in `/agentic-workflow`).

## Steps

1. **Precheck**: `npm run lint && npm run typecheck`. Fix any errors before continuing.
2. **Gate 1 (coverage)**: confirm every deliverable in the feature's plan has at least one AC referencing it in `docs/plans/{feature}-ACs.md`, and every AC's Plan-ref resolves to a real deliverable. (No automated `scripts/check-acs-coverage.ts` exists yet for this repo — do this check by hand until one is written; flag it as a gap if the ACs doc is large enough that manual coverage-checking is unreliable.)
3. **Gate 2 (anti-drift)**: grep the new/changed test files and the ACs doc's Pass column for string literals that also appear in seed data or scaffolded defaults (e.g. a hardcoded unit label, tenant name). Flag and rewrite as invariants per `docs/plans/ac-patterns.md`'s Pass-condition rule.
4. **Run tests**: `npm run test:ci`.
5. **Run `/ac-verify`** (as a sub-agent for anything nontrivial) against the ACs doc.
6. **Run `/ui-verify`** for any UI-surface ACs.
7. **QC loop**: read every sub-agent finding yourself, fill the QC column, fix and re-verify until all ACs pass.
8. **Update `.claude/verification-status.json`**: set the branch's status to `"verified"` with `acs_passed`/`acs_total` matching the ACs doc, only once every AC's QC column is filled.
9. **Run `/review`** (generic skill) before presenting to the human — see Phase 4.5 in `/agentic-workflow`.

## When to skip this

Phase-0-cadence work (bare scaffolding with no behavior to verify, per `AGENTIC-WORKFLOW.md`'s cadence table) does not need this — just precheck + confirm the app boots.
