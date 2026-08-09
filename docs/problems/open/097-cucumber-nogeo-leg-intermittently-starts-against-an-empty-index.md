# Problem 097: The cucumber nogeo leg intermittently starts against an empty index

**Status**: Open
**Reported**: 2026-08-09
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Unlikely (2). Impact 3: it fails the release gate, so no version can be published or deployed until someone re-runs it — the RISK-POLICY level-3 clause, with existing installs and the live service unaffected. Not 4: nothing reaches production, and `fail-fast` means the run stops immediately rather than reporting partial coverage. See Rating notes below.
**Origin**: internal — observed 2026-08-09, run `31284588346`
**Effort**: M — the fix is unknown until the race is characterised; the investigation is the work
**WSJF**: 3.0 — (6 × 1.0) / 2
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Rating notes

**Likelihood 2, and the denominator is thin — stated rather than implied.** Observed once, on run `31284588346`, against roughly a dozen full matrix runs on 2026-08-09. Two things stop that being firm evidence for 2 over 3. The denominator is a same-day count, not a historical one. And `--fail-fast` destroys the evidence that would distinguish "index empty" from "one scenario genuinely wrong", so earlier instances may have been mis-attributed rather than absent — the same under-observation bias this ticket's Investigation Task 3 names. Re-rate to 3 if a second instance appears, and treat the absence of prior sightings as weak.

**This Priority prices the first-order effect only: the gate blocks and someone re-runs.** It does NOT price the desensitisation cost the Workaround and Impact Assessment describe — a real regression waved through by a reflexive re-run reaches RapidAPI consumers, which is Impact 4 under the policy, at a much lower likelihood and through a longer causal chain. Those are two different risks and averaging them into one cell would lose both. Recorded here so the number is not read as covering it.

## Description

`build-and-test (2.19.5)` failed at `Run tests (no geo)` while `build-and-test (3.5.0)` passed on the identical commit. The very first search scenario returned zero addresses and, under `--fail-fast`, took the rest of the run with it:

```
Failed scenarios:
  1) Search # test/resources/features/addressv2.feature:27
       Then the returned address list will contain many addresses
           AssertionError: expected [] not to be empty

37 scenarios (2 passed, 34 skipped, 1 failed)
```

Re-running the failed job on the same commit passed. So it is intermittent, and it is not the commit under test — that push was a devDependency upgrade (`js-yaml`) that the cucumber tier does not use.

## Symptoms

- One OpenSearch matrix leg red, the other green, same SHA.
- The failing assertion is a search returning `[]` — an empty or unready index, not a wrong result.
- `fail-fast` skips 34 of 37 scenarios, so the log shows one failure and no further signal.
- Re-run of the same job on the same SHA is green.

## What has been ruled out

**The fixture is present and correct.** The `Prepare OT test fixture` step succeeded and its listing shows the expected files — the Authority Code tables plus `OT_*` Standard tables. The G-NAF zip cache restored successfully.

**`Counts.csv` is a red herring.** The log carries `Error: ENOENT: no such file or directory, access 'target/gnaf-fixture/Counts.csv'` at error level, which reads alarming and is not the failure. `loadGnafData()` in `service/address-service.js` treats that file as optional and falls back to `getFiles()` when it is absent. The fixture has never contained it. Do not start here.

**Not the change under test.** The push was `js-yaml` 4 to 5, a devDependency used only by three workflow-parsing tests in the `test:js` tier. It cannot reach the cucumber tier.

## Root Cause Analysis

Not established. The shape — index empty on the first query, on one backend version only, non-reproducible — points at a race between the loader finishing and the first query running, rather than at a load failure. Two candidates worth separating:

1. **The loader completed but OpenSearch had not refreshed.** A search issued before the index refresh interval elapses returns nothing on a freshly-written index. If the harness waits on the loader process exiting rather than on a refresh or a document count, that gap is real and version-sensitive.
2. **The server was ready before the index was.** `waitport` in `test/js/world.js` waits on the TCP port only, which is the same blind spot P094 recorded from a different angle — the port opening says nothing about the index behind it.

Candidate 2 is the more interesting one because it is a known instrument gap in this repo rather than a new hypothesis, and it predicts exactly this symptom: first query, empty result, timing-dependent, no error anywhere.

## Investigation Tasks

- [ ] Determine whether the two OpenSearch versions differ in default refresh behaviour, or whether the 2.19.5 leg is simply the slower one and the race is version-agnostic.
- [ ] Add a readiness precondition to the cucumber `Before` hook that asserts a known OT document is retrievable, not merely that the port is open. This is the same fix P094's residue names, and it would convert this failure from an assertion deep in a scenario into a loud, specific setup failure.
- [ ] File the second-order desensitisation cost as its own standing risk in `docs/risks/`, or attach it to R023 (gate-signal trust from the lying-green side; this is the crying-wolf side). The Rating notes above exclude it from this ticket's Priority deliberately, and an exclusion with no carrier is a deferral into prose — it discharges when the entry exists, not when it is planned. Deliberately NOT bundled into the retro commit that raised it: a curated above-appetite entry moves the register's above-appetite partition, which the bolded-partition invariant enforces across `docs/`, and that is a batch of its own.
- [ ] Decide whether `--fail-fast` is right for this tier. It saves CI minutes and it also destroys the evidence needed to tell "index empty" from "one scenario wrong" — here it skipped 34 scenarios that would have distinguished them.

## Workaround

Re-run the failed job. It passed on the first re-run. This is a procedural control and is not credited as a fix — an intermittent red on a release gate trains people to re-run reflexively, which is how a real regression gets waved through.

## Impact Assessment

It blocks the release gate. The `release` job depends on `build-and-test`, so a red leg means no publish and no deploy until someone notices and re-runs. The worse cost is the one the workaround creates: an intermittent failure on a gate teaches everyone that red does not necessarily mean broken.

## Related

- [P094](../closed/094-published-package-with-geo-enabled-is-tested-by-nothing.md) — its recorded residue is that `waitport` waits on the port only and cannot see the index behind it. Candidate 2 above is that same gap producing a different symptom, which is why the readiness-precondition task appears on both.
