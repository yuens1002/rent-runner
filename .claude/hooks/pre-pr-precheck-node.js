#!/usr/bin/env node
// rent-runner/.claude/hooks/pre-pr-precheck-node.js
//
// PreToolUse(Bash) hook — blocks `gh pr create` unless lint/typecheck/test:ci
// have been run and passed since the last commit on the current branch.
// Reads a fingerprint file (.claude/.precheck-stamp) written by whichever
// skill/step ran precheck (see verify-workflow.md).
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
  const stampFile = path.join(projectDir, ".claude", ".precheck-stamp");

  if (!fs.existsSync(stampFile)) {
    deny(
      "BLOCKED: no precheck stamp found. Run `npm run lint && npm run typecheck && npm run test:ci`, " +
        "then write the commit SHA to .claude/.precheck-stamp, before opening a PR."
    );
  }

  let headSha = "";
  try {
    headSha = execSync("git rev-parse HEAD", { cwd: projectDir, encoding: "utf8" }).trim();
  } catch {
    process.exit(0);
  }

  const stamped = fs.readFileSync(stampFile, "utf8").trim();
  if (stamped !== headSha) {
    deny(
      `BLOCKED: precheck stamp (${stamped}) does not match HEAD (${headSha}). ` +
        "Re-run precheck + test:ci and re-stamp before opening a PR."
    );
  }

  process.exit(0);
}

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => main(input));
