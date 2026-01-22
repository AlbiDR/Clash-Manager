---
description: Run test suite safely
---

# Test Execution Workflow

## Standard Test Run

```bash
// turbo
pnpm vitest run --reporter=verbose
```

## Single File Test

```bash
// turbo
pnpm vitest run <file-path> --reporter=verbose
```

## Watch Mode (Manual Only)

```bash
pnpm vitest watch
```

**Note**: Always use `--reporter=verbose` for clear output. Watch mode should only be run manually by the user.
