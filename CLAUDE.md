# CLAUDE.md — mgsf-field-os

## Deployment
- Hosts **Klyfton AI** — a single self-contained static app at `public/index.html`
  (no build; `vercel.json` is framework `null`, `outputDirectory: public`).
- Auto-deploys `main` → Vercel project `mgsf-fieldos` → **app.machinegunsprayfoam.info**.

## Git commit author — REQUIRED
Vercel **blocks any deploy whose commit-author email is not linked to the GitHub
account.** Always author commits (here and in every machinegunsprayfoam-crypto repo
that deploys to Vercel) with:

```
git config user.email "machinegunsprayfoam@gmail.com"
git config user.name  "machinegunsprayfoam-crypto"
```

Do **not** use `clifton@machinegunsprayfoam.info` for commits — it is not a
GitHub-linked email and every deploy from it lands in `BLOCKED` state.
