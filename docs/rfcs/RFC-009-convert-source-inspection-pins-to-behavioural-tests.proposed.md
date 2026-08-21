---
status: proposed
rfc-id: convert-source-inspection-pins-to-behavioural-tests
reported: 2026-08-20
human-oversight: unconfirmed
decision-makers: [Tom Howard]
problems: [P033, P116, P119]
adrs: [ADR-031, ADR-051]
jtbd: [JTBD-400, JTBD-001]
stories: [STORY-001]
---

# RFC-009: Convert the source-inspection pin population to behavioural tests, release and publish paths first

**Status**: proposed
**Reported**: 2026-08-20
**Problems**: P033 (closed 2026-08-21), P116, P119
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

- **P033** (Source-inspection tests are an anti-pattern in this codebase): **CLOSED 2026-08-21** with the
  decision-bearing conversion done. This clause read "conversion outstanding" in the present tense until
  that closure, and correcting it is why the trace list above now carries three problems rather than one:
  an RFC whose only driving problem is closed reads as finished work, and nothing checks the STATE of a
  `problems:` target — every link still resolves, so `doc-links-resolve.test.mjs` stays green. The
  conversion that IS outstanding lives in **P116** (nine workflow files need a note saying what they cannot
  establish) and **P119** (23 assertions over the two release watchers, needing a stubbed `gh`), both open
  and both carrying their own priority. Its confirmed instance is **P091** — `sla_range_expanded` indexed one
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

**Explicit carve-outs**, both sole cover, both excluded from delete-or-repoint until behavioural cover
exists: the two `proxy-auth.test.mjs` pins over the pre-auth-responder property, and the three
`graceful-shutdown.test.mjs` pins over the `server2.js` wiring.

**The proxy-auth half of that carve-out is LIFTED as of 2026-08-21** — the condition it names was met, not
waived. Cover now exists and is structural rather than behavioural-by-request: a guard over the built
Express middleware stack, proved CAUGHT on seven mutations **with the pins already deleted**, including the
two the pins were blind to. **The `graceful-shutdown.test.mjs` half was LIFTED 2026-08-21** — the child-process conversion landed. It is a PARTIAL lift: the ordering property is covered, the `stop:` / `force:` wiring is not, and that is recorded below rather than treated as discharged.

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

## Classification — measured 2026-08-20 (STORY-001)

**Two mutation directions were run. They give opposite answers, and only one of them is informative.**

| direction                                                       | what it does                                    | verdict              |
| --------------------------------------------------------------- | ----------------------------------------------- | -------------------- |
| **negate the pin's own proposition** — delete the text it greps | breaks the code AND the string                  | **all 7 sole cover** |
| **preserve the text, break the behaviour** — the P091 shape     | the pin's regex still matches; the code is dead | **all BLIND**        |

**Both rows are load-bearing, and reading either alone is dangerous.**

- **Direction 2 answers the coverage question** — does anything notice the behaviour dying? Its answer here
  is _everything is blind_, and that is what justifies the conversion.
- **Direction 1 answers two different questions**: is the pin vacuous (does its own regex match anything at
  all), and **is it the only thing that catches a deletion**. The carve-outs forbidding deletion of the
  `proxy-auth` and `graceful-shutdown` pins are derived entirely from direction 1. Read direction 2 alone and
  "all blind" licenses deleting every pin — **including the sole cover over the ADR-024 auth boundary**. That
  is the symmetric error and the more dangerous one.

The trap was narrower than "direction 1 is useless": it was reading direction 1's _sole cover_ as a
**coverage** verdict. It is a **deletion-safety** verdict. A pin needs both probes.

A mutation defined as "negate this text pin's proposition" edits exactly the bytes the pin matches, so the
pin catches it _by construction_. Run only in that direction, the classification can return "blind" only when
a pin's regex is defective — a vacuity result, and a useful one, but not a coverage result. An earlier
revision of this section reported "all 7 sole cover, not one is blind" and read it as a coverage finding. It
was a deletion-safety finding wearing the wrong label. Recorded rather than quietly replaced, because the trap is subtle and the next person to
classify a text pin will meet it.

### The informative direction, per row

Every mutation below leaves the pinned text **present and matching** and kills the behaviour. Whole suite,
640 tests. Every file restored byte-clean.

| #   | pin                                                                                                              | text-preserving mutation                                                  | verdict                            |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| 1   | read-shadow integration (`address-service.test.mjs`)                                                             | `if (process.env.NEVER) mirrorRequest(…)`                                 | ~~BLIND~~ **CONVERTED 2026-08-21** |
| 2/3 | server2 shutdown ordering + wiring (`graceful-shutdown.test.mjs`)                                                | `if (process.env.NEVER) installShutdownHandlers(…)`                       | ~~BLIND~~ **CONVERTED 2026-08-21** |
| 4   | proxy-auth OPTIONS scoping (`proxy-auth.test.mjs`)                                                               | pre-auth `app.use('/leak', …)` — outside the pin's method list            | ~~BLIND~~ **CONVERTED 2026-08-21** |
| 5   | P012 progress logging (`address-service.test.mjs`)                                                               | `JSON.stringify(d, …)` — a different variable                             | ~~BLIND~~ **CONVERTED 2026-08-21** |
| 6/7 | P014 catch guards (`address-service.test.mjs`)                                                                   | early return above the catch body                                         | ~~BLIND~~ **CONVERTED 2026-08-21** |
| 8   | `deploy.sh` PLAN_ONLY / workspace guard (`terraform-plan-workflow.test.mjs`, `deploy-artefact-ignores.test.mjs`) | PLAN_ONLY branch made unreachable; guard relocated below `terraform init` | ~~BLIND~~ **CONVERTED 2026-08-21** |

**So the mirror can be dead, the shutdown handlers can be uninstalled, the auth exemption can be widened and
the error mapping can be unreachable — with every pin green and the suite green.** That is P091 restated as
a re-runnable result, and it is the whole justification for the conversion.

### Row 4 — CONVERTED 2026-08-21. The first row to close.

A structural guard over the **built app** replaced two source pins, and the pins are deleted. The route there
was not straight, and the wrong turn is recorded because it is the more useful half.

**First attempt, and why it failed.** Two behavioural tests probing a hardcoded `/leak`. They caught the
shape the pin was blind to (`app.use` pre-auth) and the shape it caught (`app.get`) — but the `app.get`
mutation had been placed on `/leak`, the very path the tests probe. That proved coverage of one path, not of
the property. A pre-auth `app.get('/mutation-probe', …)` was measured **BLIND** against them. The pin was
_broad in path, blind in shape_; the replacement was _broad in shape, narrow in path_. Incomparable, not
stronger — and a test cannot enumerate paths that do not exist yet, so no amount of table-driving closes it.

**What worked.** Express exposes its middleware stack, so the question "can anything answer before
authentication?" is decidable on the built app directly — no path enumeration, no text matching. The guard
locates the auth layer **by name** and asserts the exact shape of what precedes it: one non-terminating
middleware, then the OPTIONS preflight route. Anything else, mounted anywhere, by any mechanism, is an extra
layer and reddens it.

**Seven mutations, all CAUGHT, all re-run with the pins already deleted:**

| mutation                                     | the pin               | the guard                                              |
| -------------------------------------------- | --------------------- | ------------------------------------------------------ |
| `app.get('/mutation-probe', …)` pre-auth     | CAUGHT                | **CAUGHT**                                             |
| `app.get('/localities', …)` pre-auth         | CAUGHT                | **CAUGHT**                                             |
| `app.use('/leak', …)` pre-auth               | BLIND                 | **CAUGHT**                                             |
| `app.all(/.*/, …)` pre-auth                  | CAUGHT                | **CAUGHT**                                             |
| conditional registration behind an env check | CAUGHT (text present) | **CAUGHT** (it inspects what registered)               |
| auth middleware renamed                      | n/a                   | **CAUGHT** — the guard cannot silently lose its anchor |
| OPTIONS preflight removed                    | CAUGHT                | **CAUGHT**                                             |

Row 5 of the two-direction table is where the pin loses outright: the source text is present and says nothing
about whether the registration executes. The built app knows.

**401 not 404 is load-bearing** in the accompanying request-level probes: a 404 would mean the request
reached routing, i.e. passed the auth gate. An unrouted probe path is generated per-run rather than spelled,
with an oracle asserting it 404s once the secret is presented — a literal would silently stop testing
negative space the day something routed it.

The population fell 33 → 32: with its last file-read gone, `proxy-auth.test.mjs` left the population. First
decrease; every prior move was an increase from adding a guard.

### Rows 1, 5 and 6/7 — CONVERTED 2026-08-21

All three lived in `address-service.test.mjs`, which has now left the population entirely: 32 → 31.

**Row 1 — read-shadow wiring.** The observable is the WIRE, not an app-side counter. A first attempt asserted
`getShadowStatus().attempts > 0`; that counter increments **before** dispatch, so it proves the call site ran
and nothing more — and everything between the increment and the send sits in a swallow path, which is P035's
recorded blind spot (any app-reported figure can read healthy while nothing leaves the process). Replaced by
a stub HTTP server on an ephemeral port — the automated form of the target-side observation ADR-031's own
Confirmation already names. Five mutations CAUGHT: call gated behind a false condition; call deleted; method
`search` → `get`; a rebuilt body; the import replaced by a local no-op. **The method and body mutations were
uncatchable by the counter version**, and the body one was never covered by anything.

An earlier draft set `ADDRESSR_SHADOW_HOST` to a URL. That var is a HOSTNAME — protocol and port are separate
— so it produced `https://http://127.0.0.1:9:443`, failed DNS on the hostname `http`, and never reached a
port. The test passed anyway, because the counter it asserted moves before dispatch. Recorded because a test
that passes for a reason its own comment misdescribes is this ticket's subject.

**Row 5 — progress logging.** The pin asserted the absence of one spelling, `JSON.stringify(rval`. Replaced by
capturing what `debug` actually emits and asserting the progress line is a percentage carrying no payload.
Three mutations CAUGHT, including `JSON.stringify(d, …)` — a different variable, which the pin was blind to.

**Rows 6/7 — getAddress error mapping.** The pins asserted the catch block's TEXT. Replaced by driving each
branch through the exported function with a stubbed client: no-body error → 500 (P014's actual crash),
not-found → 404, missing index → 503, timeout → 504, anything else → 500. Four mutations CAUGHT, including an
early return that makes the whole catch body dead code — which both pins were blind to.

### Rows 2/3 — CONVERTED 2026-08-21, and PARTIALLY

The blocker was real: importing `server2.js` starts a server and connects a search client, so nothing could
exercise it in-process. The conversion is the child-process shape P033 predicted — spawn the entry point and
observe what the process does.

**The ordering property is covered.** A bad `ADDRESSR_SHUTDOWN_TIMEOUT_MS` makes `shutdownTimeoutMs` throw,
so install-before-listen means the process dies before binding. Both mutations CAUGHT: the install gated
behind a never-true check, and the install moved after `startRest2Server()`.

**Picking the observable took three attempts, and the two failures are the useful part:**

1. The success banner, asserted absent — **vacuous**. It prints only after `esConnect()` resolves, and no
   search backend runs in this tier, so it never prints on any path. A run with a VALID timeout produced no
   banner either.
2. The backend-wait line, asserted absent — **blind to the mutation that matters**. It is printed downstream
   of where a moved install sits, so moving the install after startup still produced no wait line.
3. The LISTEN log, asserted absent — correct, because binding the port is the event the property is about.
   Requires `DEBUG=api` in the spawned environment or there is no bind signal at all. Measured both
   directions before relying on it.

**NOT covered, and the pins did cover it.** The deleted pins also asserted `stop: stopServer` and
`force: forceCloseConnections`. Measured BLIND to every behavioural case: `installShutdownHandlers` defaults
`force` to `() => {}`, so dropping it is silent, and the bad-timeout throw happens inside the default
parameter `timeoutMs = shutdownTimeoutMs(env)` — evaluated before `stop` or `force` is ever read. A SIGTERM
drain case was added and proves `stop` reaches a working drain and that the configured timeout arrives from
the environment, but a no-op `stop` still exits 0 with nothing in flight, and `force` only fires when a
request outlives the deadline, which needs a live backend. **A held keep-alive connection drains in 4ms.**

The honest fix is to make `force` a required option — a silent default that disables force-close is a latent
defect in its own right — which is a production change and outside this conversion. Recorded, not lost.

### Row 8 — CONVERTED 2026-08-21. The shell-predicate shape, and the first row where running the subject was the risk.

Six pins in `terraform-plan-workflow.test.mjs` and three in `deploy-artefact-ignores.test.mjs` read
`apps/addressr-deployment/deploy.sh` and asserted it CONTAINED a PLAN_ONLY early exit, an exit-code branch,
a workspace guard, a stale-plan removal and an apply invocation. Replaced by
`test/js/__tests__/deploy-sh-plan-only.test.mjs`, which runs the script.

**Running the deploy script is the obvious hazard, and the standing rule is that terraform runs only from
CI.** The test is safe by construction rather than by care: a recording `terraform` stub is placed earlier
on `PATH`, so every invocation is captured and none reaches the real binary — which IS installed on a
developer machine. The stub's call list is then the assertion surface, which is what makes "PLAN_ONLY never
applies" a statement about behaviour rather than about source. No AWS credentials are exercised, because the
script exits before any apply.

**Eight text-preserving mutations, measured with the pins in place and again with them deleted:**

| #   | mutation over `deploy.sh` (or `.gitignore`)                                     | pins   | replacement |
| --- | ------------------------------------------------------------------------------- | ------ | ----------- |
| 1   | `PLAN_ONLY` branch condition changed to `= "0"` — every pinned string intact    | BLIND  | CAUGHT      |
| 2   | workspace guard inverted `-z` → `-n`; its message text untouched                | BLIND  | CAUGHT      |
| 3   | plan-failure exit relocated below the success exit                              | BLIND  | CAUGHT      |
| 4   | plan exit 2 turned into a job failure                                           | BLIND  | CAUGHT      |
| 5   | guard block relocated below `terraform init` — same lines, same order otherwise | BLIND  | CAUGHT      |
| 6   | `rm -f tfplan tfplan.json` deleted                                              | CAUGHT | CAUGHT      |
| 7   | `.terraform/environment` written before the workspace is derived                | BLIND  | CAUGHT      |
| 8   | `terraform apply`'s exit code swallowed                                         | BLIND  | CAUGHT      |

Six of eight BLIND. Number 6 is the direction-1 case the Classification section already explains — the
mutation edits the exact bytes the pin greps, so the pin catches it by construction and the result carries
no information about coverage.

**Two of these were not pinned by anything, in either instrument.** A swallowed `terraform apply` exit code
(number 8) means CI reads a broken production deploy as a successful one — found only because the mutation
set was run against the replacement rather than derived from what the pins already said. The guard's
position relative to `terraform init` (number 5) is the same class.

**Two defects in the harness itself are recorded, because both are this ticket's own failure mode:**

1. The first version of "PLAN_ONLY never applies" ran with the stub's default plan exit of 0. Exit 2 is the
   only plan result that reaches the apply branch at all, so the assertion passed against a script with the
   guard removed entirely. It was a vacuous test of the exact shape being converted, written while
   converting it. Caught by mutation 1; the input is now `TF_PLAN_EXIT=2` with a comment saying why.
2. A mutation probe whose `perl` expression failed to compile wrote an EMPTY `deploy.sh` through its output
   redirect. The file differed from the original, so the NO-OP guard passed it, and CAUGHT was measured
   against a zero-byte script — a meaningless result that reads as a real one. The probe now requires the
   mutant to be non-empty, to still parse under `sh -n`, and to differ, before any verdict is taken. This is
   the positional-`sed` lesson in a new costume: a mutation harness that cannot tell "mutated" from
   "destroyed" silently answers a different question.

The `deploy-artefact-ignores.test.mjs` half is subtractive in a different way. Its three pins were an
**anti-vacuity floor** — read the script, assert it still writes the artefacts the ignore list is derived
from — which is a legitimate purpose served by an instrument that cannot serve it: a text match cannot
distinguish a write that happens from a write that is merely coded, and the paths it names moved twice on
this repo. The floor is now derived from the run: execute the script, then assert `git status
--untracked-files=all` reports nothing under the deployment directory. This repo is public and `tfplan.json`
carries cleartext secrets, so the floor is load-bearing; it was mutation-proved by stripping ignore rules.

### What rows 1, 5 and 6/7 do NOT establish

P116 attaches a what-this-cannot-establish note to pins that stay. The same discipline belongs on pins that
go, or "CONVERTED" quietly transfers coverage the replacement never had.

- **Row 1 — the single build is NOT pinned.** The production comment calls it load-bearing: _"Calling
  buildAddressSearchBody twice would satisfy every existing assertion while quietly voiding this."_ The
  replacement compares the mirrored body to the primary's, so a FAITHFUL rebuild is deep-equal and passes.
  The CAUGHT verdict recorded for "a rebuilt body" used a body built from **different** inputs
  (`{ query: { match_all: {} } }`), so it establishes that the mirror sends the primary's query and not that
  one object is shared. Nothing outside the module can prove shared-reference.
- **Row 1 covers the SEARCH leg only, and the other leg does not exist.** `getAddress`
  (`address-service.js:1622-1663`) contains no `mirrorRequest` call at all — verified by reading, not
  assumed. Yet ADR-031's Behaviour and Where-the-code-lives sections, and `read-shadow.js`'s own header,
  all claim `/addresses/{id}` is mirrored. So a describe block titled "read-shadow WIRING (ADR 031)" would
  otherwise transfer apparent coverage over a mechanism half of which was never built. The ADR correction is
  its own ticket; the non-establishment note belongs in the commit that creates the coverage claim.
- **Rows 6/7 — the 504 case characterises a branch that cannot fire.** Production selects it with
  `error_.displayName === 'RequestTimeout'`, and no `@opensearch-project/opensearch` error carries
  `displayName` — measured, and the string appears nowhere in that package. A real timeout returns 500.
  **The conversion found this; the pins could not, and neither could the first behavioural replacement,
  which drove the branch with a fabricated error carrying the field the source reads.** Tracked as P117.
- **Row 5 — frequency is NOT pinned, only payload.** P012's subject is volume, and volume is payload times
  rate. Delete the `index % Math.ceil(count / 100)` throttle and the mapper logs every row; the test still
  passes, because it logs at index 0 either way. The deleted pin did not cover this either.
- **Rows 6/7 — the fixture is not the production shape.** Papa.parse with `header: true` yields `''` for
  absent fields; the test fixture leaves them `undefined`, so every `!== ''` guard takes the opposite branch
  and the mapper builds a maximal record. Conservative for these assertions, but it is not the production
  path.

**Mutation expressions, published so the verdicts are re-runnable** — content-addressed, never positional,
per P033's own rule:

```
row 1  s|  mirrorRequest({ method: 'search', params: searchParameters });|  if (process.env.NEVER) mirrorRequest({ method: 'search', params: searchParameters });|
row 1  s|mirrorRequest({ method: 'search', params: searchParameters })|mirrorRequest({ method: 'get', params: searchParameters })|
row 1  s|mirrorRequest({ method: 'search', params: searchParameters })|mirrorRequest({ method: 'search', params: { index: ES_INDEX_NAME, body: { query: { match_all: {} } } } })|
row 5  insert  logger("m", JSON.stringify(d, undefined, 2));    above the progress log
row 5  insert  logger("m", JSON.stringify(rval, undefined, 2)); above the progress log
row 6  insert  if (error_) return { statusCode: 500, json: { error: "dead" } }; at the head of the catch
row 7  s|statusCode: 504|statusCode: 500|
6/7    hoist the RequestTimeout branch above the body branches   (precedence)
6/7    s|json: { error: 'not found' }|json: { error: 'service unavailable' }|  (payload swap)
```

The last two were BLIND when first measured and are the reason rows 6/7 gained a precedence case and
per-branch payload assertions before being called converted.

### The gap this closed, stated with the bound P033 already had

An earlier revision of this section said the auth boundary is "guarded by a text assertion and by nothing
else". That is wrong in one direction and silent in the worse one. The accurate position, which P033 states
correctly and this RFC must not narrow:

- **Covered behaviourally on `/addresses`** — `waycharter-server.test.mjs`'s _401s an unauthenticated data
  GET on the same path_ drives `buildRest2App` and catches a pre-auth responder mounted there.
- ~~**Sole-covered by the text pin** for a data-method registration on any other path.~~ **As at
  2026-08-20.** That pin was deleted 2026-08-21; the structural guard covers this. Measured: inserting
  `app.get('/leak', …)` reddens exactly one test, the pin.
- **UNCOVERED by either** for a path-scoped `app.use('/leak', …)`. The pin's method list does not include
  `use`; no behavioural test requests an unrouted path, so the bypass is unobservable by construction.
  Measured BLIND above. ~~**This row has no guard at all today.**~~ **As at 2026-08-20 — closed
  2026-08-21**: row 4's table records `app.use('/leak', …)` pre-auth as CAUGHT by the structural guard.

**What discharges all three shapes is the structural guard over the BUILT APP** — it locates the auth layer
by name and asserts the exact shape of everything registered ahead of it, so a responder mounted anywhere, by
any mechanism, shows up as an extra layer. It needs no path enumeration, which is the whole point.

**It is NOT the `GET /leak` probe, and this paragraph said it was.** An earlier revision read "with proxy
auth enabled, `GET /leak` must return 401 — that catches a pre-auth `app.get`, a pre-auth `app.use`, a
router mount…". That describes the REJECTED first attempt, and it credits it with catching the very shape
this RFC records it measured BLIND against, a hundred lines above: a pre-auth `app.get('/mutation-probe', …)`
passed it, because the probe only ever reaches the path it names.

Recorded rather than quietly replaced, because it is **another instance of one shape: a record crediting
an instrument its own measurements found blind.** No count is given — an earlier draft said "the third
instance today", an ordinal nothing computes, written one paragraph after a tally was removed for being
exactly that. A reader who took this paragraph at face value
would retire a pin on the strength of a path probe, which is exactly the mistake it took a measurement to
catch the first time.

The generated-path request probes remain, and they are worth having — but as a check on the auth decision
being reached at all, not as the any-path guard.

### Negative pins admit a dual after all — and it is the easiest one to miss

An earlier revision of this section claimed rows 4 and 5 were a **fourth class** for which "a text-preserving
dual does not exist: there is no way to keep 'the string is absent' true while making the behaviour wrong."
**Measured 2026-08-20: false, in both rows.** A negative pin greps a _specific_ string, so its dual is to
break the behaviour using a string it does not grep:

- Row 5 asserts no `JSON.stringify(rval` in `mapAddressDetails`. Logging `JSON.stringify(d, …)` — a different
  variable — restores the entire per-row cost the pin exists to prevent, keeps the pinned string absent, and
  is **BLIND**.
- Row 4 asserts no `app.(all|get|post|put|delete|patch)(` ahead of auth. Mounting `app.use('/leak', …)` is a
  live bypass, keeps the pinned pattern absent, and is **BLIND**.

There is no fourth class. The claim is withdrawn rather than deleted because it was the sole argument for
one. **A negative pin is in fact the weakest shape here, not a special one**: it constrains a finite list of
spellings and says nothing about behaviour, so evading it needs no cleverness — only a spelling outside the
list. Its conversion technique is still distinct (assert the _observable_ absence: capture `debug` output
over one fixture row, assert no payload appears), but that is a difference of technique, not a class of pin
that resists measurement.

### Population — what was and was not classified

Seven numbered **rows** over five table lines — adjacent pins sharing one mutation are merged — nine **pins**, three files — the two numbers differ, and the difference is stated rather than
left to be reconciled: `address-service.test.mjs` (read-shadow ×2 = row 1, P012 = row 5, P014 ×2 = rows 6/7),
`graceful-shutdown.test.mjs` (×2 = rows 2/3), `proxy-auth.test.mjs` (×2 = row 4 — one row because both pins
scan the same pre-auth region and one mutation settles both).

**Not classified, and named rather than left implied:**

- The read-shadow **import** pin (`assert.match(source, /import { mirrorRequest } …/)`). Its own proposition
  was never mutated. P033's Step 4 read enumerates **13** pins across these files against the 7 here; the
  difference is sentinel pins and presence pins (`app.options(` must appear), which assert a precondition of
  another pin rather than a property of the code.
- `release-workflow-deploy-only.test.mjs` — 22 assertions over two shell scripts and the shared awk scan.
  **An earlier revision of this line filed these under P033's declarative-artefact carve-out. That was
  wrong and is corrected rather than quietly rewritten**: the carve-out covers workflow YAML, where the
  artefact IS the subject; a shell script is code, and asserting on its text is the population this RFC
  exists to convert. P033 has always named it as owed work. It is not discharged here — see row 8 for the
  shape its conversion takes.

The 7 are the decision-bearing pins. The remainder is enumerated in P033 Step 4 and is not discharged here.

## Stories

Ordered execution sequence; array position is the sequence.

1. **STORY-001** — A test that passes no matter what the code does is found and made able to fail
   (`docs/stories/in-progress/STORY-001-a-test-that-cannot-fail-is-made-able-to-fail.md`, `in-progress`,
   effort S). Classifies every pin in the population using `scripts/mutate.sh`. Deliberately first: every
   later conversion depends on knowing which bucket a pin is in, and it writes no behavioural tests and
   changes no production code.

   **All seven acceptance criteria ticked 2026-08-20**; the result is the Classification section above. It
   stays `in-progress` rather than `done` because a story closes only when its RFC closes, and this RFC is
   still `proposed`.

   **Its own rule needed correcting in the doing.** The story said a CAUGHT verdict discharges a pin only
   when the catching test is not itself a source pin. True, and insufficient: run in the direction the story
   implies — negate the pin's own proposition — the catcher is ALWAYS the pin, so the rule resolves every
   pin to "sole cover" and the blind bucket is unreachable. The discharging question is not _who caught it_
   but _which mutation was run_. The downstream conversion stories inherit the corrected rule: **a pin is
   discharged when the text-PRESERVING mutation is CAUGHT.**

**The story tier was adopted 2026-08-20**, at the maintainer's direction, while working this RFC. Before that
this repository ran none — all eight prior RFCs carried an empty list, and P065 had left the open question of
whether to adopt one or record a deliberate deviation. It was put to the maintainer as the blocker to
progressing P033 and they chose adoption, so the earlier note here recording an empty list as a pending
question is superseded by that decision.

`docs/story-maps/` and `docs/stories/` are new as of it. STORY-MAP-001 is the first map, and its style rules
were derived from a WCAG AA review rather than inherited from the framework template — that template ships a
`#ccc` slice border at 1.61:1 against white, which fails SC 1.4.11 in a layout where the border is the only
cue that a slice is a link.

## Commits

(rendered from `git log --grep "Refs: RFC-009"` per wr-itil ADR-085 — a git-log-derived view. At capture there are no
commits yet.)

## Related

- **P033** — the driving Known Error. Carries the settled rule, the published predicate, the audit, the
  risk-ordered cadence, and the first BLIND reference measurement.
- **P116** — the workflow-pin note task, split out of P033 the same day. Sibling scope, deliberately not a
  dependency: the notes can land whether or not this conversion starts.
- **P091** — the realised instance. Its recurrence is what this RFC makes impossible rather than watched-for.
- **P065** — closed 2026-08-20. Its standing instruction was that the next RFC carrying an empty
  `stories:` list raises the adopt-or-deviate question again. That question is now **answered**, not
  merely named: the `## Stories` section above records the tier's adoption at the maintainer's direction.
- **wr-itil ADR-089** — every RFC has at least one story; its gate is at `accepted`, which is why an empty list was
  legitimate at `proposed` and is not legitimate as a terminal shape.
- **`scripts/mutate.sh`** — the acceptance instrument. CAUGHT / BLIND / NO-OP, where NO-OP means the mutation
  did not apply and therefore nothing was tested.
