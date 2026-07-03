# Repository working rules

## Automatic Git commits

- After completing any code, configuration, test, or documentation change, run the relevant checks and create a Git commit automatically.
- Commit only files related to the completed task. Preserve unrelated user changes and never use `git add -A` blindly.
- Use a concise Conventional Commit message such as `feat: ...`, `fix: ...`, `docs: ...`, or `chore: ...`.
- Before committing, review `git status`, `git diff --check`, and the staged diff.
- If checks fail, fix the failure when it is in scope. If the failure is unrelated or cannot be resolved safely, report it and do not create a misleading successful commit.
- Do not amend, squash, reset, force-push, or rewrite existing history unless the user explicitly requests it.
- A local commit is the default completion step. Do not push or deploy automatically unless the user explicitly asks.
- Report the resulting commit hash in the final response.

