---
description: Safe file and code search patterns
---

# Search Workflow

## Prefer Built-in Tools

Always use these tools instead of shell commands:

- `grep_search` for text/code search
- `find_by_name` for file search
- `view_file` for file inspection

## Only Use Shell Commands When Necessary

If you must use `find`:

```bash
// turbo
find src -name "*.vue" -type f
```

**Never** use:

- `find` with `-exec` (use tools instead)
- Long-running commands without explicit timeouts
- Commands that require interactive input

## Search Best Practices

1. Use `grep_search` with `MatchPerLine: true` for line-by-line results
2. Use `find_by_name` with specific patterns and extensions
3. Limit search scope to relevant directories
