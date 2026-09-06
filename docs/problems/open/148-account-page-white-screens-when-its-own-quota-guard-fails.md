# Problem 148: The account page white-screens when its own quota guard fails

**Status**: Open
**Reported**: 2026-09-06
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Unlikely (2). Impact 3: the throw happens during render with no error boundary anywhere in `apps/website/src`, so the failure is not a wrong number in one panel — the whole account page blanks, taking API-key creation, key revocation and the billing-portal link with it. A paying customer locked out of their own key management by a malformed usage figure has no self-service route left. Likelihood 2: not reachable today, because the Worker only emits `quota` when the limit is a safe integer and the D1 column is `NOT NULL DEFAULT 0`, so `used` is always present. It is Unlikely rather than Rare because the website and the Worker deploy independently, so the two can disagree at any time, and because the guard's own existence is evidence someone expected the malformed case.
**Origin**: internal
**Effort**: S — one guard, in one branch, plus a spec row that currently has no coverage.
**WSJF**: 6.0 — (6 × 1 for Open) / 1 for Effort S
**JTBD**: JTBD-005
**Persona**: web-app-developer

## Description

`apps/website/src/pages/account.jsx` guards the hard-cap branch with, among other terms,
`Number.isSafeInteger(account.quota.used) && account.quota.used >= 0`. That guard exists
because the author expected `used` to be absent or malformed sometimes.

The `else` branch — the one taken **precisely when that guard fails** — opens with
`account.quota.used.toLocaleString()`, unconditional. So the branch written to handle the
bad case is the branch that throws on it.

There is no error boundary in `apps/website/src`, so a throw during render unmounts the
whole page rather than the panel.

## Why it is not reachable today, and why that is not reassuring

The Worker emits `quota` only when `quota_limit` is a safe integer, and the D1 schema declares
`quota_used INTEGER NOT NULL DEFAULT 0`, so today `used` is always a number when `quota` is
present at all. MEASURED against the schema and the Worker, not assumed.

What makes it worth a ticket rather than a note: the website and the Worker are separate
deployables on separate pipelines. Any change that lets `quota` through without `used` — a
partial projection, a new plan shape, a schema migration, a serialisation change — turns a
guarded branch into a page-wide outage, and nothing in either repo half would catch it.

## Investigation Tasks

- [ ] Guard the fallback branch, or hoist `used` and `limit` once so both branches read the
      same validated values rather than re-deriving them.
- [ ] Add a spec row for a malformed `quota` — `{ limit: 3, hardLimit: true }` with no `used`.
      No such row exists: the `unknown` row passes a well-formed `used`, so the branch that
      throws is exercised by nothing.
- [ ] Decide separately whether an error boundary belongs on this page at all. A guarded branch
      fixes this instance; a boundary bounds the class. Do not fold that decision into this fix.

## Exit criteria

1. A malformed `quota` renders a usable page, asserted by a spec row that fails without the fix.
2. No branch in the quota block dereferences a value the sibling branch's guard rejects.

## Related

- Found during the accessibility review of the quota-display change on 2026-09-06, verified
  against the source, and deliberately not fixed there: it is a separate defect from the one
  that change addressed, and its fix alters else-branch text that three spec rows pin exactly.
- ADR-094 — the display decision whose review surfaced this.
- JTBD-005 owns the account surface.
