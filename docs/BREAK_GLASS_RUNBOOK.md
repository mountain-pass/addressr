# Break-Glass Runbook

Referenced by [RED_TRUNK_PLAYBOOK.md](RED_TRUNK_PLAYBOOK.md). It was referenced
there before it existed; this is the file.

## There is no glass to break. Read this before looking for a lever.

**This runbook contains no mutation steps, deliberately.** Manual, out-of-band
production mutation — AWS CLI, EB console, Cloudflare route changes — is **not
sanctioned**. Recovery is the pipeline, always. User decision, 2026-08-18.

So this document does one job: **help you work out what is actually broken, fast
and correctly**, so the fix you push through the pipeline is the right one the
first time. Diagnosis is where the minutes are usually lost anyway.

Why refusal rather than a fast manual path:

- Terraform reconciles the whole root module, so any hand change to a declared
  setting is reverted — not on some future schedule, but on **the next release of
  any kind**. The deploy gate's first disjunct is
  `steps.changesets.outputs.published == 'true'`, so an unrelated npm patch
  merged by someone who has no idea you touched production is enough. That can be
  minutes.
- A hand change to an **undeclared** setting is worse: nothing in this repo
  establishes that Terraform removes it, so the likely outcome is permanent drift
  that no `terraform plan` ever shows.
- A manual path whose "exceptional use" nobody counts is unfalsifiable. This repo
  already rejected that shape once — ADR-045's bypass trailer was held
  unfalsifiable until JTBD-400 named a counter, an occasion and a place to record
  it.

### DO NOT run `terraform apply` from your machine

It is not impossible. It is prohibited, and this is the reason.

`apps/addressr-deployment/deploy.sh` is what `npm run deploy:prod` invokes, and
it is the same script CI runs — the script's own comments discuss the
operator-machine case in the present tense. Six variables must be **supplied by
hand** (`aws_access_key`, `aws_secret_key`, and the four `cloudflare_*`), all
obtainable from 1Password. A seventh, `elasticapp_version`, is equally required
by the module — no default, `nullable = false` — but `deploy.sh` writes it from
`resolve-version.sh`, so the operator never sees it. So an operator can do this.

**The trap:** `proxy_auth_header` and `proxy_auth_value` are **not** among them.
Both carry `default = ""` in `vars.tf`, and `main.tf`'s precondition is
`(header == "") == (value == "")` — **both-empty passes**. The two `dynamic
"setting"` blocks emit nothing when the vars are empty.

So an apply run without those two exported — exactly what someone who grabbed the
six required vars would do — produces a **green plan that strips
`ADDRESSR_PROXY_AUTH_HEADER` and `ADDRESSR_PROXY_AUTH_VALUE` from the production
environment**, reopening the upstream bypass
[ADR-024](decisions/024-origin-gateway-auth-header-enforcement.accepted.md)
exists to close, with no error anywhere. `backend.addressr.io` is publicly
addressable. The result is the origin serving everyone with no key validation and
no revenue accounting.

There is also no toolchain guarantee: CI applies inside a devcontainer, your
laptop uses whatever `terraform` and providers it happens to have.

## Step 1 — Find the failing layer. Do not guess.

There are **three** independently-failing layers, and they are easy to confuse:

```
client → api.addressr.io (Cloudflare Worker, ADR-018 default-deny)
       → RapidAPI gateway
       → backend.addressr.io (origin/ELB, ADR-024 header enforcement)
```

**A direct origin probe returning 401 is HEALTHY.** `release.yml` asserts exactly
that as the good state. If you curl the origin, see 401, and conclude the origin
is down, you will spend your incident fixing the wrong layer. Likewise `/health`
is ADR-024-allowlisted _and_ is the ELB health target, so **a fully-401ing origin
looks green to both `/health` and to EB**.

Run the ladder in order. Each rung has a distinguishable signature:

```sh
# Rung 1 — the worker. Expect the body to contain "no-origin not permitted".
curl -s "https://api.addressr.io/addresses/GANSW718804790"

# Rung 2 — the origin WITHOUT the gateway header. Expect exactly 401.
curl -s -o /dev/null -w '%{http_code}\n' "https://backend.addressr.io/addresses?q=sydney"

# Rung 3 — the origin WITH the header. Expect data.
#   header name/value: 1Password → Voder vault (TF_VAR_proxy_auth_header / _value)
curl -sf -H "<proxy-auth-header>: <value>" \
  "https://backend.addressr.io/addresses?q=sydney" | head -c 400
```

| Observation                                                    | Layer    | Meaning                                                                                                      |
| -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| Rung 1 returns something other than the ADR-018 rejection body | Worker   | ADR-018 default-deny changed or the worker is failing                                                        |
| Rung 2 returns anything but 401                                | Origin   | **ADR-024 enforcement regression** — the origin is exposed. Treat as a security incident, not just an outage |
| Rung 2 is 401 but rung 3 fails                                 | Origin   | The app is genuinely broken behind correct enforcement                                                       |
| All three pass but customers report failure                    | RapidAPI | Between their gateway and the worker. Not a surface you control                                              |

**Use a query that has never been requested.** ADR-029 records from the
2026-08-02 drill that the edge served stale responses for several minutes after
the environment had already switched, so a green result on a common path can be
evidence about the cache rather than the backend.

## Step 2 — Read the environment's actual state

```sh
aws elasticbeanstalk describe-environments \
  --region ap-southeast-2 \
  --environment-names mountainpass-addressr \
  --query 'Environments[0].{Status:Status,Health:Health,Version:VersionLabel,Cause:HealthStatus}'
```

`Status: Updating` may mean EB is **already rolling itself back** —
`RollbackLaunchOnFailure = true`, `RollingUpdateEnabled = true`,
`RollingUpdateType = Health`, so a deploy that fails health checks reverses
itself. **Wait for it.** Intervening mid-rollback is how one problem becomes two.

Recent events, which usually say more than the status does:

```sh
aws elasticbeanstalk describe-events \
  --region ap-southeast-2 \
  --environment-name mountainpass-addressr \
  --max-items 40 --query 'Events[].[EventDate,Severity,Message]' --output table
```

## Step 3 — Getting logs, which is not where you expect

**`StreamLogs` is `false`.** There is nothing in CloudWatch Logs to read. Only
_health_ streaming is enabled. Do not spend ten minutes in the CloudWatch console
finding an empty log group.

```sh
aws elasticbeanstalk request-environment-info \
  --region ap-southeast-2 --environment-name mountainpass-addressr --info-type tail

# wait a few seconds, then
aws elasticbeanstalk retrieve-environment-info \
  --region ap-southeast-2 --environment-name mountainpass-addressr --info-type tail
```

**SSH is not a fallback.** `SSHSourceRestriction` is open but **no `EC2KeyName`
is configured anywhere**, so there is no key to connect with.

## Step 4 — Causes worth checking early, because they are invisible otherwise

**The fleet is 100% spot, with no on-demand base.** `EnableSpot = true`,
`SpotFleetOnDemandBase = 0`, `SpotFleetOnDemandAboveBasePercentage = 0`, on
`t2.nano, t3.nano`, `MinSize = 2`, `MaxSize = 4`. A correlated spot reclamation
is a plausible cause of impact and will show in the events above as instance
termination you did not trigger. Note that autoscaling will not rescue you
quickly: the trigger is `NetworkOut` with a 5-minute period and a 360-second
cooldown, so capacity is minutes behind demand and tops out at four nano
instances.

**The search domain has no rollback.** `main.tf` states it in terms: _"THERE IS
NO ROLLBACK DOMAIN."_ The v3 standby was decommissioned 2026-08-02, and this is
now the sole search domain. Recovery for index loss or a red cluster is an AWS
automated snapshot restore (`cs-automated-enc`, hourly, **in-place**). Snapshots
cannot undo a bad **analyzer** decision, because every snapshot carries the
analyzer that took it — for that, recovery is a full rebuild from G-NAF.

Two CloudWatch alarms page `tompahoward@gmail.com` via the `addressr-search-ops`
SNS topic:

| Alarm                                      | Threshold                                                    | Note                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `addressr-v4-searchable-documents-drop`    | absolute floor, `v4_searchable_documents_floor` (15,000,000) | `treat_missing_data = "breaching"`, so a **metric outage also pages** — an alarm here is not proof of document loss |
| `addressr-v4-searchable-documents-falling` | rate, `-1000`                                                | `treat_missing_data = "notBreaching"`                                                                               |

If either has fired, the search domain is the incident, and it is the slowest
thing here to recover. Go there first.

## Step 5 — Fix it through the pipeline

There is no faster sanctioned path, so start it as soon as you know the fix.

1. Make the change in the repo.
2. `npx changeset`. **Which package depends on what broke:**
   - a **code** fix → `@mountainpass/addressr`. This also arms the infrastructure
     apply, because `updateInternalDependencies: "patch"` cascades a bump into
     the deployment package.
   - an **infrastructure-only** fix → `@mountainpass/addressr-deployment`.
   - The deploy guard refuses a push that touches `apps/addressr-deployment/`
     with nothing pending to bump it. It does **not** demand a deployment
     changeset when an app changeset will cascade.
3. Push. Read the Terraform plan posted on the release PR before merging.
4. Merge. That merge is the apply.

**Rolling back a version means publishing a fix, not repointing anything.**
`resolve-version.sh` resolves the `latest` dist-tag, so every apply moves
**forward** to the newest published version. There is no "go back" that survives
the next release.

## What this runbook does not cover, and does not claim to

**It implements neither control that names it.** `governance/control-traceability.json`
lists this path under **two** entries — `C-AR18-BREAKGLASS-RUNBOOK` (temporary
conditional IAM grants, immediate privilege removal, same-day reconciliation
evidence in a maintenance log) and `C-AR17-IAM-PRIVILEGE-ALLOWLIST`. This
document implements none of that, because break-glass mutation is refused
outright.

Both entries are imported template, not local drift: the gate script and
maintenance log they reference do not exist in this repo, and the surrounding
file describes Cloud Run, GCP Workload Identity Federation and an unrelated
application. They need correcting rather than satisfying — and note that creating
this file made those references _resolve_, which is a stronger false signal of
satisfaction than the dangling path they replaced. That is why the mismatch is
stated here, in the artefact a reader reaches from the traceability entry, rather
than left for someone to infer.

**The recovery floor has never been measured.** Nobody has timed
changeset → release PR → merge → apply → stabilise → smoke. That number is the
honest cost of refusing a manual path, and not knowing it is a real gap rather
than an acceptable one. Tracked separately; do not infer it from ADR-029's 6m36s,
which measures only the apply leg.

## Related

- [RED_TRUNK_PLAYBOOK.md](RED_TRUNK_PLAYBOOK.md) — the referrer; recovery uses
  forward commits only.
- [ADR-045](decisions/045-changesets-armed-release-pr-merge-as-the-production-deploy-entry-point.proposed.md)
  — the release-PR merge as the single production entry point.
- [ADR-029](decisions/029-opensearch-blue-green-two-phase-upgrade.accepted.md) —
  the 6m36s apply-leg measurement, and the finding that edge caching makes a fast
  smoke test unsound.
- [ADR-024](decisions/024-origin-gateway-auth-header-enforcement.accepted.md) —
  the enforcement a rung-2 result other than 401 means you have lost.
- [ADR-031](decisions/031-read-shadow-for-search-backend-migrations.proposed.md)
  — which read-shadow posture is current.
- [P039](problems/known-error/039-decouple-saas-deployment-from-npm-publish.md) —
  why infrastructure and publish are coupled.
