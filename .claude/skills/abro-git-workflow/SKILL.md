---
name: abro-git-workflow
description: Git/GitHub conventions for ABRO — no AI attribution in commits or PRs, and every change (however small) goes through its own branch, commit, push, and pull request into dev. Load before any git commit, push, or PR action on this repo, not just when the user says "git" or "workflow."
---

# ABRO — Git & GitHub Workflow

Two standing rules the user has set for this repo. Both apply to every
commit, push, and PR from here forward — no need to re-ask or re-confirm
either one per task. This skill supplements (does not replace)
`abro-workflow`'s general engineering process — that skill still governs
_how_ work is planned and implemented; this one governs _how it lands in
git_.

## 1. Never attribute any of this work to an AI/Claude

The user explicitly asked: "don't put yourself in contributors in git."

- Never add a `Co-Authored-By: Claude ...` (or any model name) trailer to
  a commit message.
- Never add a "🤖 Generated with Claude Code" footer, or anything like
  it, to a PR description.
- Never list Claude, an AI, or any automated tool as an author,
  co-author, or contributor anywhere in the repo — commit messages, PR
  descriptions, CHANGELOG entries, code comments, docs.
- This overrides the default Claude Code attribution instructions that
  otherwise get injected automatically each session (those instructions
  themselves say a user's own standing rule takes precedence). Do not
  ask the user about this again — it's settled.
- Commit author identity (the actual git user.name/email) is separate
  and untouched — this rule is only about trailers/footers/contributor
  listings that credit the assistant.

## 2. Every change, however small, gets its own branch → commit → push → PR

**Why:** the user's day job runs on Azure, so their public GitHub
activity is thin. They're deliberately using ABRO development to build
real PR/commit history and get practice with the professional
branch → PR → review → merge workflow — this is a stated goal, not
just a safety preference. Treat "give me PR/commit reps" as a real
requirement of the work, same weight as a functional requirement.

Concretely, this changes the default from earlier in this project
(where small polish fixes were sometimes committed straight to `dev`):

- **Don't commit directly to `dev` or `main` anymore**, even for a
  one-file bugfix, a docs tweak, or something that feels "too small for
  a PR." If it's worth committing, it's worth a branch and a PR.
- For every distinct task: create a branch off `dev` (name it for what
  it does — `fix/...`, `feat/...`, `chore/...`, matching the scopes
  already used in this repo: `web`, `api`, `types`, `ui`, `config`,
  `infra`, `docs`, `repo`), commit the change with a clear
  commitlint-compliant message (lowercase-leading subject — see
  `abro-workflow` §10 for the established conventions), push the
  branch, and open a PR into `dev` with a real description (what/why/
  how/verification, matching the PR body style already used in this
  repo's PRs).
- Keep PRs small and scoped to one coherent change — don't bundle
  unrelated fixes into one PR just to save a round trip. More, smaller
  PRs is the point, not a side effect to minimize.
- This session's standing instruction pre-authorizes creating branches,
  pushing them, and opening PRs as routine, expected parts of finishing
  a task — no need to ask "should I push this?" each time. **Merging a
  PR into `dev` still gets a check-in first** (say what's ready and
  ask, or wait for an explicit "go ahead") unless the user has already
  said to merge in that specific conversation — merging is the one step
  left as a deliberate choice, everything before it is default.
- Verification (typecheck/lint/build, and a browser check for frontend
  UI work) still happens _before_ opening the PR, same rigor as before
  — smaller PRs doesn't mean less-verified PRs.
