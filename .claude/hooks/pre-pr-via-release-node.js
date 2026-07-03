#!/usr/bin/env node
// rent-runner/.claude/hooks/pre-pr-via-release-node.js
//
// PreToolUse(Bash) hook — blocks `gh pr create` unless it was invoked through
// the /release skill, which writes a fingerprint file before creating the PR.
//
// Exit 0 = allow, exit 2 = block.

const fs = require("fs");
const path = require("path");
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

  if (!/^\s*gh pr create/i.test(command)) {
    process.exit(0);
  }

  const projectDir = process.cwd();
  const fingerprintFile = path.join(projectDir, ".claude", ".release-fingerprint");

  if (!fs.existsSync(fingerprintFile)) {
    deny(
      "BLOCKED: PRs must be opened via the /release skill (see .claude/commands/release.md), " +
        "not directly. Run /release."
    );
  }

  let headSha = "";
  try {
    headSha = execSync("git rev-parse HEAD", { cwd: projectDir, encoding: "utf8" }).trim();
  } catch {
    process.exit(0);
  }

  const fingerprint = fs.readFileSync(fingerprintFile, "utf8").trim();
  if (fingerprint !== headSha) {
    deny(
      `BLOCKED: release fingerprint (${fingerprint}) does not match HEAD (${headSha}). ` +
        "Re-run /release before opening a PR."
    );
  }

  process.exit(0);
}

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => main(input));
