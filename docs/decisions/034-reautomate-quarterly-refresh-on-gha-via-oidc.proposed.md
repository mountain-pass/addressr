---
status: 'proposed'
date: 2026-07-11
human-oversight: confirmed
oversight-date: 2026-07-11
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-10-11
---

# ADR 034: Re-automate the quarterly G-NAF refresh on GitHub Actions via an OIDC-scoped IAM role

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032 P156 amendment). Run /wr-architect:create-adr on this ID to expand the deferred sections canonically. **Amends ADR 033.**

## Context and Problem Statement

Post-cutover (ADR 029 Stage 5, 2026-07-10) production reads v2 (`addressr4`, OpenSearch 2.19, IAM/SigV4). But the 9 quarterly `update-{state}.yml` cron workflows still write **v1** (`addressr3`) via basic auth — so v2's data is frozen, and `reusable-update.yml`'s `target=v2` path is basic-auth (broken post-ADR-033, which turned FGAC off and made v2 SigV4-only). Decommissioning v1 (user-directed 2026-07-11) forces the quarterly per-state deltas onto SigV4-only v2. This is ADR 033's "revisit if quota pressure persists" trigger — but the trigger is the **v1 decommission**, not quota (the initial bulk load stays local; only the small quarterly deltas re-automate on GHA). GitHub Actions has no identity that can write to v2 today (v2's access policy allows only the EB instance role + the local operator identity).

## Decision Drivers

- v2 must have an automated data-freshness path before v1 is decommissioned (else G-NAF refresh silently stops)
- Least privilege on a Level-5 asset (OpenSearch data loss is Severe per RISK-POLICY) — the loader must NOT get the infra-powerful deploy identity
- Avoid a persistent standing credential to the prod index where feasible
- (further drivers deferred to /wr-architect:create-adr canonical review)

## Considered Options

1. **Option A (chosen)** — GitHub OIDC → dedicated IAM role scoped to the v2 ARN only, data-plane read/write **without index delete** (`es:ESHttpGet`/`Put`/`Post`/`Head`, no `ESHttpDelete`); short-lived per-run STS credentials, no long-lived keys.
2. **Option B (rejected)** — dedicated scoped IAM user with long-lived access keys in GHA secrets: consistent with the existing access-key pattern, less setup, but a persistent standing credential to a Level-5 asset that must be rotated and can leak.
3. **Option C (rejected)** — reuse the existing `TF_VAR_aws_access_key` deploy identity: simplest, but massively over-privileged (EB + domain-destroy + Cloudflare), directly contradicts ADR 033's least-privilege scoping.

## Decision Outcome

Chosen option: **Option A** — run the quarterly `reusable-update` loader on GitHub Actions against v2 over SigV4, authenticating via GitHub OIDC assuming a dedicated IAM role scoped to least-privilege data-plane actions (`es:ESHttpGet`/`Put`/`Post`/`Head`, no `ESHttpDelete`) on the v2 domain ARN only. **Amends ADR 033**: partially reverses its "no GitHub in the data path" property for the delta path only (initial bulk load stays local), and adds a third principal (the GHA OIDC role) to the v2 access policy. **Security requirements (must all hold before the crons flip):** least-privilege data-plane actions only on the v2 ARN — `es:ESHttpGet`/`Put`/`Post`/`Head`, **no `es:ESHttpDelete`** (dropped 2026-07-11 ratification tightening: delta upserts never index-delete, and `ESHttpDelete` is the `DELETE /<index>` shape behind the 2026-07-07 P035 wipe) and no `es:Delete*`/config actions or other services; the OIDC trust `sub` is scoped to `repo:mountain-pass/addressr:ref:refs/heads/master` (2026-07-11 ratification tightening: only master-ref workflows — the scheduled crons + the canary `workflow_dispatch` — may assume the role, not any branch/PR); raise the `SearchableDocuments`-drop alarm floor 1M → ~15M so a bad delta load trips the alarm; the loader performs idempotent per-state delta upserts (not a destructive full rebuild); a single-state canary via `workflow_dispatch` (alarm armed, doc counts + a sample search checked) precedes flipping the crons; a `concurrency` guard prevents a cron overlapping **itself for the same state** (per-state group, `cancel-in-progress: false`). Cross-state concurrent loads on the shared index are **ACCEPTED** (2026-07-11 user decision — the 9 crons stay independent per-state schedules so a single state's failure retries in isolation without redoing all states, the stronger operational property; staggered schedules + `m6g.large.search` × 2 headroom bound the concurrent-ingest pressure; sibling states write disjoint document sets via idempotent upserts and the loader role has no `ESHttpDelete`, so concurrent writes cannot clobber the index, with the 15M `SearchableDocuments`-drop alarm as backstop). Deploy-overlap is not separately guarded: routine app deploys do not reconfigure the domain ([ADR 030](030-opensearch-domain-terraform-module.accepted.md) never-resize), and a rare domain-config change is operator-sequenced. **The working + verified v2 write path GATES the v1 decommission.**

## Consequences

### Good

- (deferred to /wr-architect:create-adr canonical review)

### Neutral

- (deferred to /wr-architect:create-adr canonical review)

### Bad

- Reintroduces GitHub into the (delta) data path — the exact property ADR 033 removed; accepted for the small quarterly deltas, mitigated by OIDC short-lived creds + least-privilege scoping.

## Confirmation

> **Amended 2026-08-03.** This section was a stub (`deferred to /wr-architect:create-adr canonical review`), which is why nothing scoped what the loader contract should assert. Filled here with the checkable subset of the Decision Outcome above.
>
> **Generation note.** The Context and Option A text below name **v2** (`addressr4`) and `target=v2`, because that was the generation in flight when this ADR was written. The decision — a least-privilege per-generation OIDC role, re-scoped at each migration rather than one widened role — is unchanged and has been re-applied twice since: `gha-v3-loader` for the 2.19→3.5 move, then `gha-v4-loader` for the ADR-041 analyzer migration. `addressr4` was decommissioned 2026-07-14 and `addressr5` on 2026-08-02, so the ARNs named below are historical. Read the generation as an example, not as current state; `deploy/oidc.tf` is authoritative for which role exists now.

- The nine `update-{state}.yml` crons and `populate-search-domain.yml` call `reusable-update.yml`, and every caller passes only secrets the callee declares in `workflow_call.secrets`. A mismatch fails the run, and only when a quarterly cron fires — so this is asserted in test, not left to review. Pinned in `test/js/__tests__/loader-workflow.test.mjs`.
- Every calling job grants `permissions: id-token: write`. A reusable workflow's own `id-token` permission is capped by the caller's token, so the callee cannot grant it to itself; without it the role assumption fails on the cron path, which the direct-dispatch canary does not exercise. Same test.
- The target resolver fails closed: an unrecognised target emits `::error::Unsupported target` and exits non-zero rather than falling through. Asserted in the positive form, because a bare absence check passes identically whether a decommissioned arm was removed or the whole resolve step was deleted. Same test.
- Every declared `target` default resolves to an arm that exists, across all three declaration sites (`workflow_call.inputs`, `workflow_dispatch.inputs`, and `populate-search-domain.yml`'s own input), and every option offered in `populate-search-domain.yml`'s dispatch dropdown resolves to an arm. A dropdown offering a decommissioned target is worse than dead code: it invites an operator to select it during exactly the recovery scenario where they would believe it. Same test.
- `populate-search-domain.yml` uses `secrets: inherit` deliberately, and that is pinned — `inherit` has no per-secret list, so the contract assertion above passes vacuously for it unless the `inherit` itself is asserted.

## Pros and Cons of the Options

### Option A

- (deferred to /wr-architect:create-adr canonical review)

## Reassessment Criteria

(deferred to /wr-architect:create-adr canonical review — default reassessment-date 3 months from capture)
