# AI Agent Guidelines

## Command Execution Best Practices

### ✅ DO

- Use `grep_search` instead of `grep` commands
- Use `find_by_name` instead of `find` commands
- Set `SafeToAutoRun: true` for read-only commands
- Use `WaitMsBeforeAsync: 5000-10000` for commands that should complete
- Check command status MAX 3 times before giving up

### ❌ DON'T

- Run `pnpm vitest run` without user approval (it's slow)
- Use `find` with complex expressions when tools exist
- Poll `command_status` indefinitely
- Retry the same failed command without changing approach

## Handling Command Failures

If a command gets cancelled:

1. **Stop** - Don't retry the same command
2. **Analyze** - Ask yourself: "Is there a built-in tool for this?"
3. **Adapt** - Use `grep_search`, `find_by_name`, or `view_file` instead
4. **Communicate** - If tests are needed, ask user to run them

## Test Execution Policy

- **Never** auto-run full test suite (`pnpm vitest run`)
- **Always** propose test commands for user approval
- **Use** specific file tests when possible: `pnpm vitest run path/to/file.spec.ts`
- **Verify** code correctness through static analysis first

## Search Strategy

1. **First choice**: `grep_search` with specific patterns
2. **Second choice**: `find_by_name` with extensions filter
3. **Last resort**: Shell `find` command (with user approval)
