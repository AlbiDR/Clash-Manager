# Contributing

Thanks for considering contributing — this project values clear, small, and testable changes.

## How to contribute
1. Fork and create a branch named `fix/` or `feat/` from `Stable`.
2. Run tests and linters locally before opening a PR.
3. Keep PRs focused and add a clear description and test plan.

## Coding conventions
- JavaScript/TypeScript: follow project ESLint rules.
- Commit messages: use conventional commits (e.g., `fix:`, `feat:`, `chore:`).

## Tests
- Add unit tests for new logic (Vitest used in PWA).
- For backend, test scoring calculations on a sandbox Google Sheet before deploying.

## Review process
- PRs should include a summary, testing steps, and ideally a screenshot or artifact when applicable.
- Maintain backward compatibility with stored leaderboard format unless a migration is documented.
