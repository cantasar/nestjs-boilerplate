---
name: compare-branches
description: Before any commit in a project with more than one backend dev, compare this branch with the base branch and the other devs' active branches. Finds files changed on both sides and real merge conflicts. Read-only, never merges or switches branches.
allowed-tools: Bash(git fetch *), Bash(git status *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git merge-tree *), Bash(git diff *), Bash(git log *), Bash(git for-each-ref *)
---

# Compare branches

Read-only. Never merge, rebase, switch branches or commit.

1. Update remote info: `git fetch --all --prune`
2. Base branch: from `CLAUDE.md` → Project info (default `main`).
3. Our changes: files changed since we left the base, plus uncommitted files:
   - `git diff --name-only $(git merge-base HEAD origin/<base>)`
   - `git status --porcelain`
4. Active branches of other devs (updated in the last 14 days, not ours, not the base):
   `git for-each-ref --sort=-committerdate --format='%(refname:short)|%(committerdate:relative)|%(authorname)' refs/remotes/origin`
5. For each active branch:
   - their files: `git diff --name-only $(git merge-base origin/<base> origin/<branch>) origin/<branch>`
   - overlap: files in both lists
   - real conflicts: `git merge-tree --write-tree --name-only HEAD origin/<branch>` (exit code 1 = conflicts)
6. Also check the base: `git merge-tree --write-tree --name-only HEAD origin/<base>`

## Report

A short table: branch, author, last update, shared files, conflicts (yes/no).
Then one plain recommendation, for example: "main moved ahead and touches `auth.service.ts`. Update your branch from main before you commit" or "Talk to <author> about `user.schema.ts`."
