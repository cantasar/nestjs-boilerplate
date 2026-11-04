---
name: task-done
description: Close a finished task. Use at the end of every task, after the tester session said PASS. The coder runs it, never the tester. Writes the changelog, moves the task MDs, compares branches when more than one backend dev works here, updates README when needed and gives the final done/commit/deploy report.
---

# Close a task

## 1. Check it is really done

- Last run in `tasks/test-logs/<task-name>.md` is **PASS**.
- `tasks/corrections/<task-name>.md` has no open HIGH or MEDIUM items.

If not: stop. Report **Not done ❌** and list what is open.

## 2. Write it down

- Add an entry at the top of `docs/CHANGELOG.md` (format in `.claude/templates/changelog.md`).
- More than one backend dev (see `CLAUDE.md` → Project info): add an entry to `internal/INTERNAL_CHANGELOG.md` too. Use `git config user.name` and the current branch.
- Big change (new module, endpoint change, new env vars, new setup step)? Update `README.md`.
- Update `docs/PLAN.md` (and `docs/ROADMAP.md`) if the task was listed there.

## 3. Move the files

- `tasks/in-progress/<task-name>.md` → `tasks/done/` and set **Status: done**.
- Communication MDs for this task: move them to the right folder (see `CLAUDE.md` → Moving MDs).

## 4. Compare branches (more than one backend dev only)

Run the `/compare-branches` steps and add the result to the report.

## 5. Final report

Use the standard report from `CLAUDE.md`: status, commit, deploy.

## 6. Clean up (only with a clear yes)

Ask: "The task is in the changelog. Should I delete its task, test log and corrections files?" Delete only after the user says yes.
