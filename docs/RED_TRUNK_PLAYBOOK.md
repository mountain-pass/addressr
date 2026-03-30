# Red Trunk Playbook (TBD)

Use this when your push is blocked and trunk (`master`) must be fixed first.

Goal:
- do not lose your work
- restore green trunk fast
- then continue feature delivery

Model note:
- `master` is not a deployment trust boundary in this repo.
- During red trunk, priority is restoring CI/control evidence so unsafe changes cannot be promoted.

## Steps

1. Park your current work locally (do not push this branch):

```sh
git switch -c park/<short-name>
```

2. Return to clean trunk state:

```sh
git switch main
git fetch origin
git pull --ff-only origin master
```

3. Fix only the breakage causing red trunk directly on `master`.
   Recovery edits may be anywhere in the repo when that is where the root cause lives.
   Keep scope minimal to the diagnosed failure.

4. Commit and push a recovery fix:

```sh
git add .
git commit -m "pipeline: <short cause>"
git push
```
   Recovery uses forward commits only. Do not wait on amend/rewrite permissions.

5. Bring back your parked work:

```sh
git switch park/<short-name>
git rebase main
```

6. Continue delivery:
- either cherry-pick to `master` in small chunks, or
- switch to `master` and apply the next small change directly.

## Rules

- When trunk is broken, push only recovery fixes until green (root-cause fix can be in any path).
- Keep parked branches local and short-lived.
- Prefer small commits so recovery/rebase is easy.
- If production is impacted and pipeline path cannot recover fast enough, follow `docs/BREAK_GLASS_RUNBOOK.md` and reconcile same day.
