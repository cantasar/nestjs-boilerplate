---
name: project-setup
description: Set up a project made from this boilerplate, or a fresh clone on a new machine. Asks the project questions (name, MD language, more than one backend dev), fills "Project info" in CLAUDE.md and creates the docs, tasks, communication and internal folders. Use it when the user says init, setup or new project, or when Project info in CLAUDE.md still says NOT SET.
---

# Project setup

Talk simply. Ask with the AskUserQuestion tool and put your recommended option first.

## 1. Ask (skip what is already filled in CLAUDE.md → Project info, unless the user wants to change it)

1. **Project name**: short name of the API.
2. **MD language** for docs, tasks and communication MDs: English (recommended for mixed teams) or Turkish.
3. **More than one backend dev?** If yes, ask the base branch name (default `main`).

## 2. Save the answers

Update the "Project info" block in `CLAUDE.md`. Keep its format, replace every NOT SET, and remove the "Setup first" note.

- One backend dev: `- **Backend devs:** one`
- More than one: `- **Backend devs:** more than one → run /compare-branches before every commit and log every finished task in internal/INTERNAL_CHANGELOG.md` (keep the backticks)

## 3. Create the folders (keep files that already exist)

```bash
mkdir -p docs tasks/{todo,in-progress,done,test-logs,corrections}
mkdir -p communication/{frontend,backend,flutter,design}/{inbox,will-send,sent-waiting,sent-done}
```

- `docs/PLAN.md`, `docs/ROADMAP.md`, `docs/CHANGELOG.md` from `.claude/templates/plan.md`, `roadmap.md`, `changelog.md`.
- More than one backend dev: `internal/INTERNAL_CHANGELOG.md` from `.claude/templates/internal-changelog.md`.

Write the MDs in the chosen MD language.

## 4. Make the MD folders local

The template ships `docs/` and `communication/` as empty folders, so git tracks them even though `.gitignore` lists them.

- Check `.gitignore` still has `/docs/`, `/tasks/` and `/communication/`. Add them if not.
- Run `git ls-files docs communication`. If it lists files, warn the user clearly: "git still tracks `docs/` and `communication/`, so your plans and team messages can end up in a commit. Run this once, then commit:"
  ```bash
  git rm -r --cached docs communication
  ```
- Do not run it yourself. Humans do all git writes.

## 5. New project from the boilerplate only

Suggest these changes (ask before each one, do not commit):
- `package.json` name, README title, Swagger title in `src/swagger/setup-swagger.ts`
- real roles in `UserRole`, real error codes in `src/modules/shared/common/errors/`
- `MOBILE_TAGS` in `src/swagger/setup-swagger.ts`
- remove the `_template/todo` example once the first real feature exists

## 6. Finish

End with the standard report from `CLAUDE.md` (status, commit, deploy).
