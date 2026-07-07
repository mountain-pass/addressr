---
status: 'proposed'
date: 2026-07-07
human-oversight: confirmed
oversight-date: 2026-07-07
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-10-07
---

# ADR 033: IAM/SigV4 auth for the AWS-managed OpenSearch domain

> Captured via /wr-architect:capture-adr, then authored with the design from the 2026-07-07 architect consult. Run /wr-architect:create-adr 033 to expand any remaining canonical sections.

## Context and Problem Statement

The ADR 029 Phase 1 re-attempt provisioned the v2 domain `addressr4` (OpenSearch 2.19, `t3.small.search` × 2, steady-state, **never resized**) and began the quiet populate. It failed 2026-07-07 by reproducing the exact catastrophe that forced the attempt-1 rollback, this time with the audit logs + CloudWatch trace attempt 1 lacked:

- **P035 fm2 — silent index deletion**: CloudWatch `SearchableDocuments` on `addressr4` went 6.9M (23:00) → 9.0M (00:00) → 10.0M (01:00) → **7 (02:00)** and stayed at 7. ~10M documents vanished with no operator action.
- **P036 — FGAC master-user clobber**: from 03:00:59Z the audit log recorded **184 `FAILED_LOGIN`** events, 154 for our master user `addressr4admin`. The credentials in GHA secrets, the TFC workspace, and 1Password were mutually consistent and all rejected by the cluster — the cluster's internal FGAC password diverged from every plane we control.
- **Cause event invisible even to FGAC audit logs**: only the failure symptoms were logged, no config-change / privilege / internalusers-write event. This confirms P036's attempt-1 conclusion — the internal-user password changes through an AWS-internal channel not surfaced by CloudTrail _or_ FGAC audit logging.

The cluster was GREEN and idle throughout (CPU ~7%, IndexingRate 0) — not a capacity failure, a lockout. The never-resize discipline (which removed 2 of 3 attempt-1 clobber triggers) did **not** prevent this, because it is P036's steady-state observation-#1 class.

The common factor across both symptoms is **Fine-Grained Access Control (FGAC) and its internal `.opendistro_security` index** — the internal-user password lives there, and it is the state an AWS-internal channel mutates. The question: how should the AWS-managed OpenSearch domain authenticate clients so there is no clobberable internal credential?

Constraint: self-hosted operators (JTBD-201) and local Docker dev run the loader/app against their own OpenSearch with **basic auth**; that path must keep working unchanged.

## Decision Drivers

- Remove the clobberable FGAC internal-user credential that reproduced P036 twice.
- Preserve zero-outage for v1 (this touches only the v2/future domains and the client auth code; v1 keeps serving on basic auth until cutover).
- Keep self-hosted / local-Docker basic auth working (JTBD-201, J6) — the change must be default-off.
- Reuse AWS-native identity we already have (the EB instance role; the operator's local IAM identity) rather than inventing new credential plumbing.
- Serve **J7** by removing a recurring release-integrity failure mode from the upgrade path.

## Considered Options

1. **Option A — FGAC retained, master identity is an IAM role (`master_user_arn`), no internal password.** Removes the internal _password_ but keeps `advanced_security_options` enabled and therefore keeps the `.opendistro_security` index.
2. **Option B — Disable FGAC entirely; scope the domain resource `access_policy` to specific IAM principals; clients authenticate with SigV4.** No internal user DB, no `.opendistro_security` index, nothing to clobber. (chosen)

## Decision Outcome

Chosen option: **Option B**.

- **A retains the clobbered artefact.** FGAC always maintains `.opendistro_security` — the exact internal state the AWS-internal channel mutates. A removes the password but not the subsystem, so it does not clearly close the P036 mechanism. B removes the subsystem entirely.
- **We use none of FGAC's value.** One index, one app, no per-index/per-role control. B loses nothing we exercise.
- **B forces the access-policy fix that matters.** Today `access_policies` is `Principal AWS = "*", Action es:*` — wide open, nominally backstopped by FGAC. Under B the access policy becomes the sole gate, scoped to exactly two principals: the **EB instance role** (app reads) and the **operator's local IAM identity** `arn:aws:iam::869772437473:user/tompahoward` (loader writes, run locally). That principal-scoping is a real security improvement independent of the clobber.

### Security posture (human-confirmed 2026-07-07)

The user's ratification concern was "random people connecting directly to the OpenSearch cluster". This design is **strictly tighter than the current v1 posture**, not looser:

- **Today** the endpoint is public and the _only_ gate is the shared FGAC password (which just clobbered); a leaked/guessed password = full access.
- **Under B** the endpoint stays public but every request must carry a live SigV4 signature from one of the two named IAM principals. Any unsigned request, or one from any other AWS account/identity, is rejected with `403 AccessDenied` at the AWS front door before reaching the cluster. No shared secret to leak; signatures cannot be replayed or guessed.

**Non-negotiable implementation invariant**: disabling FGAC MUST land together with replacing `Principal AWS = "*"` with the two scoped ARNs in the same change. `"*"` + FGAC-off would be genuinely open — the scoping is what makes B safe, not incidental.

**Network posture: IAM scoping only (VPC deferred).** The user chose IAM/SigV4 principal-scoping as sufficient and explicitly deferred VPC/private-endpoint hardening (2026-07-07). A future ADR may add `vpc_options` for defence-in-depth, but it is not required for this decision — the IAM scoping already closes "random people connecting".

**Honesty caveat (do not overclaim, per ADR 023 / ADR-026 grounding):** the catastrophe has two symptoms; this decision directly addresses only one. B removes the `.opendistro_security` auth clobber (P036). It is **NOT proven to fix the silent index deletion (P035 fm2)** — under FGAC-on that delete should have been blocked yet happened and was invisible to audit logs, consistent with an AWS-internal control-plane channel that access-policy scoping does not necessarily govern. The index-deletion symptom stays tracked on the P035/P036 lineage; destroy+recreate remains recovery.

### Audit logs are removed with FGAC; the P035 trip-wire is a doc-count alarm (human-confirmed 2026-07-07)

AWS couples `AUDIT_LOGS` log publishing to FGAC — `log_publishing_options { log_type = "AUDIT_LOGS" }` requires `advanced_security_options.enabled = true`. Disabling FGAC therefore **forces removing** the audit-log group + resource policy + publishing block added in Stage 0b (the ADR 030 audit-log-at-provisioning amendment). This reverses that amendment for FGAC-off domains and moots P036's open "enable audit logs" investigation task (no FGAC = no `.opendistro_security` = no clobber to trace).

The audit logs were the ADR-stated residual trace for the still-open P035 index-deletion symptom. **The user chose (2026-07-07) to accept losing them** and replace them with a **CloudWatch `SearchableDocuments`-drop alarm** — the metric that actually detected the 2026-07-07 wipe (10M → 7), where the audit logs did not capture the cause even under FGAC-on. So their P035 value was already near-zero; the metric alarm is the real detector. The alarm lives in `deploy/main.tf` (`aws_cloudwatch_metric_alarm.v2_searchable_documents_drop`), `treat_missing_data = "breaching"` so a wipe-to-zero trips it, threshold `var.v2_searchable_documents_floor`.

### Data load moves off GitHub Actions (loader-principal decision)

The full 9-state populate ran as GitHub Actions workflows (`populate-search-domain.yml` → `reusable-update.yml`), each state leg up to 6h — burning too much GHA quota (user directive 2026-07-07). The load **moves to the local operator machine** (`babel-node loader.js` against the domain endpoint), which SigV4-signs as the operator's IAM identity. This both eliminates the GHA quota cost **and** makes the loader principal a simple local IAM identity in the access policy instead of a GitHub OIDC role — no GitHub in the data path. The GHA populate workflow is retired for v2. (v1's small quarterly `update-*.yml` deltas are out of scope here; revisit if quota pressure persists.)

### Auth-mode selection (backward compatible)

Client construction gains a conditional branch gated by an env flag, defaulting to basic auth:

- `ELASTIC_AUTH_MODE` unset / `basic` → current `buildClientNode` basic-auth path (self-hosted, local Docker, v1 — unchanged).
- `ELASTIC_AUTH_MODE=sigv4` → construct via `AwsSigv4Signer` from `@opensearch-project/opensearch/aws` with `region`, `service: 'es'`, credentials from `@aws-sdk/credential-provider-node`'s `defaultProvider()` (cached; no per-request STS). No credentials embedded in the node URL.
- The read-shadow client (ADR 031) gets a parallel `ADDRESSR_SHADOW_AUTH_MODE` flag, same default-off shape.

New prod dependency: `@aws-sdk/credential-provider-node` (the signer itself is a subpath of the already-present `@opensearch-project/opensearch`).

### Where the code lives

| File                                                 | Role                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `client/elasticsearch.js` `esConnect`                | conditional SigV4 branch (load-bearing; app + loader client)                                                                         |
| `src/read-shadow.js`                                 | shadow-client SigV4 branch behind `ADDRESSR_SHADOW_AUTH_MODE`                                                                        |
| `deploy/modules/opensearch/main.tf` + `variables.tf` | `advanced_security_options { enabled = false }`, drop `master_user_*`, scope `access_policies` to the two IAM ARNs with `es:ESHttp*` |
| `deploy/main.tf`                                     | caller wiring; set `ELASTIC_AUTH_MODE=sigv4` in EB env for v2; grant EB instance role `es:ESHttp*` on the domain ARN                 |
| `package.json`                                       | `@aws-sdk/credential-provider-node` prod dep                                                                                         |

### Quantification (ADR 023 runtime-path discipline)

SigV4 adds per-request signing on the consumer-facing search path in prod:

- **Per-request delta**: ~0.1–0.5 ms CPU (HMAC-SHA256 over the canonical request; credentials cached by `defaultProvider`, no per-request STS) + ~300–500 bytes of extra headers (`Authorization`, `x-amz-date`, `x-amz-content-sha256`). Memory negligible.
- **Frequency**: no telemetry attached — worst-case 100 RPS; realistic 1–10 RPS (per ADR 031's assumption).
- **Aggregate**: at 100 RPS worst-case ~5% of one core (~2.5% of the t3.small 2-vCPU); ≤0.5% at realistic load. Egress ~50 KB/s worst-case — trivial.
- **Same order as the read-shadow overhead already approved 2026-04-29.** Re-verify ADR 031's primary-path invariant (≤1 ms p95 delta) with SigV4 on before relying on it.

## Consequences

### Good

- Removes the FGAC internal-user credential + `.opendistro_security` index that reproduced P036 twice — nothing internal to clobber.
- Access policy scoped from `"*"` to two named principals — real least-privilege improvement.
- No GitHub in the data path; GHA quota reclaimed.
- Self-hosted / local Docker / v1 unaffected (default-off basic auth).

### Neutral

- Adds one prod dependency (`@aws-sdk/credential-provider-node`).
- Loses FGAC per-index/per-role control we do not use.
- v2/v3 no longer have an internal master password, so ADR 030's distinct-creds + sync-tfc-vars password plumbing become moot for them (amended below).

### Bad

- Adds ~0.1–0.5 ms per-request SigV4 CPU on the consumer search path (quantified above; re-verify the ADR 031 invariant).
- **Does not fix the P035 index-deletion symptom** — tracked separately.
- Local-load makes the operator machine a required participant for the populate (laptop must stay awake for the run) — accepted per the quota directive; an EC2-in-region loader is a documented alternative if laptop-bound runs prove impractical.

## Confirmation

- `deploy/modules/opensearch/main.tf` has **no `advanced_security_options` block** (FGAC off; AWS defaults it disabled), no `master_user_*`, and `access_policies` scoped to the EB instance role ARN + `arn:aws:iam::869772437473:user/tompahoward` with `es:ESHttp*` — never `"*"`.
- `client/elasticsearch.js` selects SigV4 vs basic on `ELASTIC_AUTH_MODE`, default basic; unit-tested both branches (TDD).
- A local `babel-node loader.js` run with `ELASTIC_AUTH_MODE=sigv4` authenticates against the recreated `addressr4` and indexes documents (SigV4 as the operator identity).
- Cucumber `test:nogeo` stays green with `ELASTIC_AUTH_MODE` unset (basic-auth default preserved).
- ADR 031 primary-path ≤1 ms p95 invariant re-verified with SigV4 on before cutover.
- Broken `addressr4` destroyed and recreated under the new security-options + scoped policy (toggling FGAC is the AWS-side reconfiguration class 2 of 3 P036 clobbers followed — recreate, do not reconfigure in place, per ADR 030).

## Amends

- **ADR 030** — module `advanced_security_options` shape (now removed → `enabled = false` for v2/v3); the distinct-credentials-per-parallel-domain and 1P→GHA→sync-tfc-vars→TFC credential-wiring consequences become moot for domains with no internal master password. The **audit-log-publishing consequence (2026-07-06) is retired for FGAC-off domains** — AUDIT_LOGS requires FGAC (see the audit-log subsection above); the never-resize note stays valid.
- **ADR 031** — shadow-client gains a SigV4 branch + `ADDRESSR_SHADOW_AUTH_MODE` flag; Configuration and "Where the code lives" sections extend. Primary-path invariant and soak gate unaffected (re-verify with SigV4 on).

## Reassessment Criteria

- If P035-class index deletion recurs on `addressr4` after this change → the auth model was not the deletion vector; escalate the P035 investigation (AWS support with the audit/CloudWatch evidence).
- If SigV4 breaks the ADR 031 ≤1 ms primary-path invariant → gate off and investigate.
- Phase 2 (2.x → 3.x) reuses this auth model; confirm it still holds.
- Before 2026-10-07, or on any of the above.

## Related

- **ADR 029** — the Phase 1 re-attempt whose failure forced this decision.
- **ADR 030** — OpenSearch Terraform module (amended).
- **ADR 031** — read-shadow (amended).
- **ADR 023** — runtime-path performance review (Quantification section).
- **ADR 024** — proxy auth (precedent: default-off, fail-loud-on-partial).
- **P035 / P036** — the silent-index-deletion + FGAC-clobber lineage; P036 is un-parked and carries the 2026-07-07 forensics.
