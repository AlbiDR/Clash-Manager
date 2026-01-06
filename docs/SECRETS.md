# Secrets & API Keys (short guide)

This project expects a few provider API keys to be configured as secrets rather than committed in files.

Recommended secret names (set these in **GitHub → Settings → Secrets and variables → Actions**):

- `GEMINI_API_KEY` — used by the Gemini entries in `.continue/config.yaml`
- `CLAUDE_OPUS_API_KEY`
- `CLAUDE_SONNET_API_KEY`
- `CLAUDE_HAIKU_API_KEY`

Local development
- Add the keys to your OS environment (macOS zsh):
  - `export GEMINI_API_KEY="sk_..."`
  - `export CLAUDE_OPUS_API_KEY="sk_..."`
  - Add to your `~/.zshrc` or use a `.env` loader locally (do not commit `.env`).

Continue CLI secrets
- For the Continue extension, prefer the Continue hub secrets manager: https://hub.continue.dev/settings/secrets
  - Add the same secret names there (e.g. `GEMINI_API_KEY`).
  - Update `~/.continue/config.yaml` to reference `${GEMINI_API_KEY}` (already used in this repo).

If a key was leaked
1. Rotate / revoke the compromised key immediately in the provider console.
2. If the key was committed to Git history, contact me before proceeding — we can purge history with `git filter-repo` or BFG, but that rewrites history and requires coordination.

Automation
- A secrets-scan workflow (`.github/workflows/secrets-scan.yml`) has been added to scan PRs and pushes using TruffleHog (installed and run directly in the workflow since the original GitHub Action was removed).

Tips
- Use least privilege when creating API keys and set expiry or restrictions where available.
- Audit secrets periodically and rotate them on calendar schedule (90 days recommended).