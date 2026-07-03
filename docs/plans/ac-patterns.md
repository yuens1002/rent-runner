# AC Patterns — rent-runner

Project-local replacement for the generic `templates/ac-patterns.md` (not available in this environment). Each deliverable "kind" below gets an AC row shaped like: **Plan ref | Role | What | How | Pass (invariant, not literal) | Agent | QC | Reviewer**.

## Kind: Server action / API route (e.g. `app/api/agent/stream/route.ts`)
- **What**: the endpoint's contract — inputs, auth requirement, side effects.
- **How**: call it with a valid session + valid payload, and again with an invalid/cross-tenant one.
- **Pass**: authorized calls succeed and touch only the caller's own tenant/vendor scope; unauthorized calls return 401/403 — never a silent empty result. State this as the invariant ("cross-tenant access is rejected"), never as a pinned literal ("returns tenant_id=abc123").

## Kind: Agent tool (`lib/agent/tools/*.ts`)
- **What**: the tool's authorization boundary — which role(s) may call it, which scope it enforces.
- **How**: invoke the tool function directly (unit-level) as each of the 5 roles, and with a tampered tenant/unit/vendor id.
- **Pass**: only the intended role(s) succeed; every other role or mismatched scope throws/rejects. This is the single most important AC category in the whole project (see Phase 3 in AGENTIC-WORKFLOW.md).

## Kind: A2UI catalog component (`lib/a2ui/catalog/*`, `components/a2ui/*.tsx`)
- **What**: the component's declared props/data-model bindings and the client-rendered output.
- **How**: `/ui-verify` screenshot at 3 viewports with representative bound data (including empty/loading/error states).
- **Pass**: renders without layout break at all 3 viewports; two-way-bound inputs reflect user edits locally before an action is dispatched — never pin exact pixel values, pin "no overflow/clipping, label always visible."

## Kind: Drizzle migration (`lib/db/schema/*.ts` + generated migration)
- **What**: the table/column/constraint being added or changed.
- **How**: run `drizzle-kit push` against a scratch DB, then run the affected service-layer function against it.
- **Pass**: migration applies cleanly; any unique/FK constraint actually rejects the violating case it's meant to prevent (e.g. `unique(tenant_id, vendor_id)` rejects a duplicate subscription) — don't just assert "table exists."

## Kind: Stripe webhook handler (`lib/stripe/webhookHandlers.ts`)
- **What**: which Stripe event triggers which state transition + side effect (DB write, meter event, Transfer).
- **How**: replay a Stripe CLI test-mode event (`stripe trigger ...` or `stripe events resend`) against the handler.
- **Pass**: the state transition happens exactly once per event (idempotency — replay the same event twice, assert only one effect), and failure paths (e.g. signature mismatch) are rejected, not silently ignored.

## Kind: Metered billing tick (`lib/services/workflowMetering.ts`)
- **What**: which workflow_events row(s) get written and which Stripe customer(s) get billed, in what ratio.
- **How**: trigger the workflow (e.g. approve a work order) and inspect `workflow_events` rows + Stripe test-mode meter events.
- **Pass**: exactly the expected row(s) exist (1 for booking_processed/contract_created, 2 split by `workflow_fee_split_bps` for payout_completed); re-triggering the same reference_id does not create duplicate rows (idempotency via the unique constraint).

## Pass-condition rule

State Pass as an invariant about *behavior*, never as a literal that also appears in seed data, fixtures, or scaffolded defaults (e.g. don't write `Pass: unit.label === "MIL Suite"` — that just echoes the test's own seed data back at itself; write `Pass: booking is rejected when requested unit belongs to a different tenant`).
