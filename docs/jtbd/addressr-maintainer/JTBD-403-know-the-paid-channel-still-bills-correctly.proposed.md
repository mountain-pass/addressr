---
human-oversight: confirmed
oversight-date: 2026-09-03
status: proposed
job-id: know-the-paid-channel-still-bills-correctly
persona: addressr-maintainer
date-created: 2026-09-03
screens:
  - 'scripts/managed-channel-health.mjs — the scoped D1 reader run every ten minutes by the workflow below. Its single `healthQuery` statement already carries five EXISTS columns covering exhausted meter delivery, overdue pending delivery, missing or overdue reconciliation, and recorded reconciliation errors or mismatches. New conditions belong as further columns in that one statement, not as new statements: the doc records 288 requests and 144 statements per day, and warns that the database work is not bounded by the small response.'
  - ".github/workflows/managed-channel-health.yml — the ten-minute schedule. Its liveness is the job's weakest link and is not self-evident: a workflow that stops firing is exactly what the stale-schedule check exists to catch, so this job depends on that one holding."
  - 'docs/MANAGED_CHANNEL_MONITORING.md — the contract for what the reader may and may not say. The no-disclosure rules there (fixed codes, scope and observation time only; no provider messages, customer identifiers, usage totals or credentials) bind every notification this job adds, not just the existing report.'
  - 'apps/addressr-deployment/cloudflare-worker/customer-channel.mjs — the acting half. Paused collection, a disallowed subscription status and a non-immediate payment method are each refused before origin forwarding or accounting. These conditions need no notification to be controlled; listing the file here records which faults are already handled in-flow so the notification surface is not built twice.'
  - 'apps/addressr-deployment/main.tf — the notification topic and its subscriptions, including the ADR-088 SMS subscription and the message-attribute filter that bounds it to managed-channel faults. The topic predates this job (it was built for search operations) and gaining a second purpose is a deliberate reuse, not drift; the filter is what makes the reuse safe, because the same topic is the action target for the search alarms on both trip and recovery.'
  - 'apps/addressr-deployment/vars.tf — the protected SMS endpoint variable. It deliberately carries no default, unlike its email sibling, because a default would put a personal phone number in a public repository.'
  - 'test/js/__tests__/managed-channel-sms-subscription.test.mjs — the declaration-level guard. It proves the variable has no default, that no phone-number-shaped literal is anywhere in the deployment tree (by pattern, so a different number also fires), that the filter and its scope are declared, and that the topic name is unchanged. Membership is by annotation, following the release-job convention. It discharges the no-number-in-the-repo criterion and NOTHING else — not the payload-disclosure criterion, and not the both-directions delivery exercise.'
  - 'docs/decisions/088-managed-channel-faults-act-in-flow-and-notify-as-an-adjunct.proposed.md — the decision that implements this job, recorded and ratified 2026-09-03. It is the only record of two constraints this job depends on and does not itself state: what a notification payload may contain, and that Worker observability stays disabled so end-user address queries do not enter provider retention. A reader who acts on this job without reading that decision can satisfy the outcomes while breaking both.'
---

# JTBD-403: Know the paid channel still bills correctly

> Created 2026-09-03. An architecture review of the managed-channel alerting gap found that the maintainer's job corpus has no operate-the-revenue-channel job at all: the maintainer holds jobs for shipping releases, keeping credentials out of the repository, and carrying context between sessions, and the web-app developer holds the job of creating and using a managed account. None of them covers knowing that a paid channel is still honouring its commercial contract. That absence is load-bearing rather than tidy, because the project's own rule qualifies an agent-read check only when it surfaces a finding that is _actionable_, and actionable has no meaning without a job whose outcome the finding defends.

## Job Statement

When customers are paying for metered API access, I want any fault that breaks the commercial contract to reach a reader while the billing period is still open, so that nobody is over-billed, under-billed, or silently denied the service they are paying for, and so that I find out from my own instruments rather than from a customer.

## Desired Outcomes

- **A metering fault surfaces before the invoice.** Usage recorded in the database but never delivered to the billing provider is the fault that costs real money and shows no symptom: the customer is served, the request is counted locally, and the invoice is simply wrong. It must be caught inside the period it belongs to.
- **A reconciliation mismatch is treated as a fault, not a metric.** Local usage disagreeing with the provider's record means one of the two is wrong. Either direction is a billing error.
- **A fault that nobody is present for still escalates.** The existing reader is read by an agent when a session starts. Between sessions, a persistent billing fault currently accrues in silence, and the harm is continuous rather than discrete.
- **The maintainer is reachable out of band for the faults that cannot wait.** Confirmed 2026-09-03: email, and SMS as well. See the honest limit recorded below.
- **A notification says what happened without saying who it happened to.** Fixed codes, scope and observation time only. No customer identifier, no usage total, no provider message, no credential. A notification that discloses is worse than no notification, because this repository is public and the escalation path is not.
- **A check that finds nothing says so, and a check with nothing to look at is louder than a clean one.** An empty corpus reporting green is the failure this project has already had once.

## Persona Constraints

- **Addressr Maintainer** (sole): there is no on-call rotation and no second reviewer. Much of the work runs in unattended sessions, so a finding that only a present human would see is not a control. That rule is why this job cannot be discharged by adding an inbox alert alone, and why the acting and agent-read halves carry the weight.
- **The repository is public.** Every artefact this job produces is subject to the same exclusion rules as the launch ledger: no commercial terms, subscriber data or traffic volumes.
- **The channel is not yet live.** Today every desired outcome above is trivially met, because there are no customers, no usage records and no invoices. This job is written before the need rather than after the incident, and its outcomes should be read as what must hold on the day the channel opens.

## Current Solutions

- **The ten-minute health workflow and its agent reader.** Real, exercised, and already covering meter-delivery and reconciliation state. Its terminus is an agent at session start, which qualifies as a control. Its weakness is the gap between sessions.
- **Refusal in the request path.** Paused collection, disallowed subscription status and unsupported payment method are each denied before the request reaches the origin or the accounting path. This is the strongest shape available and it is already built; it needs no notification to be a control.
- **Three account notification policies.** All email, covering passive origin monitoring, a web-analytics update and a budget alert. Authenticated readback on 2026-09-03 confirmed none of them covers this channel. They are not coverage for this job.
- **The customer.** Today, for any fault with no in-flow moment, the first reader is whoever is paying. This is the honest status quo and the reason the job exists.

## The limit of the chosen notification, stated because it will be misread otherwise

The maintainer chose on 2026-09-03 to be notified by email and SMS. That choice is recorded here plainly, along with what it does and does not buy.

An alert that terminates in the maintainer's attention is, by this project's own rule, not a control: it discharges nothing on its own and must not be counted as coverage in a risk assessment, a confirmation criterion, or a ticket closure. What it does buy is real and worth having — it shortens the time between a fault occurring and a human knowing, which the agent-read path alone does not do when no session runs for a day.

So the notification is an **adjunct**. The controls for this job remain the refusal in the request path for conditions that have an in-flow moment, and the agent-read check for those that do not. If a future reader finds this job's outcomes marked satisfied on the strength of an email policy alone, that is the error this paragraph exists to prevent.

Three further bounds were measured on 2026-09-04 and belong here, because a
notification path that exists and is silent is the most misreadable state this
job can be in. The account is in the provider's SMS sandbox, so SMS reaches
**only destinations verified in advance**; the maintainer's number was verified
that day and a real message arrived, which is the only reason the channel is
known to work at all. The monthly SMS spend cap is one US dollar, which suits a
low-volume fault channel and nothing more. And a second recipient is not a
configuration change but a prerequisite: it requires leaving the sandbox, which
is a provider request with lead time.
