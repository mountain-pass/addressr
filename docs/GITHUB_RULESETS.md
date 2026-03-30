# GitHub Rulesets (TBD-Friendly)

Applied to `mountain-pass/addressr`.

## Zero-Trust Trunk Policy
- `master` is intentionally treated as an untrusted integration branch for flow.
- Unsafe code may land on `master`; that is not the safety boundary in this repo.
- Safety boundary is release/prod promotion via release workflow required checks.

## Active rulesets

TBD — rulesets to be configured for this repository.

Recommended baseline:

1. `master-tbd-guardrails`
- Target: `~DEFAULT_BRANCH` (`master`)
- Enforcement: `active`
- Rules:
  - block deletion
  - block non-fast-forward updates
- Why:
  - keeps direct-push TBD flow while preventing destructive history rewrites
  - zero-trust model relies on promotion controls, not `master` admission checks, to prevent unsafe deployment

## Verification commands

```bash
gh ruleset list --repo mountain-pass/addressr
gh ruleset check master --repo mountain-pass/addressr
```

## Notes

- Release quality gates remain in CI workflows (`.github/workflows/release.yml`).
