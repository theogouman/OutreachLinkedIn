# OutreachLinkedIn

Application Next.js + Supabase déployée sur Vercel, développée majoritairement avec Claude Code.

- Démarrage et réglages GitHub / Vercel : [docs/setup.md](docs/setup.md)
- Architecture et garde-fous : [docs/architecture.md](docs/architecture.md)
- Règles pour l'agent : [CLAUDE.md](CLAUDE.md)

```bash
npm ci
npm run dev
```

Règle d'or : rien n'arrive sur `main` sans être passé par une PR qui a réussi la CI.
