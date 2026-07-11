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

Chosen option: **Option A** — run the quarterly `reusable-update` loader on GitHub Actions against v2 over SigV4, authenticating via GitHub OIDC assuming a dedicated IAM role scoped to least-privilege data-plane actions (`es:ESHttpGet`/`Put`/`Post`/`Head`, no `ESHttpDelete`) on the v2 domain ARN only. **Amends ADR 033**: partially reverses its "no GitHub in the data path" property for the delta path only (initial bulk load stays local), and adds a third principal (the GHA OIDC role) to the v2 access policy. **Security requirements (must all hold before the crons flip):** least-privilege data-plane actions only on the v2 ARN — `es:ESHttpGet`/`Put`/`Post`/`Head`, **no `es:ESHttpDelete`** (dropped 2026-07-11 ratification tightening: delta upserts never index-delete, and `ESHttpDelete` is the `DELETE /<index>` shape behind the 2026-07-07 P035 wipe) and no `es:Delete*`/config actions or other services; the OIDC trust `sub` is scoped to `repo:mountain-pass/addressr:ref:refs/heads/master` (2026-07-11 ratification tightening: only master-ref workflows — the scheduled crons + the canary `workflow_dispatch` — may assume the role, not any branch/PR); raise the `SearchableDocuments`-drop alarm floor 1M → ~15M so a bad delta load trips the alarm; the loader performs idempotent per-state delta upserts (not a destructive full rebuild); a single-state canary via `workflow_dispatch` (alarm armed, doc counts + a sample search checked) precedes flipping the crons; a `concurrency` guard prevents a cron overlapping a deploy or a sibling state's write to the same index. **The working + verified v2 write path GATES the v1 decommission.**

## Consequences

### Good

- (deferred to /wr-architect:create-adr canonical review)

### Neutral

- (deferred to /wr-architect:create-adr canonical review)

### Bad

- Reintroduces GitHub into the (delta) data path — the exact property ADR 033 removed; accepted for the small quarterly deltas, mitigated by OIDC short-lived creds + least-privilege scoping.

## Confirmation

(deferred to /wr-architect:create-adr canonical review)

## Pros and Cons of the Options

### Option A

- (deferred to /wr-architect:create-adr canonical review)

## Reassessment Criteria

(deferred to /wr-architect:create-adr canonical review — default reassessment-date 3 months from capture)
