---
trigger: always_on
---

# Rule: Automatic Conventional Commit Generation

At the conclusion of every task or upon request, provide a Git commit message following the "Conventional Commits" specification.

## 1. Structure

The output must follow this exact format:
<type>[optional scope]: <description (title)>

[optional body]

[optional footer(s)]

## 2. Formatting Rules

- **Title Line:**
  - Must use lowercase types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
  - Limit the title line to 50 characters.
  - Do not end the title with a period.
  - Use the imperative mood (e.g., "add feature" not "added feature").
- **Body:**
  - Separate the title from the body with a blank line.
  - Use bullet points to describe "What" and "Why" (not "How").
  - Wrap lines at 72 characters.
- **Scope:** Use the directory or module name as the scope if the change is localized (e.g., `feat(ui): ...`).

## 3. Logic for Generation

- Analyze the current session's code changes and conversation history.
- Categorize the change based on impact:
  - `feat`: New functionality.
  - `fix`: Bug fixes (reference issue numbers if known).
  - `refactor`: Code changes that neither fix bugs nor add features.
  - `chore`: Maintenance, dependencies, or build config.
- If a "Breaking Change" is detected, add `!` after the type/scope and include `BREAKING CHANGE:` in the footer.

## 4. Output Instruction

Provide the final commit message in a single code block for easy copying. Do not include conversational filler or meta-commentary.