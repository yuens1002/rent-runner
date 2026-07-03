#!/usr/bin/env node
// rent-runner/.claude/hooks/review-before-merge-node.js
//
// PreToolUse(Bash) hook — blocks `gh pr merge` until any review comments
// (e.g. GitHub Copilot review) on the current PR are resolved.
//
// Exit 0 = allow, exit 2 = block.

const { execSync } = require("child_process");

function deny(reason) {
  process.stderr.write(reason);
  process.exit(2);
}

function main(input) {
  let command = "";
  try {
    const parsed = JSON.parse(input);
    command = (parsed.tool_input && parsed.tool_input.command) || "";
  } catch {
    process.exit(0);
  }

  if (!/^\s*gh pr merge/i.test(command)) {
    process.exit(0);
  }

  const projectDir = process.cwd();

  let unresolvedCount = 0;
  try {
    const prNumber = execSync("gh pr view --json number -q .number", {
      cwd: projectDir,
      encoding: "utf8",
    }).trim();

    const nameWithOwner = execSync("gh repo view --json nameWithOwner -q .nameWithOwner", {
      cwd: projectDir,
      encoding: "utf8",
    }).trim();
    const [owner, repo] = nameWithOwner.split("/");

    const threads = execSync(
      `gh api graphql -f query='query { repository(owner:"${owner}", name:"${repo}") { pullRequest(number: ${prNumber}) { reviewThreads(first: 100) { nodes { isResolved } } } } }'`,
      { cwd: projectDir, encoding: "utf8" }
    );
    const parsed = JSON.parse(threads);
    const nodes =
      (parsed.data &&
        parsed.data.repository &&
        parsed.data.repository.pullRequest &&
        parsed.data.repository.pullRequest.reviewThreads &&
        parsed.data.repository.pullRequest.reviewThreads.nodes) ||
      [];
    unresolvedCount = nodes.filter((n) => !n.isResolved).length;
  } catch {
    // If we can't determine review state (no PR open yet, gh not configured, etc.),
    // don't block on infrastructure failure — allow and let the human catch it.
    process.exit(0);
  }

  if (unresolvedCount > 0) {
    deny(`BLOCKED: ${unresolvedCount} unresolved review thread(s) on this PR. Resolve them before merging.`);
  }

  process.exit(0);
}

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => main(input));
