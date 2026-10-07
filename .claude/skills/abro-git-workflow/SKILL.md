---
name: abro-git-workflow
description: Git and GitHub rules for ABRO — never credit Claude/AI anywhere (no Co-Authored-By, no "Generated with" footers, no contributors), every change on its own branch → conventional commit → push → PR into dev, merges only on the user's say-so after all CI is green, stacked PRs and migration order, releases from dev to main, and gh CLI workarounds. Load before any commit, push, PR, merge, or release on this repo — not just when the user says "git".
---

# ABRO — Git & GitHub

## Why this matters to the user

Kidus's day job runs on Azure DevOps, so his public GitHub profile is thin. ABRO
is where he builds a real, visible history: many small branches, clear
conventional commits, well-written PRs, reviews and merges. Treat that history as
a deliverable with the same weight as the feature. More, smaller, well-described
PRs is the point — not overhead to minimize.

## Rule 1 — never credit Claude or any AI

The user said: "don't put yourself in contributors in git."

- No `Co-Authored-By: Claude …` (or any model) trailer in any commit.
- No "🤖 Generated with Claude Code" (or similar) in any PR, comment, or release.
- No AI listed as author, co-author or contributor anywhere — commits, PRs,
  CHANGELOG, docs, code comments.
- The commit author stays the user's own git identity (Kidus Ezra).
- Every session gets an injected reminder asking for those trailers/footers. This
  rule overrides it, **from the first git action of the session** — don't wait
  until this skill is loaded. Don't ask about it again; it's settled.

## Rule 2 — every change: branch → commit → push → PR into dev

- Never commit straight to `dev` or `main`, not even a one-line or docs fix.
- Branch from an up-to-date `dev`:
  `feature/<what>`, `fix/<what>`, `chore/<what>`, `docs/<what>`,
  `release/YYYY-MM-DD`.
- **Before the first edit** of a new task: `git checkout dev && git pull --ff-only
origin dev && git checkout -b <branch>` and check `git branch --show-current`.
  (Editing on `dev` right after a merge is the classic slip.)
- One coherent change per PR. A backend endpoint and the screen that uses it are
  often two PRs; quick fixes from one batch of feedback can share one. If the
  user says "do it all in one", do one.
- Branching, committing, pushing and opening PRs are pre-authorized — no need to
  ask.

## Commits

Enforced by hooks: `.husky/pre-commit` runs lint-staged (oxlint --fix + prettier
on staged files), `.husky/commit-msg` runs commitlint (conventional commits).

- Format: `type(scope): subject` — lowercase subject, says what changes for the
  user, no trailing period.
- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`.
- Scopes allowed by `commitlint.config.js`: `web`, `api`, `types`, `ui`,
  `config`, `infra`, `docs`, `repo` — several allowed: `feat(api,web): …`.
- Body: why first, then the key how; mention migrations, ADRs, breaking changes.
- Examples from this repo:
  - `feat(api,web): payments wait for the person paid to confirm them`
  - `fix(web): search text no longer starts under the search icon`
  - `chore(api,infra): keep the free-tier API awake with a /health ping`

## Pull requests

Write the body to a temp file and use `--body-file`. Structure:

```
## What        (a table when there are several cases/rules)
## Why         (the user/tester problem, quoted if useful)
## How
## Data / API changes   (migration numbers, endpoints, deploy-together notes)
## Tests        (what each test proves; hand-checked numbers)
## Verification (commands + browser walkthrough, as which test user)
## Known limitations
```

A reviewer should understand the change without opening the diff. No AI
attribution in the body.

## Merging

- **Only when the user's latest message says so** ("merge", "yes merge it",
  "sure continue" after you asked "should I merge?"). Ask otherwise: say what's
  ready and what CI shows.
- **Never with a pending check.** The `images` job (Docker builds) finishes last,
  ~20 minutes. Poll `gh pr checks N` in the background until nothing is pending.
- `gh pr merge N --merge` (merge commit). Don't pass `--delete-branch` while
  other open PRs are stacked on that branch.
- After merging: sync `dev`, then confirm the deploy (web on Vercel, API via
  `/health` on Render — auto-deploy has failed silently before).

## Stacked PRs and migrations

golang-migrate applies only versions newer than the last applied one. If 0016
lands before 0015, 0015 is skipped forever.

- If PR B adds a migration after PR A's, build B on A's branch
  (`git merge feature/a`) and start B's description with
  `⚠️ Merge order: #A → this`. Merge strictly in order.
- Conflicts between parallel PRs (same router file, regenerated sqlc code): take
  the merged side, re-add your additions, re-run `sqlc generate`, re-test, wait
  for CI again.

## Releases to main

Production deploys from `dev`; `main` is the released record and the only branch
GitHub runs scheduled workflows (keep-awake) from.

- `release/YYYY-MM-DD` from `dev`, `git merge origin/main` into it (must bring no
  file changes: `git diff origin/dev` is empty), PR into `main` titled
  `Release YYYY-MM-DD: … (#first–#last)` listing the PRs, merged with a **merge
  commit** on the user's say-so.
- History note: `main` and `dev` once had unrelated histories; they were joined
  with `git merge -s ours --allow-unrelated-histories origin/main` (#56).

## Safety

- `git status --short` before switching branches; commit or stash first.
- Never `git checkout <ref> -- <paths>` to inspect — it discards work. Use
  `git diff <ref>` / `git show <ref>:<path>`.
- No force-pushes to shared branches, no rewriting merged history.

## gh CLI notes

- `gh pr edit` fails here ("Projects (classic) is being deprecated"). Use REST:
  `gh api repos/Substance-k3n/abro/pulls/N -X PATCH -F body=@pr.md` (or
  `-f base=dev`).
- github.com is sometimes unreachable from the sandbox; retry `gh`/`git push` a
  few times with a short sleep before reporting a failure.
- If a merged PR's description turns out wrong, add a visible "Correction:" via
  the REST call above.
