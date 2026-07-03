# /release — rent-runner

Project-specific release convention (Phase 6 of `/agentic-workflow`), for an OSS repo with no prior releases yet.

## Steps

1. **Confirm verification-status is `"verified"`** for the branch (the pre-PR hooks enforce this — see below).
2. **Push** the branch, **open the PR** via `gh pr create` (title/summary per the standard PR conventions in this session's system instructions).
3. **Wait for CI** (once a CI workflow exists — none yet at repo init; add a minimal GitHub Actions workflow running `npm run lint`, `npm run typecheck`, `npm run test:ci` as part of Phase 0).
4. **Address review feedback** (Copilot / human) — the `review-before-merge-node.js` hook blocks `gh pr merge` until threads are resolved.
5. **Merge** via `gh pr merge`.
6. **Tag**: on `main` after merge, tag `vX.Y.Z` following semver — `0.x.y` pre-MVP-completion, bump to `1.0.0` once the Phase 6 golden path is fully verified end-to-end. `git tag vX.Y.Z && git push origin vX.Y.Z`.
7. **Changelog**: append an entry to `CHANGELOG.md` (create it in Phase 0 if it doesn't exist) summarizing the release — one line per merged feature branch since the last tag.

## Enforcement hooks (this repo's `.claude/hooks/`, registered in this repo's `.claude/settings.json`)

- `pre-pr-precheck-node.js` — blocks `gh pr create` unless lint/typecheck/test:ci have run since the last commit on the branch.
- `pre-pr-via-release-node.js` — blocks `gh pr create` unless it was invoked through this `/release` skill (checks a fingerprint file this skill writes before creating the PR).
- `review-before-merge-node.js` — blocks `gh pr merge` until any Copilot review comments are resolved.
