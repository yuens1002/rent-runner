# rent-runner

An open-source, chat-first short-term rental management app. Guests book and get a conversational concierge, owners manage properties and vendor contracts, vendors and contractors handle service work — all through an agent-rendered UI ([A2UI](https://a2ui.org)) instead of hand-built pages.

> **Status: early architecture/design stage.** No application code yet — this repo currently holds the architecture plan and project tooling. Not ready to run.

## What this is

`rent-runner` is the self-hostable, open-source half of a larger system. It handles everything an individual property owner needs on their own infrastructure:

- Public booking + guest payment (Stripe Checkout)
- A conversational concierge for guests during their stay
- Property/unit management, vendor contracts, work-order dispatch
- Owner → vendor/contractor payouts (Stripe Connect)

The "smart" agent orchestration and the cross-instance vendor marketplace are separate, centrally-hosted services this repo talks to over an API — see [`docs/AGENTIC-WORKFLOW.md`](docs/AGENTIC-WORKFLOW.md) and the architecture plan for the full picture. Without those services configured, `rent-runner` still works as a plain booking + property-management app; the chat/agent layer degrades gracefully.

## Stack

Next.js (App Router) + TypeScript, Drizzle ORM + Neon Postgres, Clerk auth, Stripe, deployed on Vercel. See the architecture plan for the full rationale.

## Getting started

Not yet runnable — Phase 0 scaffolding hasn't started. Once it has, this section will cover local setup (env vars, `npm install`, `drizzle-kit push`, `npm run dev`).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE). (Applies to this repo only; the companion `workflow-engine` and `vendor-marketplace` services referenced in the architecture plan are closed-source and not part of this license.)
