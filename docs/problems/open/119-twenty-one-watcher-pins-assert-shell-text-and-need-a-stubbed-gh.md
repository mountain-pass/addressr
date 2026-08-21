# Problem 119: Twenty-three watcher assertions read shell text, and converting them needs a stubbed `gh`

**The filename says `twenty-one`. It is a retained dedupe key, not a description** — the same convention
`R023` uses, and for the same reason: renaming churns every citation. The count is 23. See the population
note below for how the first figure was wrong.

**Status**: Open
**Reported**: 2026-08-21
**Priority**: 12 (High) — Impact: Moderate (3) × Likelihood: Likely (4). Impact 3, not 2: these pins guard `release-watch.sh` and `push-and-watch.sh`, which report whether a release succeeded. A blind pin here is the P085 false-green class, and that class has fired in anger — R023 records a run where the watcher reported success over a red pipeline: on 2026-08-03, commit `ca18113` left **both `build-and-test` matrix legs red** and `npm run push:watch` printed "Push pipeline completed successfully", so a regression that made the published package unloadable sat on master reported as green. Not 4, because the watcher runs AFTER publish and apply, so it misreports an outcome rather than causing one. Likelihood 4 (**Likely** per RISK-POLICY.md § Likelihood Levels): the pins are text matches over 749 lines of shell across two scripts, and the population they belong to has a demonstrated four-month blind instance.
**Origin**: internal
**Effort**: L — a canned GitHub surface, then twenty-three behavioural replacements, each mutation-proved in both directions.
**WSJF**: 3.0 — (12 × 1.0) / 4
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

**Split out of P033 on 2026-08-21 at the maintainer's direction**, because the work is materially larger
than the rest of that ticket's shell task and was competing for attention inside an XL parent.

`release-workflow-deploy-only.test.mjs` holds **23 assertions** that read a production shell script and
assert on its text. They pin the
watcher's decision logic: which `gh` subcommand is called, which `jq` filter selects the job, that
`WATCH_STATUS` is checked, that an UNKNOWN scan (exit 2) is treated distinctly from success, that a run
concluding `failure` exits non-zero.

Every one of them asserts that the decision is **written**, not that it is **reached**. That is P033's
subject, and this is the last population in the repo where it is unconverted.

**The population, with its counting rule published so it can be rerun rather than trusted** — 23 = 21 + 2:

- **21 pattern pins**: `assert.match` / `assert.doesNotMatch` whose first argument is one of the two script
  bodies. 13 over `release-watch.sh`, 8 over `push-and-watch.sh`.
- **2 ordering checks**: `assert.ok` over an index comparison of the same source text —
  `releaseWatch.search(/^wait_for_completion \|\| exit 1$/m)` against `releaseWatch.indexOf('JOBS_TSV=')`
  at lines 865-866, and the identical shape over `pushWatch` at 928-929. They assert that the completion
  wait precedes the scan, which is a real and load-bearing property — and they assert it by comparing
  offsets in a string, so they are source inspection by P033's own definition and the conversion must reach
  them too.

**The first figure written here was 21, and how it was wrong is worth keeping.** It came from a script that
matched `assert.<method>(<var>,` and therefore could not see an assertion whose subject is an _expression
over_ the source rather than the source itself. That is the third counting predicate in this work to
under-count by missing a shape nobody had enumerated — the same failure P033 records when it withdrew every
repo-wide tally. Corrected by the risk review before this ticket landed, and stated here rather than
silently amended.

**Why this is a bigger job than the `deploy.sh` conversion that closed the rest of the shell task.**
`deploy.sh` needed one shadowed binary and the whole conversion fit in a single test file.
`release-watch.sh` is 509 lines with **25 `gh` invocations, 13 `git` and 12 `npm`**;
`push-and-watch.sh` is another 240. The stub is not a binary, it is a canned GitHub surface: run states,
job lists, conclusions and PR checks, each shaped to drive a specific branch of a state machine.

## Off-the-shelf tooling — measured 2026-08-21, both legs, before recommending anything

The obvious hope is an HTTP-level mock: point the watcher's `gh` at a local server and reuse standard
tooling. **It does not work here, and the reason is worth recording so nobody re-derives it.**

1. **`gh` does honour `GH_HOST`.** With `GH_HOST=127.0.0.1:<port>` it targets
   `https://127.0.0.1:<port>/api/v3/...` — the enterprise path prefix. So the interception point exists.
2. **It refuses plain HTTP.** A `node:http` stub returns
   `http: server gave HTTP response to HTTPS client`. The request never reaches the handler.
3. **It refuses a self-signed HTTPS stub, and `SSL_CERT_FILE` does not rescue it on macOS.** With a
   generated CA and `SSL_CERT_FILE` pointed at it, `gh` still fails with
   `x509: certificate signed by unknown authority` — Go on Darwin uses the system verifier, so trusting
   the stub would mean installing a CA into the login keychain. That is not an acceptable cost for a unit
   test, and it would not hold on a CI runner without extra setup.

**So the HTTP-mocking family — `nock`, `msw`, `polly`, record/replay proxies — is ruled OUT.** It is not
that they are unsuitable in principle; it is that `gh` is a subprocess that forces TLS and will not trust a
local certificate on this platform. Ruled out by measurement rather than by taste.

**Two candidates remain, and the first has a working precedent in this repo as of today:**

- **Shadow `gh` on `PATH`**, exactly as `deploy-sh-plan-only.test.mjs` shadows `terraform`: a stub script
  earlier on `PATH` that records its arguments and returns canned stdout per subcommand. No TLS, no
  certificates, no new dependency, and the recorded call list becomes the assertion surface — which is what
  makes the resulting assertion behavioural rather than textual. Cost: the canned JSON is hand-written, so
  the fixtures are the thing most likely to be subtly wrong.
- **A shell test framework with binary mocking** — `bats-core` + `bats-mock`, or `shellspec`, which has
  mocking built in. These do exactly this job off the shelf. Cost: **addressr has no bats or shellspec
  today** — every test in this repo is `node:test` — so adopting one adds a second test runner, a second
  reporting format and a second thing CI must install. The wr-* plugins use bats, so the idiom is familiar
  in the wider tree, but familiarity is not the same as it belonging here.

**Recommendation, stated so it can be argued with**: shadow `gh` on `PATH` from `node:test`, reusing the
harness shape already proved against `deploy.sh`. It adds no dependency, keeps one runner, and the
precedent is fresh. Revisit `shellspec` only if the fixture surface turns out to need more structure than a
stub script can carry.

## Symptoms

1. A watcher's decision logic can be rewritten to a different, broken decision while every pin stays green,
   provided the pinned strings survive somewhere in the file.
2. The pins cannot distinguish a branch that exists from a branch that is reached — the specific gap that
   let R023's false green through.

## Workaround

The pins are not useless while they stand: they still catch outright deletion of the text they match, and
one class they cover is genuinely beyond a fixture suite — a watcher growing a private re-inlined copy of
the shared scan that drifts from the tested one. Keep them until each is replaced. **Do not delete a pin
before its replacement is proved**, which is P033's standing rule and the reason the `deploy.sh` conversion
was additive-then-subtractive.

## Impact Assessment

- **Who is affected**: the maintainer, on every release. No consumer or runtime path — the watchers observe
  a release, they do not perform it.
- **Frequency**: every release watch.
- **Severity**: Moderate. A false green is believed, and it is believed at the moment the operator stops
  paying attention.
- **Analytics**: N/A.

## Root Cause Analysis

Root cause is P033's, unchanged: a text assertion over source cannot establish that the source runs. What is
specific to this ticket is why it was left until last — the subject is a 749-line pair of shell scripts whose
observable behaviour is mediated entirely through `gh`, so there was no cheap harness until one was proved.
There is now.

### Investigation Tasks

- [ ] Build the `gh` stub on the `deploy-sh-plan-only.test.mjs` pattern: shadowed on `PATH`, recording its
      argv, returning canned stdout keyed by subcommand.
- [ ] Convert the 13 `release-watch.sh` assertions, additive-then-subtractive, each mutation-proved in BOTH
      directions — text-negating for deletion-safety, text-preserving for coverage.
- [ ] Convert the 8 `push-and-watch.sh` assertions the same way.
- [ ] Convert the **2 ordering checks** as well — they are not in the 21 and a conversion that stops at the
      pattern pins leaves them behind. Behaviourally the property is observable: drive the watcher against a
      run that is still in progress and assert it waits rather than scanning, which an offset comparison
      cannot distinguish from a script that merely mentions both in that order.
- [ ] Keep the re-inlined-copy guard. It is the one property a stub cannot see, so it stays a text
      assertion with an explicit note saying what it cannot establish.
- [ ] Re-check the `shellspec` option before writing the third fixture, not after. If the canned surface is
      already unwieldy by then, the second-runner cost may be the cheaper side of the trade.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P033

## Related

- **[P033](../closed/033-source-inspection-tests-anti-pattern.md)** — the parent Known Error. Its shell
  task named five files; three were never in the population or converted on 2026-08-21, and this is the
  remainder. Split out rather than left in place because P033 is XL and this is L, so leaving it there
  priced it at the parent's divisor.
- **RFC-009** — the conversion plan and the two-direction mutation rule these conversions must satisfy.
- **R023** (`docs/risks/R023-release-watch-reports-success-when-docker-publish-job-fails.active.md`) — the
  live risk entry these pins are the control for, including the run where the false green actually fired.
- **P085** — the false-green class, and the ticket that produced `scripts/scan-jobs.awk` in the first place.
- **`test/js/__tests__/deploy-sh-plan-only.test.mjs`** — the working precedent for the recommended harness.
- **`test/js/__tests__/scan-jobs-awk.test.mjs`** — the shape the conversion is aiming at: feed the real
  thing inputs, assert the exit code. Two pins were retired against it on 2026-08-21 once it was measured
  to dominate them.
