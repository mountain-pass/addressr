---
status: proposed
rfc-id: convert-source-inspection-pins-to-behavioural-tests
reported: 2026-08-20
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P033]
adrs: [ADR-031, ADR-051]
jtbd: [JTBD-400, JTBD-001]
stories: []
---

# RFC-009: Convert the source-inspection pin population to behavioural tests, release and publish paths first

**Status**: proposed
**Reported**: 2026-08-20
**Problems**: P033
**ADRs**: ADR-031 (read-shadow for search-backend migrations — the mechanism whose pin is BLIND today and the first conversion target), ADR-051 (a check whose only reader is the maintainer is not a control)
**JTBD**: JTBD-400 (Ship Releases Reliably From Trunk — the anti-erosion clause), JTBD-001 (Search and Autocomplete — the outcome P091 degraded while three green instruments watched)

> Auto-created at fix-time by the I13 propose-fix RFC-trace gate (wr-itil ADR-072 placement / wr-itil ADR-073 auto-create) on Known Error P033, which carried no `## Fix Strategy` section and referenced no RFC vehicle. Born `human-oversight: unconfirmed`; ratified at `/wr-itil:manage-rfc accepted`.

## Summary

Replace source-inspection pins with tests that execute their subject. A source-inspection pin asserts that a
line of implementation text is present; it passes whenever the line exists, **including when the line is never
reached**. That is not a weaker test — it is a test of a different proposition.

Three pins were mutation-measured on 2026-08-20 and all three are **BLIND**: the read-shadow mirror, the
graceful-shutdown handler installation, and the proxy-auth middleware registration can each be made
unreachable while their own test file stays green.

## Driving problem trace

- **P033** (Source-inspection tests are an anti-pattern in this codebase): root cause identified, workaround
  documented, conversion outstanding. Its confirmed instance is **P091** — `sla_range_expanded` indexed one
  level too deep, populated on **0 of 16,905,824** documents for four months, while the assertion naming that
  feature stayed green because the source line it matched was present and correct.

## Scope

**The population is derived, never restated.** P033 publishes the predicate and
`test/js/__tests__/p033-population-figures-recompute.test.mjs` recomputes it every suite run — it fired on
2026-08-19 when the population moved. This RFC deliberately inlines no **population** cardinal: P033 withdrew every tally
on 2026-08-19 after three methods produced three answers, one of which moved under its own author's edits. A
number written here would be a second uncomputed site of exactly that class. The live count is whatever the
guard computes; the size is carried by the effort rating (XL, set at the Known Error transition).

**Anti-vacuity binds any re-derivation** (ADR-048 Confirmation — a guard that can pass by matching nothing is
not a guard). The recompute guard already floors both groups non-empty; any step here that re-derives the
population inherits that floor. A derivation that matches nothing exits 0 and must never read as "converted".

**Ordering is inherited, not chosen.** P033 decided the cadence on 2026-08-19: risk-ordered, release and
publish paths first, because a pin that cannot fail there passes a defect into a published artefact.
`release-watch.sh` was converted that day for exactly that reason, and its predecessor's pin matched a call
that had been commented out.

**First target, ahead of the generic cadence: the ADR-031 read-shadow pin.** It sits on a decision-bearing
mechanism — the mirror that de-risks a search-backend cutover — and the 2026-08-20 measurement shows the
whole of `test/js/__tests__/address-service.test.mjs` is BLIND to that mirror being disabled outright.

**The chosen approach, in prose per wr-itil ADR-070.** Extract the predicate under test into a unit that can be RUN,
feed it inputs, assert on what comes back. The worked precedent landed 2026-08-19: `scripts/scan-jobs.awk` was
extracted from two watcher scripts so its whole contract became an exit code, and `scan-jobs-awk.test.mjs`
feeds it fixtures across 15 cases. Four historical defect shapes were reverted in turn and each was caught.
The class became impossible rather than watched-for.

Three sub-shapes partition the population by conversion technique — all three in scope, ordered by
tractability:

1. **Shell predicates** — extract to a file, feed inputs, assert the exit code. The `scan-jobs.awk` shape.
2. **In-process JS** — import the module, call the function, assert the observable.
3. **Top-level side-effecting entry points** — `packages/addressr/src/server2.js` starts a server and connects
   a search client on import. P033 has already recorded that the honest conversion here is a child-process one
   (spawn, assert exit, assert no port binds) and that what blocks it is the entry-point side effects, not the
   retired babel import. **Inherited from P033, not decided here.**

### Acceptance, and why CAUGHT alone is not enough

Per pin: `scripts/mutate.sh <subject> <sed-expression> <test command>` returns **CAUGHT** where it returns
BLIND today. Establish the BLIND baseline first, so each conversion has a before-and-after rather than an
assertion.

**The mutation must be applied to the production module and the production call site.** A CAUGHT verdict
passes trivially against a test-local copy or a freshly constructed instance. P033 records two **closed
episodes** that show the shape — the CORS `PREFLIGHT_METHOD` constant, written and then removed because it
compared a literal to itself; and the graceful-shutdown factory's seven assertions, which built fresh
instances and proved nothing about the singleton production runs until an eighth, mutation-proved case closed
it. Neither is a live pin; both are cited as evidence that executing is necessary and not sufficient.

**The mutation must negate the PIN'S OWN PROPOSITION, not merely disable its subject.** This is the
symmetric half of the rule above, and it is the one that nearly went wrong. A draft of this RFC said: mutate,
run the whole suite, and if the suite CAUGHT it then behavioural cover exists so the pin can be deleted or
repointed. Applied to the two `proxy-auth.test.mjs` pins that rule authorises deleting them — and P033 records
that they must not be deleted in a conversion sweep.

The measurement below settles why. Disabling `app.use(proxyAuthMiddleware())` negates _"auth is registered"_
and the whole suite CAUGHT. But the pins assert something else: _no data-method responder is registered ahead
of `proxyAuthMiddleware`, on any path_. Mutating THAT proposition — inserting a pre-auth `app.get` — is also
CAUGHT, but **only by the source pin itself**. Nothing behavioural reaches it. The pins are sole cover, as
P033 says, now confirmed by measurement rather than by assertion.

So the per-pin step is: mutate the pin's own proposition, run the **whole** suite, and **read the failure
list** — not the exit code. A pin may be deleted or repointed only when the catching test **executes the
subject**. "Caught by some other test" is not the bar, and a second measurement shows why.

`packages/addressr/src/server2.js` carries three sibling pins in `graceful-shutdown.test.mjs` over the same
two `indexOf` results. Mutating the handler call shape (`{ stop, force }` → `{ stop }`) is CAUGHT — by
`installs the shutdown handlers against stopServer and forceCloseConnections`, which is **another source
pin** asserting over the same text. Nothing behavioural reaches `server2.js` at all; P033 records the
child-process conversion as unstarted. So each of the three individually satisfies "caught by a test other
than the pin", while collectively they are the only cover. A rule keyed on that phrasing authorises deleting
all three and leaves SIGTERM drain wiring unguarded.

**The operational test, then**: the catching test must not itself be a member of the source-inspection
population. Pins vouching for pins is not cover, it is a quorum of the same assumption.

**Explicit carve-outs**, both sole cover, both excluded from delete-or-repoint until behavioural cover exists:
the two `proxy-auth.test.mjs` pins over the pre-auth-responder property, and the three
`graceful-shutdown.test.mjs` pins over the `server2.js` wiring.

### Measured baselines, 2026-08-20

All files restored byte-clean afterwards.

| Subject mutated (ADR-046 paths)                                                                                                              | Behaviour broken                                                             | Test command                       | Verdict                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------ |
| `packages/addressr/service/address-service.js` — `mirrorRequest(...)` made unreachable                                                       | ADR-031 read-shadow mirror never fires                                       | whole `address-service.test.mjs`   | **BLIND**                            |
| `packages/addressr/src/server2.js` — `installShutdownHandlers(...)` made unreachable                                                         | no SIGTERM drain (P067's subject)                                            | whole `graceful-shutdown.test.mjs` | **BLIND**                            |
| `packages/addressr/src/waycharter-server.js` — `app.use(proxyAuthMiddleware())` made unreachable                                             | gateway auth not registered                                                  | `proxy-auth.test.mjs`              | **BLIND**                            |
| _same mutation_                                                                                                                              | _same_                                                                       | **whole `test:js` suite**          | **CAUGHT**                           |
| `packages/addressr/src/waycharter-server.js` — a pre-auth `app.get('/mutation-probe', …)` inserted ahead of `app.use(proxyAuthMiddleware())` | a data-method responder answers before auth, on a path outside the allowlist | **whole `test:js` suite**          | **CAUGHT — by the source pin alone** |

**Rows three to five carry the finding, and each corrected the reading of the one before it.**

Row three alone suggests the auth boundary is uncovered. Row four disproves it — the whole suite reddens, and
the failure list (not an inference from assertion text) names two **behavioural** tests in
`test/js/__tests__/waycharter-server.test.mjs`, under a describe block titled for CORS preflight ordering:
`401s an unauthenticated data GET on the same path — the control`, and `does not exempt OPTIONS when CORS is
off`. Both build the app, enable auth, inject a real request and assert on the status. The first states its
own purpose: _"if this is not 401 the preflight 204 proves nothing — authentication is not enforced on this
path at all."_

**Bounded precisely: for THAT mutation it is a locality defect, not a security gap.** The file named after
proxy-auth is blind to proxy-auth being switched off, while the genuine cover sits in a file P033 has already
cleared as not-source-inspection. A reader auditing "is the auth boundary tested?" opens the file bearing the
name and gets a green that means nothing.

**Row five is what stops that being the whole story.** The behavioural cover exercises `/addresses` only. The
wider property the two pins assert — no data-method responder ahead of auth on ANY path — has no behavioural
cover at all: mutating it is caught by the source pin and by nothing else.

**And for one sub-shape the cover is zero, not sole.** P033 records that a source-region scan cannot see a
terminating `app.use` handler mounted ahead of the middleware. Row five mutated `app.get`, a data-method
registration the pin does scan for, so its CAUGHT verdict says nothing about the `app.use` shape — for that
one, neither the pin nor anything behavioural reaches it. So: covered behaviourally on `/addresses`,
sole-covered by a text assertion for data-method registrations elsewhere, and uncovered for a pre-auth
`app.use`. That is P033's live gap, confirmed and bounded.

### Out of scope, each with a reason rather than an omission

- **The workflow-YAML pins.** They are excluded from this population by the published predicate, not deferred
  from it: extract-and-feed cannot convert them because nothing here runs a workflow. Their remedy is the
  explicit note saying what they cannot establish — **P116**, split out 2026-08-20 so an S task is not priced
  at this RFC's XL divisor. P116 is that note task; it is not a deferred conversion. (Note also that P033 corrects the older
  wording "there is no runtime in this repo to feed them", which was stated of more files than it holds for —
  the corrected figures are computed by that ticket's guard and are deliberately not restated here, since a
  number written at this site is exactly the second-uncomputed-site class this RFC declines to create.)
- **The declarative-artefact carve-out.** A lockfile agreeing with its manifests, a decisions index, a WSJF
  table — the artefact IS the subject, so reading it is not a proxy for behaviour. P033's settlement retired
  the WIRING exemption only; this carve-out survives untouched and was never in the population.
- **A mechanical check that new pins are not added.** Designed, measured and declined on 2026-08-20 — its
  catch rate against P091 was zero, because that pin landed in a file the predicate already matches. The
  maintainer's recorded trigger for revisiting is a new bad pin reaching master unnoticed. **This RFC does not
  re-open that question**: what it claims is only that the convention documented in `AGENTS.md` does not by
  itself convert the existing population.

**Why the convention does not discharge P033** (ADR-051): not because its reader is the maintainer — it is
loaded at session start and its reader is an agent. Because it is an **instruction, not a check**. It emits no
finding, so there is nothing for any reader to surface and nothing that can fail. ADR-051's corollary is
directly on point: _"Run X manually before risky changes" is not a control. It is operator memory._

## Stories

`stories: []` — pending the wr-itil ADR-089 disposition. The empty list is a back-fill state, not a shape, and this
repository operates no story tier (`docs/stories/` and `docs/story-maps/` do not exist; all eight prior RFCs
carry an empty list). **No rationale is recorded here deliberately**: a standing local deviation from wr-itil ADR-089
would be a decision, and wr-itil ADR-070 forbids RFCs holding decisions — recorded in RFC prose it would also be
invisible to the wr-itil ADR-066 oversight detector, which reads only `docs/decisions/`. P065 closed 2026-08-20 with
the standing instruction that the next RFC carrying an empty list raises the question again; this is that RFC.
The question is owed before the `accepted` transition, where wr-itil ADR-089's gate sits — not before this lands at
`proposed`.

## Commits

(rendered from `git log --grep "Refs: RFC-009"` per wr-itil ADR-085 — a git-log-derived view. At capture there are no
commits yet.)

## Related

- **P033** — the driving Known Error. Carries the settled rule, the published predicate, the audit, the
  risk-ordered cadence, and the first BLIND reference measurement.
- **P116** — the workflow-pin note task, split out of P033 the same day. Sibling scope, deliberately not a
  dependency: the notes can land whether or not this conversion starts.
- **P091** — the realised instance. Its recurrence is what this RFC makes impossible rather than watched-for.
- **P065** — closed 2026-08-20; its standing instruction is why the `## Stories` section above names an open
  question instead of answering it.
- **wr-itil ADR-089** — every RFC has at least one story; its gate is at `accepted`, which is why an empty list is
  legitimate at `proposed` and is not legitimate as a terminal shape.
- **`scripts/mutate.sh`** — the acceptance instrument. CAUGHT / BLIND / NO-OP, where NO-OP means the mutation
  did not apply and therefore nothing was tested.
