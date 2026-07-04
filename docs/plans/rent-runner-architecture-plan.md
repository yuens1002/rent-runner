# rent-runner — Open Source Pay-Per-Workflow Short-Term Rental Management

## Context

An open-source SPA for short-term rental management where the entire UI paradigm is a chat interface: an agent renders dynamic UI via **A2UI 1.0RC** (Google's declarative, transport-agnostic agent-UI protocol) instead of hand-built pages, across five roles — public (booking), guest (concierge), owner (property/vendor management), vendor (service contracts), contractor (scheduling/work/payment).

This plan went through two rounds of revision after the initial design:
1. Property-level modeling needed a **unit** concept (a property can contain a mother-in-law suite, a private room, and the main house as independently bookable/contractable units), Next.js's role was reconsidered given the 100%-chat UI, and Drizzle was confirmed over Prisma.
2. **A business-model/architecture pivot**: the "pay per workflow" monetization only works if the metering logic runs on infrastructure the paying customer doesn't control — code inside an open-sourced, self-hostable repo can always be edited or deleted by whoever runs it. Separately, vendors/contractors are inherently a cross-instance shared resource (many independent owner deployments need to discover the same vendors), which can't live as a table inside any single owner's local database. Both problems are solved by the same move: split into **3 services** instead of 1 monolith, each with a specific, non-negotiable reason for existing as its own service (not a general microservices decomposition — that was explicitly rejected for anything beyond these two boundaries).

This doc is the current architecture. Where content differs from the original single-app design, the single-app version has been removed rather than kept as history — git history covers that if needed.

**Considered and rejected**: switching the client-facing transport from our own A2UI+SSE design to MCP Apps (the official MCP UI extension), with each of the 3 services as an MCP-Apps-serving MCP server. Rejected because MCP Apps only renders inside MCP-aware hosts (Claude, ChatGPT, Goose, VS Code) — the vast majority of rent-runner's actual users (guests booking a stay, property owners) are plain web users in an ordinary browser, not inside an MCP client. **WebMCP** (`navigator.modelContext`) remains the right fit instead, since it's a browser-native standard that works on any normal web page — it stays as already planned (Phase 4, progressive enhancement) rather than becoming the primary transport. Also considered: x402 (Coinbase's stablecoin/on-chain HTTP-402 payment protocol) for revenue-sharing with third-party developers who might publish reusable workflow templates in the future. Real and does support multi-party settlement, but it's a crypto-native rail that doesn't fit the core guest/owner/vendor Stripe flows — not a fit for those flows, and still no fit for an eventual workflow-marketplace's *payer*-facing flows either. It's now being pursued for a different purpose, though: settling usage-attributed revenue shares to core **code contributors** (as opposed to guests/owners/vendors), tied to the same `workflow_events` metering stream `workflow-engine` already needs for its own billing. That mechanism — attribution weighting plus x402 settlement — is being designed as its own reusable framework rather than embedded here; see [chapter-share](https://github.com/yuens1002/chapter-share) (`docs/plans/attribution-mechanism.md`). `rent-runner`'s `workflow_events` is the first real case study for it, once `workflow-engine` exists (Phase 6) — not required for the phases before that.

## The 3 services

1. **`rent-runner`** (open source, MIT/Apache-style, self-hostable) — the thing anyone clones and runs. Next.js shell: A2UI client/renderer, property/unit/booking CRUD, guest sessions, Clerk auth, WebMCP, and the **operational** Stripe Connect flows (guest→owner booking payment, owner→vendor/contractor payout) — these are the owner's own money movements, not proprietary IP, no reason to gate them. Contains **no** Claude Agent SDK code and **no** global vendor directory.
2. **`workflow-engine`** (closed source, one central deployment operated by the project) — wraps the Claude Agent SDK orchestration, per-role tool-calling, A2UI surface *generation*, and the metered billing (`recordWorkflowEvent`, Stripe Billing Meters). `rent-runner` calls it over an authenticated API for every chat turn. **This is the actual monetization boundary** — the Anthropic API key and the metering logic never leave this service, so a self-hoster has nothing to delete to get it for free. No license (not even AGPL) can substitute for this: AGPL only forces publishing modifications on redistribution, it doesn't compel payment or stop self-hosting.
3. **`vendor-marketplace`** (license TBD, one central deployment) — the global vendor/contractor directory, canonical contracts, and cross-instance work-order ledger. Any `rent-runner` instance (self-hosted or hosted) calls it to browse vendors, subscribe, create contracts, and track work-order assignment/completion. Has its own vendor-facing portal (itself a `workflow-engine` client) and its own potential monetization (vendor listing fees) — separate revenue stream from #2, not yet decided.

**Explicitly not a 4th service**: no separate booking-service, payments-service, or notification-service. Every other domain concept stays inside whichever of the 3 services above naturally owns it.

## Table ownership by service

**`rent-runner` DB** (per deployment — one per self-hoster, or the project's own optional hosted multi-tenant deployment):
```
tenants                 id, clerk_org_id, name, stripe_connect_account_id
properties              id, tenant_id, name, address
units                   id, property_id, tenant_id (denorm), label, unit_type(whole_property|adu|private_room|shared_room),
                        base_nightly_rate_cents, max_guests, terms/house_rules, status
bookings                id, unit_id, tenant_id (denorm), check_in, check_out, guest_name/email/phone,
                        status, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents
guest_sessions          id, booking_id, token_hash, expires_at
payments                id, tenant_id, work_order_id?, booking_id?, type(booking_payment|vendor_payout|concierge_charge),
                        stripe_object_id, amount_cents

agent_threads (new)     id, tenant_id, role, subject_type, subject_id, workflow_engine_conversation_id
                        -- thin local pointer; conversations/messages/a2ui_surfaces themselves live in workflow-engine's DB

vendor_instance_links (new, local cache)   marketplace_vendor_id, vendor_display_name, vendor_type,
                        stripe_connect_account_id (created by THIS instance's own Stripe platform), status
                        -- read-through cache of vendor-marketplace's subscription state; NOT source of truth

contracts (new, local cache)   marketplace_contract_id, vendor_ref, unit_id (local FK), service_type, rate_cents, status
                        -- synced via webhook; vendor-marketplace owns the canonical record

work_orders             id, tenant_id, booking_id?, unit_id?, marketplace_work_order_id,
                        status(requested→assigned→in_progress→completed→approved→paid), scope, scheduled_at,
                        completed_at, approved_at, requested_by_guest_session_id?
                        -- rent-runner is authoritative for booking-facing fields (booking_id, unit_id, approved_at,
                        -- requested_by_guest_session_id); vendor-marketplace is authoritative for assignment/
                        -- completion fields. Real dual-ownership risk — see Risks section.

local_vendor_contacts (new)   name, email, phone, rate_cents, stripe_connect_account_id
                        -- degraded-mode fallback: manually-entered vendor, fully independent of vendor-marketplace
```

**`workflow-engine` DB**:
```
conversations, messages, a2ui_surfaces   -- moved here wholesale, keyed by (api_key_id/instance_ref, subject_ref opaque-json)
                                          -- rather than a rent-runner tenant_id FK (workflow-engine serves many
                                          -- independent instances it has no DB relationship to)
workflow_events         id, billed_party_id (opaque external ref — instance's or vendor's workflow-engine customer id),
                        workflow_type(booking_processed|contract_created|payout_completed), reference_id,
                        stripe_meter_event_id, unique(workflow_type, reference_id, billed_party)
api_keys / subscriptions   maps instances (and vendors, if billed the split share directly) to Stripe billing customers/meter prices
```

**`vendor-marketplace` DB**:
```
vendors (global)        id, name, vendor_type, is_shared_resource
vendor_instance_links (canonical)   vendor_id, instance_id, stripe_connect_account_id, onboarding_status
                        -- ONE Connect account per (vendor, rent-runner deployment) — see Stripe section for why
contractors (global)    id, vendor_id, clerk_user_id, name, email
contracts (canonical)   id, vendor_id, instance_id, unit_ref (opaque string from rent-runner), service_type,
                        rate_cents, status, workflow_fee_split_bps (default 5000 = 50/50)
work_orders (canonical for assignment/completion)   linked to rent-runner's local row by shared id
vendor_billing          -- only if vendor-marketplace charges vendors directly (listing fees); separate from workflow-engine billing
```

## Money flows (Stripe)

**Guest → Owner, Owner → Vendor** ("Separate Charges and Transfers", `rent-runner`'s own Stripe platform as intermediary):
- Guest Checkout → `rent-runner`'s own Stripe platform balance (no `transfer_data`/destination).
- On work-order approval: `rent-runner` issues **two** Transfers from its own balance — one to the vendor's connected account, one to the owner's connected account (remainder).
- **Constraint that shapes vendor Connect-account design**: Separate Charges and Transfers requires ONE Stripe platform account to hold the balance and issue all Transfers for a given charge, and Connect accounts belong to exactly one platform. Since `vendor-marketplace` is one central service but `rent-runner` instances are many and independent, a vendor working with 5 owner instances can't share one Connect account across 5 different Stripe platforms.
- **Resolution**: one Stripe Connect account **per (vendor, rent-runner deployment)**, created by `rent-runner` itself under its own platform via the normal Express onboarding flow, then pushed to `vendor-marketplace` (`PUT /v1/vendor-instance-links/{vendor_id}`) for reference/display only — marketplace never holds any instance's Stripe secret key. Within one deployment, a vendor working with multiple owner tenants (in a hosted multi-tenant `rent-runner` deployment) still reuses one Connect account, unchanged from the original row-isolation design.
- Accepted trade-off: vendors re-do (mostly prefilled) Express onboarding per new owner deployment. Do **not** "fix" this by centralizing Connect onto one shared platform — that recentralizes money custody the split was meant to keep decentralized, for a secondary UX win.

**Owner/Vendor → Platform, metered workflow billing** (the actual revenue model, lives entirely in `workflow-engine`):
- `booking_processed` / `contract_created`: single `workflow_events` row, owner-billed.
- `payout_completed`: **two** rows — owner and vendor, split by the contract's `workflow_fee_split_bps` (from `vendor-marketplace`'s canonical contract). Vendor Connect-account resolution for the Transfer happens once at contract-acceptance time (cached in `rent-runner`'s `vendor_instance_links`), not synchronously in the payout-approval hot path — keeps the money-moving codepath free of a cross-service network dependency.
- **Open commercial question, not yet decided, doesn't block structure**: does the vendor pay `workflow-engine` directly for its split share (own subscription), or does `vendor-marketplace` bundle/resell workflow-engine access as part of its own listing fee? Resolve before Phase 8/9 billing work.

## API contracts between services

**`rent-runner` → `workflow-engine`** (generic enough that `vendor-marketplace`'s own vendor/contractor portal is also a client, though the MVP build can hardcode against `rent-runner`'s specific tool shapes first and generalize later — don't over-build this now):
- `POST /v1/turns` — `{conversation_id?, role, subject_ref, user_message, tool_server: {base_url, turn_scoped_token}}` → SSE stream of text + A2UI ops.
- `POST /v1/turns/{id}/actions` — client→server action/functionResponse relay.
- `GET /v1/conversations/{id}` — resume after reload.
- Callback direction: workflow-engine's tool-calls hit `POST {tool_server.base_url}/mcp` — effectively an MCP tool server `rent-runner` exposes, wrapping the **same** `lib/services/*` authorization-boundary functions used everywhere else, just invoked remotely. Authenticated by a **short-lived, turn-scoped signed token**, not a standing credential — this is the security-critical piece of the whole split (workflow-engine reaching into a self-hoster's own data is a real third-party code-execution channel; get the token scoping right early).
- Webhook `workflow-engine` → `rent-runner`: `key.suspended`/`key.reactivated` (payment failure) so `rent-runner` flips into degraded mode immediately.

**`rent-runner` → `vendor-marketplace`**:
- `GET /v1/vendors?type=&region=`, `POST /v1/vendors/{id}/subscribe`
- `POST /v1/contracts`, `PATCH /v1/contracts/{id}`
- `POST /v1/work-orders` (register), `POST /v1/work-orders/{id}/payout-confirmed` (ledger notification after `rent-runner`'s own Transfers succeed — idempotent by transfer id, no money moves here)
- `PUT /v1/vendor-instance-links/{vendor_id}` — pushes the Connect account id, per above
- Inbound webhooks: `vendor.subscription.status_changed`, `contract.updated`, `work_order.status_changed`

`workflow-engine` has **no direct relationship with `vendor-marketplace`** — it's domain-agnostic; only `rent-runner` talks to both.

## Deployment topology

Self-hoster configures: `WORKFLOW_ENGINE_BASE_URL`/`API_KEY`/`WEBHOOK_SECRET`, `VENDOR_MARKETPLACE_BASE_URL`/`API_KEY`/`WEBHOOK_SECRET`, own `STRIPE_SECRET_KEY`, own `CLERK_*`, own `DATABASE_URL` — entirely independent otherwise. `workflow-engine` and `vendor-marketplace` are each deployed once by the project (their Anthropic API key lives only in `workflow-engine` — this is the actual enforcement point, not the license).

## Graceful degradation (this is what makes the OSS repo genuinely useful without paying anything)

- **No valid `workflow-engine` key**: `rent-runner` falls back to plain server-rendered CRUD — property/unit list, booking table/calendar, a vendors page, a work-orders table — via Server Actions calling the same `lib/services/*` functions directly. Guest booking (form + Stripe Checkout) is unaffected since it's `rent-runner`'s own code. Only the chat/A2UI concierge layer is gated.
- **No `vendor-marketplace` subscription**: not a hard lock-out. `local_vendor_contacts` lets an owner manually enter a vendor's contact/rate and run the full guest→platform→vendor payout flow standalone via `rent-runner`'s own Connect onboarding. `work_orders`/`contracts` carry a `source: local|marketplace` discriminator. What's lost: cross-instance discovery and marketplace-brokered terms, not payout capability.

## Repo structure (`rent-runner`)

Two shells only — routing exists purely as an auth/middleware boundary (public/token-based vs. authenticated), not separate hand-built screens. Both mount the same `<AgentSurface />` (or the degraded-mode CRUD equivalent); role is resolved server-side from the Clerk session/guest token.

```
app/
  (public)/page.tsx                           -- booking chat/CRUD (property/unit picker) + token-gated concierge chat
  (app)/page.tsx                               -- owner/vendor/contractor shell; role resolved from Clerk session server-side
  api/agent/stream/route.ts                    -- relays to workflow-engine POST /v1/turns
  api/agent/action/route.ts                    -- relays to workflow-engine POST /v1/turns/{id}/actions
  api/mcp/route.ts                             -- tool-server workflow-engine calls back into (turn-scoped token auth)
  api/whoami/route.ts
  api/webhooks/{stripe,clerk,workflow-engine,vendor-marketplace}/route.ts
  api/stripe/{checkout,connect/onboard}/route.ts

lib/
  agent/roles/{public,guest,owner,vendor,contractor}.ts   -- system prompt + tool subset per role (config sent to workflow-engine)
  agent/tools/{properties,units,bookings,contracts,workOrders,payments}.ts  -- the authorization boundary; called both by
                                                                             -- the MCP tool-server (agent path) and directly
                                                                             -- by Server Actions (degraded-mode path)
  webmcp/register.ts                          -- exposes the SAME tools via navigator.modelContext; feature-detected
  a2ui/protocol.ts, a2ui/catalog/{components,functions}.ts, a2ui/surfaceStore.ts
  db/schema/*.ts, db/index.ts (drizzle + @neondatabase/serverless)
  stripe/{client,connect,checkout,transfers,webhookHandlers}.ts
  marketplace/client.ts                       -- typed client for vendor-marketplace's API
  auth/{clerk,guestToken,roleGuard}.ts
  services/{propertyService,unitService,bookingService,contractService,workOrderService,payoutService}.ts

components/a2ui/*.tsx, components/chat/*.tsx, components/crud/*.tsx (degraded-mode views)
middleware.ts
```

## Phased build order

0. **Scaffold `rent-runner`** — Next.js 16 App Router + TS, Clerk (orgs), Drizzle+Neon, Pico.css, Vercel link. Decide/reserve the two other repos (`workflow-engine` private, `vendor-marketplace` private-or-TBD) now, even before building them. Build **stub servers** for both APIs (mock, swappable via base-url env vars) so the contracts above are testable immediately. *Verify: app boots, sign-in works, `drizzle-kit push` connects.*
1. **Auth + tenancy skeleton** — Clerk webhook → `tenants` row; `(public)`/`(app)` shells + `/api/whoami`; middleware gates `(app)`. *Verify: whoami returns correct role for each of the 5 identities; unauthenticated access to `(app)` redirects.*
2. **Domain schema + service layer** — `properties`/`units`/`bookings`/`guest_sessions`/`payments`/`local_vendor_contacts`, tenant scoping enforced at the function boundary. Zero dependency on the other 2 services — do this early. *Verify: CRUD script + cross-tenant access attempts fail.*
3. **Plain degraded-mode CRUD UI, fully working with real Stripe** — owner Connect onboarding, guest Checkout, manual local-vendor + Transfer split, no chat at all. **This is a legitimately shippable OSS milestone with zero dependency on the closed services.** *Verify: full guest→owner→local-vendor money flow in Stripe test mode, no workflow-engine or vendor-marketplace involved.*
4. **A2UI client + workflow-engine integration against the stub** — protocol/renderer, `agent_threads` table, `/api/mcp` tool-server exposing the service layer, SSE consumption. *Verify: full chat round trip against the stub; explicitly verify the "no valid key → degrade to Phase 3 UI" path.*
5. **vendor-marketplace client integration against its stub** — browse/subscribe UI, contract creation, `work_orders` mirror pattern, webhook receivers. *Verify: subscribe → contract → work-order flow against the stub; local-vendor fallback still works with no subscription.*
6. **Build real `workflow-engine`** (separate repo) — Claude Agent SDK orchestration, remote tool-calling via `/api/mcp`, A2UI generation, `recordWorkflowEvent`/Billing Meters, its own conversation persistence. Swap the stub; re-verify Phase 4. *Verify: Stripe Billing Meters shows real events; turn-scoped token can't be replayed outside its turn.*
7. **Build real `vendor-marketplace`** (separate repo) — global directory DB, contracts/work-order ledger, vendor/contractor portal (itself a workflow-engine client). Swap the stub; re-verify Phase 5. *Verify: one Connect account per (vendor, instance) as designed; a second `rent-runner` instance can discover and subscribe to the same vendor.*
8. **Assemble golden path E2E** across all 3 real, deployed services — full 5-role walkthrough (see Verification plan). *Verify: zero manual DB edits across any of the 3 services.*
9. **Visual polish** — Pico theming, responsive/a11y pass, loading/empty/error states, both chat and degraded-mode UI. *Verify: keyboard-only full golden-path run.*

## Risks flagged (accepted, within the 3-service constraint)

1. **Chat-turn latency**: every turn costs a `rent-runner`↔`workflow-engine` round trip plus N tool-callback round trips inside it. Mitigated by SSE incremental streaming and short-lived tokens, but this is a real, non-eliminable cost of the monetization-boundary fix.
2. **Dual-owned `work_orders`/`contracts`** (booking-facing fields owned by `rent-runner`, assignment/completion fields owned by `vendor-marketplace`) is a real eventual-consistency risk. Mitigate with strict single-writer-per-field discipline and idempotent webhook handlers keyed by event id — accepted given the alternative (a 4th service) was explicitly ruled out.
3. **Trust boundary at `/api/mcp`**: `workflow-engine`'s callback is a genuine third-party code-execution channel into a self-hoster's own data. The turn-scoped signed token is the mitigation — this is the single most security-critical piece of the whole architecture; do not under-scope it.
4. **Vendor Connect-account proliferation** (one per vendor per deployment) — accepted friction, not to be "solved" by recentralizing Stripe custody.

## Settled decisions (carried from earlier rounds, still true)

- **Units**: a property is a container; `units` holds independently priced/scheduled/contracted bookable entities. `contracts`/`work_orders` use a nullable unit reference (null = whole property).
- **Auth**: Clerk with Organizations for `rent-runner` (owner tenant = org); vendor identity now lives in `vendor-marketplace`, not as a `rent-runner`-side Clerk org.
- **CSS**: Pico.css — classless/semantic-first, pairs with the A2UI catalog's semantic elements, deliberately not this session's usual Tailwind/shadcn default per the brief's ask for something lightweight.
- **WebMCP**: `navigator.modelContext` (real W3C/Chrome-Edge origin-trial standard) exposes the same `lib/services/*`-backed tools client-side, progressive enhancement, wired at Phase 4.
- **Drizzle over Prisma**: no query-engine binary/codegen inside a Fluid Compute function; closer-to-SQL queries make tenant-scoping easier to audit.
- **Reporting**: no custom engine — Stripe Connect Express dashboards/receipts/1099s cover owner/vendor/contractor/guest needs; `rent-runner` adds only a thin in-chat recent-payments view.
- **Git**: `rent-runner` is its own standalone repo, already `git init`'d separately from the parent `dev` repo.
- **Formal agentic-workflow ceremony**: adopted for this repo — `.claude/verification-status.json`, `docs/AGENTIC-WORKFLOW.md`, `docs/plans/ac-patterns.md`, project-local skills (`ac-verify`, `ui-verify`, `verify-workflow`, `release`), and 3 project-specific hooks (`pre-pr-precheck`, `pre-pr-via-release`, `review-before-merge`) are already in place. `docs/AGENTIC-WORKFLOW.md`'s phase table needs updating to match the phase list above (still says the old 8-phase single-app list — do this before Phase 0 coding starts). Phase 0 (bare scaffold + stubs) runs under the lighter "bootstrap" cadence per that doc; Phase 1 onward is full cadence.
- **OSS license**: not yet chosen (MIT/Apache-2.0 vs AGPL vs source-available) — no longer as load-bearing a decision now that the actual monetization boundary is architectural (the closed `workflow-engine`/`vendor-marketplace` services) rather than license-enforced, but still needs picking before the first public commit. Lean MIT/Apache-2.0 for `rent-runner` given the enforcement now happens elsewhere; `workflow-engine` and `vendor-marketplace` are simply not open-sourced at all (no license question for them beyond "closed").

## Explicitly out of scope for MVP

Vendor types beyond cleaning; disputes/refunds/reviews; multi-property per owner; multi-currency/i18n; email/SMS notifications; contractor calendar sync; vendor sub-contracting; Stripe Connect KYC edge cases (assume instant test-mode verification); a platform-operator admin dashboard; a custom reporting/statement engine; generalizing `workflow-engine` to serve `vendor-marketplace`'s own portal (structurally possible per the API design, but build it hardcoded against `rent-runner`'s shapes first).

## Verification plan (Stripe test mode, golden path across all 3 real services)

1. Owner signs up (Clerk org) → creates a property with 2 units → subscribes to a vendor via `vendor-marketplace`, creates a cleaning contract scoped to one unit and a landscaping contract with no unit set → vendor completes Connect Express onboarding **for this instance specifically**.
2. Public booking chat "book the MIL Suite, Mar 1–3" (via `workflow-engine`) → agent renders that unit's availability → Stripe Checkout test card `4242 4242 4242 4242`.
3. Confirm the PaymentIntent lands in `rent-runner`'s own platform balance and `bookings.status = confirmed`; concierge link issued.
4. Guest concierge chat: "clean before I arrive" → `rent-runner` registers a work order with `vendor-marketplace`, mirrors it locally as `requested`.
5. Contractor (via `vendor-marketplace`'s portal, itself a `workflow-engine` client) sees the assignment, marks complete → webhook flips `rent-runner`'s local mirror to `completed`.
6. Owner approves in `rent-runner` → two Transfers fire from `rent-runner`'s own platform balance → visible in Connect test dashboards; `payments` rows match; `POST /v1/work-orders/{id}/payout-confirmed` sent to `vendor-marketplace`.
7. `workflow-engine`'s Stripe Billing Meters show 3 events including the owner/vendor split on `payout_completed`; `workflow_events` row count matches (idempotency check).
8. Tamper checks: cross-tenant access via a guest token/modified id → 403 from the tool layer; a replayed/expired `/api/mcp` turn-scoped token → rejected.
9. Degraded-mode check: disable the `workflow-engine` API key mid-session → `rent-runner` falls back to plain CRUD, guest booking still completes via Stripe.
10. Cross-instance check: a second `rent-runner` instance subscribes to the same vendor via `vendor-marketplace` → gets its own Connect account for that vendor, independent of the first instance's.

## Critical files to start with

- `lib/db/schema/*` (rent-runner) — tenancy/unit/booking data model foundation
- `lib/services/*` — the authorization-boundary functions called by both the MCP tool-server and degraded-mode Server Actions
- `app/api/mcp/route.ts` — the tool-server callback endpoint workflow-engine calls into; turn-scoped token verification is the single most security-critical piece
- `lib/marketplace/client.ts` — typed client for vendor-marketplace's API
- `lib/stripe/webhookHandlers.ts` — booking confirmation, Transfers, `payout-confirmed` notification to vendor-marketplace
- `docs/AGENTIC-WORKFLOW.md` — needs its phase table updated to match the 10-phase list above before Phase 0 begins
