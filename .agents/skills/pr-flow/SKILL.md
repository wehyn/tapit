---
name: pr-flow
description: Use when the user asks to implement repository changes as focused commits on a branch and, when explicitly requested, push the branch and open a GitHub pull request. Triggers include "create a branch and PR", "commit feature by feature", "make a PR with separate commits", or "implement this and open a PR".
---

# PR Flow

Use this skill to produce reviewable feature commits and, only when in scope, a verified GitHub pull request.

## Core Rules

- Resolve the actual repository root, target base branch, current branch, remotes, and initial worktree state before editing.
- Treat all pre-existing unstaged, staged, and untracked changes as user-owned. Never discard, reset, clean, or overwrite them.
- Before each commit, inspect both the staged and unstaged diffs. Do not commit a file containing unrelated pre-existing changes unless the slice has been separated safely or the user resolves the overlap.
- Prefer one commit per coherent feature, fix, or behavior change. Do not create artificial micro-commits for formatting churn.
- Validate each slice before committing when a targeted check is available, and report checks that could not be run.
- Never force-push a shared branch. If a push is rejected or the remote branch diverged, stop and report the conflict rather than rewriting history.
- Do not push, open a PR, merge, close, or delete branches unless that action is explicitly in scope. A request for local feature commits stops after local verification.

## Agent-only documents and commit boundaries

Keep agent-only working artifacts local by default, outside repository history and in the workspace's `work/` folder or another sibling outside the repository. This includes scratch notes, transient implementation plans, session reports and summaries, screenshots, `.playwright-mcp/` output, scratch scripts, and private agent settings or memory.

Commit only files required by the requested implementation or explicitly requested as repository or developer documentation. Repository-owned files such as a `README`, setup guide, ADR, data-model document, `AGENTS.md`, `CONTRIBUTING.md`, an existing `TASKS.md` ledger, or a user-requested spec or plan may be committed when the repository workflow or user scope requires it. A documentation-only PR is appropriate for project documentation; do not use a PR merely to transport internal planning notes.

Before staging, classify every document as one of:

- implementation or supporting artifact: commit when it is required for the requested change;
- repository deliverable: commit when it is repository-owned or explicitly requested; or
- agent-only artifact: keep local and show the workspace path when the owner needs to review it.

Never copy user-global `.agents` settings, memory, or credentials into a repository. Repository-local `.agents/skills/**` may be committed only when it is explicitly repository-owned or requested.

If an agent-only document is already in unpushed work, preserve a copy outside the repository before any history change and obtain explicit approval before dropping or rewriting the commit. If it is already pushed or merged, leave it in place and report it; do not delete it merely to enforce this policy.

## Workflow

1. Establish scope and a baseline.
   - Resolve the repository root, then check for a repository-root `CONTRIBUTING.md`. If it exists, read it in full before reading any other repository guidance or inspecting repository state, and follow its applicable instructions.
   - Read the user request and any additional repository guidance files that apply to the touched area.
   - Inspect `git status --short --branch`, the unstaged and staged diffs, and untracked paths. Record the baseline so later changes can be distinguished from user work.
   - Resolve the target base branch from the user request, repository policy, or the remote's default branch. Verify the remote and base ref instead of assuming `origin/main`.
   - When an up-to-date base is needed, fetch the target ref. Fast-forward a local base only when it is clean; if it is dirty, preserve and restore the user's changes with a recoverable method and verify the result before editing.
   - If the current branch is the base branch, create an appropriate feature branch before edits. If an existing non-base branch already matches the requested work, inspect and reuse it rather than creating a duplicate. Check for local and remote branch-name collisions before creating or publishing a branch.
   - Use a concise branch name such as `feature/<topic>` or `fix/<topic>`, `refactor/<topic>`, `chore/<topic>`, `docs/<topic>` following the repository's established pattern.

2. Plan feature slices.
   - Split the request into commit-sized pieces that each make sense in review.
   - Order slices by dependency when needed, such as shared foundations before consumers.
   - Preserve explicit user groupings unless they would make an intermediate commit broken or needlessly difficult to review.

3. Implement one slice at a time.
   - Edit only files needed for the current slice.
   - Run focused tests, type checks, lint, or smoke checks appropriate to the slice.
   - Review the slice with `git diff -- <paths>` before staging.
   - Stage only the slice's paths. If a path contains mixed user and task changes, use safe partial staging or stop for clarification.
   - After staging, inspect `git diff --cached --name-status` and `git diff --cached`; confirm that the index contains only the intended slice, then run `git diff --check` when applicable.
   - Commit with an imperative message that describes the behavior change.

4. Repeat for every slice.
   - Re-check status between slices.
   - If a later slice modifies a file already committed, commit only the new logical change.
   - Keep tests with the implementation they verify. Keep incidental cleanup out of feature commits unless it is required.

5. Perform final verification.
   - Run the broadest reasonable validation for the affected project area using the repository's actual commands.
   - Review `git diff --name-status <base>...HEAD`, `git log --oneline <base>..HEAD`, and `git status --short`; replace `<base>` with the resolved base ref.
   - Confirm that the branch contains only intended commits and changes, and that unrelated baseline files are neither staged nor included.
   - If rebasing, resolving conflicts, or otherwise changing committed content, rerun the relevant validation and diff checks.

6. Publish and open the PR only when explicitly requested.
   - Before publishing, confirm the branch, target base, remote, intended commit range, and authentication/permission path.
   - Push with an explicit upstream, such as `git push -u origin <branch>`. Never use `--force`; if the branch already exists remotely, verify ownership and ancestry before updating it.
   - Create the PR with the available GitHub interface or `gh pr create`, using the resolved base and head branches. If no GitHub capability or authentication is available, report the blocker and do not claim that a PR was created.
   - Verify the created PR's URL, head, base, commit range, and available check or mergeability status. Report pending, failed, or unavailable checks plainly; do not merge or make other lifecycle changes unless separately requested.
   - Leave unrelated local changes untouched and unstaged. Mention them in the handoff only when they affect the branch or PR risk.

## Commit Guidance

Use separate commits for:

- Independent user-visible features.
- Distinct bug fixes.
- Schema or data-contract changes that reviewers may need to inspect independently.
- Documentation updates that are not inseparable from code changes.

Combine changes when:

- A test change only verifies the implementation in the same slice.
- A refactor is required for the feature and has no useful standalone behavior.
- Splitting would leave an intermediate commit broken.

## PR Body Pattern

Use this Markdown structure for pull request bodies. Replace each angle-bracket placeholder with pull-request-specific content, and keep the pre-flight requirements unchanged:

```markdown
## Type of Change

   - <type of change>

## Description

   - <description of the change>

   - <validation summary, including checks that passed or were not run and why>

## Visual Proof (Required for UI changes)

   - <screenshots or recordings for UI changes; otherwise state that the change is non-UI>

## Pre-Flight Checklist

   - `<actual command>` - passed
   - `<actual command>` - passed
   - Not run: <check> - <reason>

```
