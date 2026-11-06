#!/usr/bin/env node
// Hook PreToolUse (Read, Edit, Write, Grep, Glob) : empêche l'agent de lire ou
// modifier les fichiers de secrets (.env*, clés privées), sauf .env.example.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const toolInput = input.tool_input ?? {};
const candidates = [toolInput.file_path, toolInput.path, toolInput.notebook_path, toolInput.pattern, toolInput.glob]
  .filter((v) => typeof v === "string");

const isSecretPath = (p) => {
  const name = basename(p);
  if (name === ".env.example") return false;
  if (/^\.env(\..+)?$/.test(name)) return true;
  if (/\.(pem|key|p12|pfx)$/.test(name)) return true;
  if (/^id_(rsa|ed25519|ecdsa)/.test(name)) return true;
  if (/(^|\/)\.ssh\//.test(p)) return true;
  if (/\.vercel\/\.env/.test(p)) return true;
  return false;
};

const hit = candidates.find(isSecretPath);
if (hit) {
  process.stderr.write(
    `BLOQUÉ par .claude/hooks/guard-files.mjs : accès à « ${hit} » refusé (fichier de secrets). ` +
      "Utilise .env.example pour connaître les noms de variables.\n",
  );
  process.exit(2);
}
process.exit(0);
