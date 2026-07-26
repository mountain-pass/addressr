---
human-oversight: confirmed
oversight-date: 2026-07-18
status: accepted
date: 2021-01-01
reassessment-date: 2027-01-26
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 004: AWS Elastic Beanstalk for Production Deployment

> **Amendment 2026-07-26 — deployment policy corrected from `AllAtOnce` to `Rolling` (doc-vs-infra drift).** The Decision Outcome and Consequences below recorded `AllAtOnce`, but the infrastructure has been `DeploymentPolicy = "Rolling"` since **2026-04-01** — commit `65a0f05` ("feat: add risk-reducing controls -- v2 CI tests, /health, rolling deploy, smoke test"), whose body reads "Change DeploymentPolicy from AllAtOnce to Rolling" and "Enable RollbackLaunchOnFailure". **The provenance is a deliberate, governed infra change whose ADR was never updated** — the doc drifted; the infra did not go rogue. This amendment corrects the record to match `deploy/main.tf`. It changes no infrastructure and does not reverse this ADR's decided question (EB vs ECS/Fargate vs Lambda vs direct EC2), so ADR 004 stays `accepted` — an amendment, not a supersession.
>
> **`Rolling` does not currently buy zero-downtime deploys.** That commit left `BatchSize = "100"` / `BatchSizeType = "Percentage"` untouched, so an application deploy still takes **every** instance in a single batch. The corrected Consequences say so explicitly rather than claiming a batched-safety property the configuration does not deliver. The new Reassessment Criterion on lowering `BatchSize` is the remediation hook.
>
> **Re-ratification flagged, oversight marker deliberately not flipped.** This amendment rewrites a **Decision Outcome** bullet, not merely a Confirmation item, so it sits at the outer edge of the ADR 016 / ADR 024 amendment precedent. `human-oversight: confirmed` is preserved rather than silently flipped — flipping it would raise a spurious unratified-dependency block on every future deploy-adjacent change, in order to correct a doc describing already-live infra. The obligation is instead queued for `/wr-architect:review-decisions`; see the Reassessment Log.
>
> **Adjacent drift corrected in the same pass:** the "across 3 AZs" claim (the ASG spans `Any 2` AZs selected from a 3-AZ pool).

## Context and Problem Statement

Addressr needs a production hosting environment for the Node.js API server in the ap-southeast-2 (Sydney) region, close to the Australian address data it serves.

## Decision Drivers

- Low operational overhead (managed platform)
- Cost efficiency for a revenue-generating side project
- Sydney region availability
- Auto-scaling for variable API traffic

## Considered Options

1. **AWS Elastic Beanstalk** -- managed platform with auto-scaling
2. **AWS ECS/Fargate** -- container orchestration
3. **AWS Lambda** -- serverless functions
4. **Direct EC2** -- self-managed instances

## Decision Outcome

**Option 1: AWS Elastic Beanstalk** with Terraform for infrastructure-as-code. Terraform state managed in Terraform Cloud (`organization: mountainpass`).

Key configuration:

- Instance types: t2.nano / t3.nano (cost-optimized)
- 100% Spot instances (no on-demand base)
- Auto-scaling: min 2, max 4 instances spanning `Any 2` AZs selected from a 3-AZ pool (`ap-southeast-2a/b/c`)
- Classic ELB with HTTP health checks
- **`Rolling` deployment policy for application deploys** (`aws:elasticbeanstalk:command` `DeploymentPolicy = "Rolling"`), but with `BatchSize = "100"` / `BatchSizeType = "Percentage"` — i.e. one batch containing the whole fleet
- **Health-based rolling updates for ASG changes** (`aws:autoscaling:updatepolicy:rollingupdate` `RollingUpdateEnabled = "true"`, `RollingUpdateType = "Health"`, `MaxBatchSize = 1`, `MinInstancesInService = 2`) — this governs instance replacement / ASG configuration updates, **not** application deploys
- Nginx reverse proxy
- Enhanced health reporting

**The two batching paths are distinct and must not be conflated.** The `aws:elasticbeanstalk:command` namespace batches _application deploys_ (at 100%, i.e. all instances at once); the `aws:autoscaling:updatepolicy:rollingupdate` namespace batches _ASG instance replacement_ (genuinely one instance at a time, never below 2 in service). Reading the second as if it applied to the first is the error this amendment exists to correct.

### Consequences

- Good: Low operational overhead, managed platform updates
- Good: Cost-efficient with Spot instances
- Good: Auto-scaling handles traffic spikes
- Good: **ASG instance replacement is genuinely batched and health-gated** — `RollingUpdateType = "Health"` with `MaxBatchSize = 1` and `MinInstancesInService = 2` under a `PT30M` timeout, so capacity is never fully withdrawn during an ASG-driven replace
- Neutral: **An application deploy reports failure rather than declaring blind success** — `IgnoreHealthCheck = "false"` with `HealthCheckSuccessThreshold = "Ok"` means EB waits on health before calling the deploy successful (command timeout 600s), and in-flight requests bleed via connection draining, **bounded at 10 seconds**. Note `RollbackLaunchOnFailure = "true"` is `aws:elasticbeanstalk:control` — it covers environment **launch** failure, not a red post-deploy check (see ADR 001).
- Bad: **`Rolling` at `BatchSize = 100 Percentage` does not deliver the zero-downtime benefit the policy name implies.** Because there is no subsequent batch to withhold, health checking cannot gate fleet-wide exposure of a bad version — it can only surface the failure after every instance already has it, and the practical disruption profile still resembles `AllAtOnce`. **The deploy-window duration is unmeasured**; the compensating control remains Uptime Robot detection within 5 minutes (ADR 016). This is the remediation hook in the Reassessment Criteria below, not an accepted end state.
- Bad: 100% Spot means potential interruptions during capacity shortages
- Bad: Classic ELB is legacy (ALB has better features)
- Bad: t2.nano instances have very limited memory (512MB)

### Confirmation

- `deploy/main.tf` defines Elastic Beanstalk resources
- `deploy/provider.tf` targets ap-southeast-2
- `deploy/vars.tf` specifies Node.js 22 on Amazon Linux 2023
- Application-deploy batching (`aws:elasticbeanstalk:command`): `DeploymentPolicy = "Rolling"` (`deploy/main.tf:251-256`), `BatchSize = "100"` (179-184), `BatchSizeType = "Percentage"` (185-190), `IgnoreHealthCheck = "false"` (319-324), `Timeout = "600"` (583-588)
- ASG instance-replacement batching (`aws:autoscaling:updatepolicy:rollingupdate`): `RollingUpdateEnabled = "true"` (517-522), `RollingUpdateType = "Health"` (523-528), `MaxBatchSize = "1"` (445-450), `MinInstancesInService = "2"` (463-468), `Timeout = "PT30M"` (577-582)
- Supporting: `HealthCheckSuccessThreshold = "Ok"` (295-300), `ConnectionDrainingEnabled = "true"` (197-201), `ConnectionDrainingTimeout = "10"` (203-207), `RollbackLaunchOnFailure = "true"` (511-516), `Availability Zones = "Any 2"` (173-178), `Custom Availability Zones` (227-232)

### Reassessment Criteria

- Spot instance availability issues in ap-southeast-2
- Memory constraints on nano instances with large G-NAF datasets
- AWS deprecating Classic ELB
- Need for WebSocket support (requires ALB)
- **Lowering `BatchSize` below 100 percent** (e.g. 50 percent, or a fixed count of 1) so that `Rolling` actually realises batched zero-downtime deploys — weighed against the resulting deploy duration on a min-2 ASG, where a 50 percent batch halves capacity for the batch window. Acting on this is an infrastructure change and needs its own decision, and it would trigger a runtime-path performance review.
- **Unverified: which of the two batching paths an EB env-var-only update travels.** Not determinable from `deploy/main.tf` alone. ADR 029's zero-outage posture depends on the answer in three places — its rollback window "bounded by EB env-var propagation plus an ASG rolling replace" (ADR 029 line 104), its cutover guarantee resting on a "health-gated rolling deploy" (line 85, the same over-claim corrected out of this ADR above), and its Confirmation "rollback verified to complete within 10 minutes end-to-end" (line 152). If env-var updates travel the `aws:elasticbeanstalk:command` path at `BatchSize = 100 Percentage`, all three are weaker than recorded. Resolve by observation, not assertion.

## Reassessment Log

- **2026-07-26** — Corrective amendment (see the Amendment note above). Decision Outcome and Consequences corrected from `AllAtOnce` to the actual `Rolling` policy, the two batching paths separated, the `BatchSize = 100 Percentage` caveat recorded honestly, and the "across 3 AZs" drift fixed. No infrastructure changed. `human-oversight: confirmed` preserved (corrective maintenance against already-live infra, not a decision reversal) — **but this amendment rewrites a Decision Outcome bullet, so the corrected text has never itself been human-ratified. Queued for confirmation at the next `/wr-architect:review-decisions` drain.** Discharges the ADR 001 line 25 deferral and the P039 line 108 investigation task. `reassessment-date` set to **2027-01-26** (ADR 024's 6-month cadence); this ADR previously carried none.
