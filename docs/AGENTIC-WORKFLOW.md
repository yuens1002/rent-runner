# Agentic Workflow — rent-runner project config

This repo opts into the generic `/agentic-workflow` skill (`~/.claude/commands/agentic-workflow.md`). This doc fills in the project-specific placeholders that skill expects, and records the cadence decision per phase of [`docs/plans/rent-runner-architecture-plan.md`](plans/rent-runner-architecture-plan.md) (the master architecture plan — the 3-service `rent-runner`/`workflow-engine`/`vendor-marketplace` split).

## Project placeholders

| Placeholder | Value | Status |
|---|---|---|
| `{DEV_SERVER_URL}` | `http://localhost:3000` | Set once Phase 0 scaffold runs `npm run dev` |
| `{ADMIN_LOGIN_PATH}` | `(app)` shell, Clerk-authenticated owner session | Set once Phase 1 (auth skeleton) exists — no login surface before then |
| precheck command | `npm run lint && npm run typecheck` | Added in Phase 0 `package.json` |
| test command | `npm run test:ci` (Vitest for unit/service-layer tests) | Added in Phase 0 |
| Playwright (`/ui-verify`) | `npx playwright test` against Chromium, viewports: 375×667 (mobile), 768×1024 (tablet), 1440×900 (desktop) | Added when Phase 6 UI exists to screenshot |
| Release convention | Semver git tag (`vX.Y.Z`) cut from `main` on merge, `CHANGELOG.md` entry per release | See `.claude/commands/release.md` |

## Cadence per phase (per the three-cadence table in `/agentic-workflow`)

| Phase (from master plan) | Cadence | Why |
|---|---|---|
| **Phase 0** — Scaffold `rent-runner` + stub servers for `workflow-engine`/`vendor-marketplace` (Next.js/Clerk/Drizzle/Neon/Pico.css, no business logic) | **Patch/bootstrap-light** | Framework wiring has no meaningful ACs to derive — there's no behavior yet to specify Pass/Fail invariants against. Self-review in lieu of ACs; commit directly to `main` once it boots. |
| **Phase 1** — Auth + tenancy skeleton | **Full**, starting here | First phase with real behavior to verify (role resolution, route gating) — first `feat/` branch registered in `verification-status.json`. |
| **Phase 2** — Domain schema + service layer | Full | Tenant-scoping bugs here are the highest-blast-radius mistake in the whole app — full ACs + Gate 2 anti-drift matter most here. |
| **Phase 3** — Degraded-mode CRUD UI + real Stripe (no chat) | Full | A legitimately shippable OSS milestone with zero dependency on the closed services — money movement needs test-mode E2E ACs even without the agent layer. |
| **Phase 4** — A2UI client + `workflow-engine` integration against the stub | Full | Cold-start/rehydration correctness, plus explicitly verifying the "no valid key → degrade to Phase 3 UI" path. |
| **Phase 5** — `vendor-marketplace` client integration against the stub | Full | Cross-service contract correctness (subscribe → contract → work-order mirror pattern) and the local-vendor fallback path. |
| **Phase 6** — Build real `workflow-engine` (separate repo), swap the stub | Full | Multi-role authorization boundary through a genuine third-party code-execution channel (`/api/mcp`) — the turn-scoped token is the single most security-critical piece of the architecture. |
| **Phase 7** — Build real `vendor-marketplace` (separate repo), swap the stub | Full | Cross-instance vendor discovery and per-(vendor, instance) Stripe Connect account resolution are the highest-blast-radius mistakes in this phase. |
| **Phase 8** — Golden path E2E across all 3 real, deployed services | Full | This is the whole-system AC: the 10-step verification plan in `docs/plans/rent-runner-architecture-plan.md` becomes the AC list directly. |
| **Phase 9** — Visual polish | Full, lighter | ACs are mostly `/ui-verify` screenshot + a11y checks, across both chat and degraded-mode UI. |

## Deviations from the generic skill

- No `templates/plan-template.md` / `templates/ac-patterns.md` / `templates/acs-template.md` were available locally (they live in the separate agentic-workflow tooling repo, not synced to `~/.claude/skills/agentic-workflow/`). Project-local AC pattern shapes for this stack live in `docs/plans/ac-patterns.md` instead — instantiate ACs from there until/unless the generic templates become available.
- `docs/plans/{feature}-ACs.md` and `docs/plans/{feature}-review.md` are this project's convention for the ACs tracking doc and `/review` report paths referenced generically in the skill.

## Per-project skills

- `.claude/commands/ac-verify.md` — Phase 3 sub-agent verification protocol
- `.claude/commands/ui-verify.md` — Playwright screenshot capture/comparison
- `.claude/commands/verify-workflow.md` — Phase 2-4 orchestration (implement → verify → QC loop)
- `.claude/commands/release.md` — Phase 6 version/tag/PR convention

## Per-project hooks (`.claude/hooks/`, registered in this repo's `.claude/settings.json`)

- `pre-pr-precheck-node.js` — blocks `gh pr create` unless a fresh precheck + `test:ci` pass is stamped
- `pre-pr-via-release-node.js` — blocks `gh pr create` unless opened via `/release`
- `review-before-merge-node.js` — blocks `gh pr merge` until Copilot review comments are resolved
