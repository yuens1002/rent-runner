# /ac-verify — rent-runner

Sub-agent verification protocol for Phase 3 of `/agentic-workflow`. Invoked by the main thread via:

```
Agent(subagent_type="general-purpose", prompt="""
Run the AC verification protocol from .claude/commands/ac-verify.md.

BRANCH: feat/{feature-name}
DEV_SERVER: http://localhost:3000
ACS_DOC: docs/plans/{feature}-ACs.md
PAGES_TO_SCREENSHOT: {routes touched by this feature}
CONTEXT: {feature-specific context}
""")
```

## Protocol

1. **Re-run Gate 1 + Gate 2** if this repo has them wired for the branch (coverage/anti-drift — see `verify-workflow.md`; skipped for Phase 0-cadence work per `AGENTIC-WORKFLOW.md`).
2. **UI ACs**: for each route/A2UI surface named in `PAGES_TO_SCREENSHOT`, take Playwright screenshots at 375×667, 768×1024, 1440×900. Read every screenshot. Check against the AC's Pass invariant — not a pixel diff, a behavioral read (does the bound data render, does the layout hold, is the correct role's surface showing).
3. **Functional ACs**: read the relevant `lib/agent/tools/*`, `lib/services/*`, or `app/api/*` code and confirm the behavior described in Pass — especially tenant/role/unit scoping per the "Agent tool" pattern in `docs/plans/ac-patterns.md`.
4. **Test-coverage ACs**: run `npm run test:ci`. For each AC referencing a named test, open that test file and confirm it actually asserts the Pass invariant (not a config-literal echo — Gate 3 judgment call).
5. **Money-flow ACs** (Phase 5+): use Stripe CLI test mode (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`, `stripe trigger ...`) rather than the live Dashboard where possible, so verification is scriptable.
6. **Metering ACs**: query `workflow_events` directly (it's the source-of-truth ledger per `AGENTIC-WORKFLOW.md`) rather than only checking the Stripe Dashboard — confirm idempotency by attempting to re-trigger the same `reference_id`.

## Boundaries

CAN: read files, run Playwright/tests, query the dev DB read-only, run `stripe trigger`/`stripe events resend` in test mode.
CANNOT: edit files, write code, commit, push, or mutate production/live Stripe data.

## Output

Structured PASS/FAIL per AC with evidence (screenshot description, test file + assertion line, DB query result). The main thread writes this into the **Agent** column of the ACs doc — this skill does not edit files itself.
