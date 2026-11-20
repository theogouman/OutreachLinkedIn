import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Graphiques bklit (MIT), copiés depuis le registre shadcn @bklit et gardés tels quels
  // pour pouvoir les mettre à jour : règles de style React assouplies sur ce seul dossier.
  {
    files: ["src/components/charts/**"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Filtres ReUI (src/components/reui) et primitives shadcn (src/components/ui), installés par la
  // CLI shadcn et gardés tels quels pour pouvoir les mettre à jour : mêmes assouplissements.
  {
    files: ["src/components/reui/**", "src/components/ui/**"],
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Dépôts de design tiers, clonés pour référence (non versionnés).
    "design-refs/**",
  ]),
]);

export default eslintConfig;
