#!/usr/bin/env node
// Hook PostToolUse (Edit, Write) : lance ESLint --fix sur le fichier modifié.
// Non bloquant : les erreurs restantes sont renvoyées à l'agent pour qu'il les corrige.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

let filePath = "";
try {
  filePath = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.file_path ?? "";
} catch {
  process.exit(0);
}
if (!/\.(m|c)?(t|j)sx?$/.test(filePath) || filePath.includes("node_modules")) process.exit(0);

const result = spawnSync("npx", ["--no-install", "eslint", "--fix", filePath], {
  cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  encoding: "utf8",
  timeout: 60_000,
});
if (result.status !== 0 && result.stdout) {
  process.stderr.write(`ESLint signale des problèmes dans ${filePath} :\n${result.stdout}`);
  process.exit(2);
}
process.exit(0);
