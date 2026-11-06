#!/usr/bin/env node
// Hook PreToolUse (Bash) : bloque de façon déterministe les commandes dangereuses,
// même si le modèle a été trompé (injection de prompt, erreur).
// Code de sortie 2 = commande refusée, le message stderr est renvoyé à l'agent.
import { readFileSync } from "node:fs";

let command = "";
try {
  command = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command ?? "";
} catch {
  process.exit(0);
}

// Découpe sur les séparateurs shell pour analyser chaque sous-commande.
const segments = command.split(/&&|\|\||;|\||\n|\$\(|`/).map((s) => s.trim());

const rules = [
  {
    test: (s) => /^(sudo\s+)?rm\s/.test(s) && /\s-[a-zA-Z]*[rR]/.test(s) && /\s-[a-zA-Z]*f|--force/.test(s),
    reason: "rm -rf est interdit. Supprime les fichiers un par un ou demande à l'utilisateur.",
  },
  {
    test: (s) => /^rm\s.*--recursive/.test(s) && /--force|\s-[a-zA-Z]*f/.test(s),
    reason: "rm récursif forcé interdit.",
  },
  { test: (s) => /^sudo\s/.test(s), reason: "sudo est interdit." },
  {
    test: (s) => /^git\s+push\b/.test(s) && /(\s-f\b|--force|\s\+\S)/.test(s),
    reason: "Push forcé interdit. Crée un nouveau commit à la place.",
  },
  {
    test: (s) => /^git\s+push\b/.test(s) && /\b(main|master)\b/.test(s),
    reason: "Push direct sur main interdit : passe par une branche et une PR.",
  },
  {
    // -n vaut --no-verify pour commit (y compris groupé : -nm), mais --dry-run pour push.
    test: (s) =>
      (/^git\s+(commit|push|merge|rebase|am)\b/.test(s) && /--no-verify/.test(s)) ||
      (/^git\s+commit\b/.test(s) && /\s-[a-zA-Z]*n[a-zA-Z]*(\s|$)/.test(s)),
    reason: "--no-verify contourne le pre-commit (Gitleaks). Interdit.",
  },
  { test: (s) => /^git\s+reset\s+--hard/.test(s), reason: "git reset --hard interdit (perte de travail)." },
  { test: (s) => /^git\s+clean\s+.*-[a-zA-Z]*f/.test(s), reason: "git clean -f interdit." },
  {
    test: (s) =>
      /^(npx\s+)?vercel(\s|$)/.test(s) &&
      (/\s(deploy|--prod|promote|rollback|env|remove|rm|redeploy)(\s|=|$)/.test(s) || /^(npx\s+)?vercel$/.test(s)),
    reason: "Pas de déploiement ni de modification Vercel depuis la machine : le merge sur main déploie.",
  },
  {
    test: (s) => /^(curl|wget)\s/.test(s) && /\|\s*(ba|z)?sh\b/.test(command),
    reason: "Exécuter un script téléchargé (curl | sh) est interdit.",
  },
  {
    test: (s) =>
      /^(cat|less|more|head|tail|bat|grep|rg|sed|awk|cp|mv|source|\.|xxd|base64|strings|nano|vi|vim)\b/.test(s) &&
      /(^|[\s/'"])\.env(\.(?!example\b)[\w.-]+)?(\s|$|['"])/.test(s),
    reason: "Lecture des fichiers .env interdite. Utilise .env.example pour connaître les noms de variables.",
  },
  {
    test: (s) => /^(printenv|env)(\s|$)/.test(s) || /^export\s+-p/.test(s),
    reason: "Afficher l'environnement complet peut exposer des secrets. Interroge une variable précise si besoin.",
  },
  {
    test: (s) => /\.(pem|key|p12|pfx)\b|id_(rsa|ed25519|ecdsa)\b|\.ssh\//.test(s) && /^(cat|less|more|head|tail|cp|mv|base64|xxd)\b/.test(s),
    reason: "Lecture de clés privées interdite.",
  },
];

for (const segment of segments) {
  for (const rule of rules) {
    if (rule.test(segment)) {
      process.stderr.write(`BLOQUÉ par .claude/hooks/guard-bash.mjs : ${rule.reason}\n`);
      process.exit(2);
    }
  }
}
process.exit(0);
