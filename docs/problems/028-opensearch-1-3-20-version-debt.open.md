# Problem 028: OpenSearch 1.3.20 version debt — increasing exposure to bugs, EOL and compatibility drift

**Status**: Open
**Reported**: 2026-04-21
**Priority**: 12 (High) — Impact: Moderate (3) x Likelihood: Likely (4)

## Description

addressr runs `opensearchproject/opensearch:1.3.20` in production and pins the Node.js client at `@opensearch-project/opensearch@^3.5.1`. OpenSearch 1.3 is the final release of the 1.x major line and is past its support horizon; 2.x is the current stable major (2.19+ as of Q1 2026) and 3.x is also available upstream. Staying on 1.3.20 is accumulating a set of negatives that are independent of any single defect.

This problem captures the **version debt itself**, not any individual bug caused by it. Specific bugs that the debt is suspected to cause or perpetuate are tracked separately (e.g., [P027](./027-synonym-expansion-bypasses-auto-fuzziness.open.md) — synonym-expansion fuzziness interaction in `match_bool_prefix`). The cost of P028 is the ongoing risk exposure across all the following axes simultaneously, and the stranded improvement value in newer releases.

### What we're missing and exposed to

| Axis                               | Impact of staying on 1.3.20                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Security patches**               | OpenSearch 1.3.x receives only limited security backports; CVEs patched in 2.x/3.x land on 1.x on a best-effort basis at most. Each month on 1.3.20 widens the window where a newly-disclosed CVE may be unpatched on our instance.                                                                                                                    |
| **Bug fixes in search behaviour**  | 2.x has accumulated query-builder fixes and query-planner improvements. P027's `match_bool_prefix` + synonym + fuzziness interaction is one candidate. Other latent bugs we haven't noticed yet are likely waiting.                                                                                                                                    |
| **New query DSL features**         | `combined_fields`, improved `runtime fields`, the new `knn` / vector search stack, `point_in_time` search, and other 2.x-era features are unavailable. Some of these would be direct improvements for our ranking work (ADR 025 / ADR 026 / ADR 027 / ADR 028) or enable new product features (semantic address search) that we cannot currently ship. |
| **Performance**                    | OpenSearch 2.x has repeatedly improved indexing throughput, aggregation performance, and memory/heap behaviour. Our loader (full AU G-NAF) pays the 1.3.20 runtime cost every deploy.                                                                                                                                                                  |
| **Client-library support horizon** | `@opensearch-project/opensearch@^3.5.1` advertises compatibility with both 1.x and 2.x today, but 1.x compatibility will be dropped in a future client major. When that happens we would be forced into either a rushed upgrade or pinning an old client version — both bad.                                                                           |
| **AWS support**                    | AWS-managed OpenSearch retires older versions. An EB-hosted 1.3.20 domain today can be migrated to 2.x via the upgrade path; running beyond the vendor's retirement window converts a planned migration into a forced one.                                                                                                                             |
| **Feature-work drag**              | Every new feature we design pays a tax of "but check it works on 1.3 first". ADR 021 (Retain OpenSearch with future multi-backend support) explicitly flags 1.3.x EOL as a reassessment trigger for the backend-abstraction direction.                                                                                                                 |
| **Team knowledge drift**           | Stack Overflow, OpenSearch/Elasticsearch upstream docs, and third-party tutorials increasingly assume 2.x or later. Onboarding and debugging get harder as time passes.                                                                                                                                                                                |

Reported during the v2.4.0 post-deploy investigation (2026-04-21). Note that the trigger for filing this problem is **independent** of P027 — the upgrade case stands on its own even if P027 turns out to be fixable without an upgrade.

## Symptoms

- Security advisories published for 2.x/3.x require manual investigation to determine whether 1.3.x is affected and whether a backport exists.
- Bug workarounds accumulate in our code rather than being absorbed by newer upstream behaviour (example: the custom `whitecomma` tokeniser + `AUTO:5,8` fuzziness tuning in ADR 027 would interact more predictably with a query builder that has fewer known quirks — 1.x is slow to receive those fixes).
- Design reviews stall on "what would 2.x make possible here?" when weighing new features (e.g., semantic or vector search).
- `@opensearch-project/opensearch` changelog increasingly emphasises 2.x / 3.x compatibility; 1.x-specific code paths are frozen.

## Workaround

**Stay on 1.3.20 and accept the accumulating risk** — current posture. Monitor:

- AWS EB OpenSearch retirement announcements for 1.x.
- OpenSearch project security advisories.
- `@opensearch-project/opensearch` release notes for 1.x deprecation signals.

This is not a long-term workaround — it is an acknowledgement that we are on borrowed time.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer persona (J7 — Ship releases reliably from trunk) directly — the version debt distorts every design and testing decision. Indirectly, all end-user personas (Web/App Developer, AI Assistant User, Data Quality Analyst, Self-Hosted Operator) via latent bugs that accumulate until a forced upgrade.
- **Frequency**: Continuous — the debt compounds every week. The moment it matters acutely will be one of: a security CVE with no 1.3 backport, a vendor retirement deadline, a client-library drop, or a bug (like P027) that has a clean fix only in 2.x/3.x.
- **Severity**: Moderate today, Significant or Severe once a trigger fires. Today this manifests as release-pipeline and design-drag effects (Impact 3) rather than user-visible failures. Likelihood is Likely (4) because at least one trigger is already in view (P027 as a candidate, AWS retirement schedule ticking).
- **Analytics**: N/A — this is a deliberate programmatic assessment, not a data-driven one.

## Root Cause Analysis

### Why we're on 1.3.20

The repository history shows 1.3.x was pinned when the project first stabilised. No explicit decision record blocks upgrading; ADR 021 (Retain OpenSearch, plan multi-backend) frames OpenSearch as the accepted engine and flags 1.3.x EOL as a **reassessment trigger** rather than a hard commit to 1.x. No ADR proposes an upgrade schedule.

### Why the upgrade keeps getting deferred

- It requires ops work (AWS EB domain upgrade or migration, Terraform module updates, snapshot/restore or reindex).
- It requires testing work (full Cucumber suite against 2.x, G-NAF loader validation, search-behaviour regression run against the 14-query baseline + extensions).
- It has been easier to ship feature work on 1.3 than to pause and upgrade.
- Each deferral looks cheap in isolation; cumulative cost is what this ticket captures.

### Investigation Tasks

- [ ] Confirm OpenSearch 1.3.x official EOL / retirement date and the AWS EB retirement schedule. Record in this ticket.
- [ ] Audit open CVEs against OpenSearch 1.3.x that are patched in 2.x/3.x. Publish the list in this ticket.
- [ ] Scope the upgrade path: direct 1.3 → 2.x upgrade via snapshot/restore on AWS EB vs blue/green cluster swap vs reindex from G-NAF source. Document the migration plan options.
- [ ] Spin up `opensearchproject/opensearch:2.19` locally (shared with P027 investigation). Run the Cucumber suite and the 14-query baseline against it. Note any behavioural deltas.
- [ ] Enumerate OpenSearch 2.x features that would unlock addressr product value (vector / knn, point_in_time, improved aggregations, bulk indexing ergonomics). Quantify the value where possible.
- [ ] Check `@opensearch-project/opensearch` client's stated 1.x deprecation timeline.
- [ ] Create an INVEST story / ADR for the upgrade once the plan options are scoped. Supersede or amend ADR 021's "retain 1.x" posture.
- [ ] Create a reproduction test that catches regressions during the upgrade — baseline the Cucumber + unit suite on 1.3.20, diff against 2.x locally.

## Related

- [ADR 021 — Retain OpenSearch, plan multi-backend](../decisions/021-retain-opensearch-plan-multi-backend.proposed.md) — flagged 1.3.x EOL as a reassessment trigger. P028 is the operational capture of that trigger being active.
- [ADR 002 — OpenSearch as search engine](../decisions/002-opensearch-as-search-engine.accepted.md) — version-agnostic; OpenSearch remains the engine. An upgrade does not contradict ADR 002.
- [Problem P027 — Synonym expansion bypasses AUTO:5,8 fuzziness](./027-synonym-expansion-bypasses-auto-fuzziness.open.md) — candidate bug whose fix may be an upgrade. Related but independent of P028.
- [Problem P025 — GitHub Actions Node.js 20 deprecation](./025-github-actions-node20-deprecation.open.md) — adjacent version-debt ticket on a different axis (CI runtime). Similar pattern: managed-platform deprecation schedule forces our hand.
- [`package.json`](../../package.json) — `SEARCH_IMAGE: "opensearchproject/opensearch:1.3.20"` and `@opensearch-project/opensearch: ^3.5.1`.
- [`client/elasticsearch.js`](../../client/elasticsearch.js) — addressr's connection + index mapping code; will need review under 2.x for any DSL or mapping changes.
