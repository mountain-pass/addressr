# Managed channel monitoring

The `Managed Channel Health` workflow reads D1 meter state every ten minutes.
Its paired Codex heartbeat reads that exact workflow on `master` every fifteen
minutes using `node scripts/managed-channel-health.mjs --report`. The reader
must be installed and exercised before this is an operational monitoring loop.
It depends on the local Codex host being available; scheduler delays mean these
intervals are not a guaranteed detection deadline.

The reader independently checks the newest completed run and the latest
scheduled run. Missing, disabled, failed, cancelled, stale or unreadable
execution is actionable. Evidence older than thirty minutes is stale. A green
manual run cannot hide a failed or missing scheduled run.

The checker reports exhausted meter delivery, overdue pending delivery,
missing or overdue pending reconciliation, and recorded reconciliation errors
or mismatches. It uses the producer's window and permits one five-minute
producer interval after a window becomes eligible. It never writes D1 or Stripe.

The same rules bind the ADR-088 notification adjunct, by statement rather than
by implication: an email or SMS raised for a managed-channel fault carries fixed
codes, scope and observation time only. SMS is a new egress path out of the
account, and it is bounded to managed-channel faults by a message-attribute
filter so provider alarm payloads, which carry account and metric detail, never
reach it. The adjunct is NOT a control and closes no launch gate on its own.

Reports contain only fixed codes, scope and observation time. `observed` means
the scoped read completed without finding those conditions. It does not mean
healthy, populated, reconciled with Stripe or ready for activation. Empty and
nonempty clear databases produce equivalent public reports. Provider messages,
customer identifiers, usage totals and credentials must not enter logs.

The workflow reuses the protected deployment credential spine; this token is
not a dedicated read-only token, although the checker performs only reads.
Each scheduled check makes two Cloudflare HTTP requests and one D1 statement:
288 requests and 144 statements per day, excluding manual runs. Missing-window
checks scan retained usage, and reconciliation checks have no state index.
Database work is not bounded by the small response. Measure that contention
with representative workload before activation; use indexed incremental reads
if the measured cost requires them.

On a finding, the agent verifies the failed run and investigates under the
normal risk policy. Do not reset usage, clear errors, change billing state or
activate the channel to make a check pass. Repair code through the normal trunk
and release process, then verify a fresh scheduled result.

Entitlement/provider parity, cron execution freshness independent of workload,
webhook and origin failures, payment-policy drift, latency and compute budgets,
secret rotation and an exercised operational response remain separate launch
requirements. This check does not close P110 or the full monitoring gate.
