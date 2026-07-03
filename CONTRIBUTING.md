# Contributing to rent-runner

Thanks for your interest — this project is early (pre-code, architecture stage), so the most useful contributions right now are design/architecture feedback via issues rather than PRs.

## Reporting issues

Open a GitHub issue. For bugs once the app is running, include repro steps and environment details. For feature/architecture proposals, explain the use case, not just the implementation.

## Development process

This repo follows a structured plan → ACs → verify → review workflow for non-trivial changes — see [`docs/AGENTIC-WORKFLOW.md`](docs/AGENTIC-WORKFLOW.md) for the full cadence. For small fixes (docs, typos, config), a normal PR is fine.

1. Fork the repo, create a branch off `main`.
2. Make your change. If it's a feature-sized change, open an issue first to discuss scope before investing time.
3. Open a PR against `main` with a clear description of what changed and why.
4. CI must pass; a maintainer will review.

## Commit style

Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, etc.) are preferred so the changelog can eventually be generated/cross-checked from history.

## Code of conduct

Be respectful and constructive. Standard open-source etiquette — no harassment, no bad-faith arguing, assume good intent.

## License

By contributing, you agree your contributions are licensed under this repo's [MIT License](LICENSE).
