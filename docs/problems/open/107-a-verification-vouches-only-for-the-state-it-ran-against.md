# Problem 107: A verification vouches only for the state it ran against

**Status**: Open
**Reported**: 2026-08-19
**Priority**: 16 (High) — Impact: 4 × Likelihood: 4 — rescored 2026-08-19, same day as capture, from
8 (2×4). **The first Impact scored what luck spared, not what was exposed.** It read 2 because the realised
cost was developer-facing — but instance 2 below is a production deploy verification, and had that cached
200 been reported as proof (it very nearly was), a failed production deploy would have been believed
successful. That is Impact 4. The ticket's own text concedes two of three instances were caught "by luck
rather than by a control", and scoring the luck is exactly the error.
The precedent is decisive: **R023, the register entry this hangs off, scores its class at the higher of the
two instances.** Inheriting that family and then applying the opposite rule was inconsistent.
Likelihood 4 stands on observation, not estimate: three instances, one day, three surfaces.

**Origin**: internal
**Effort**: M — the mechanical half is small and already partly landed; deciding the general discipline is
the larger part, and it touches how every verification in the session is reported.
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

A check reports on the state it ran against. Nothing binds that state to the commit the check is then
cited as certifying, so a verification can be truthful, complete, and about the wrong moment.

This is a distinct defect from the ones already tracked. In P104, P106, P098, P103 and P101 the check
**did not examine** what it reported on — an empty sample set, an empty dependency tree, no runner, no
guard, no reader. Here the check examined exactly the right thing, correctly and completely. It was simply
run before the change it was taken as validating.

### Evidence — three instances, one day, three surfaces

1. **A shipped artefact.** `license-checker` was removed from the root `devDependencies` and the
   `check-licenses` script repointed. The change was reported as verified, citing
   `npx npm@10 install --package-lock-only` — but that reconciliation had run **earlier in the sequence**,
   before the removal. Commit `78253ee4` therefore shipped a `package.json` not declaring `license-checker`
   beside a `package-lock.json` still carrying its node, so `npm ci` installed ~20 undeclared packages.
   Dev-only; nothing reached the published package.
   **The cost was not the artefact but the confusion.** Those extraneous packages later surfaced as two
   phantom "production licence violations" while the replacement licence audit was being built, and were
   first blamed on local dirty state rather than on something already shipped.
2. **A production check.** After releasing 3.3.1, a live API query returned 200 with correct results. It
   was one sentence from being reported as proof of a successful deploy. The headers said
   `cf-cache-status: HIT`, `age: 318001`, `etag: W/"3.3.0-…"` — a Cloudflare cache hit **3.7 days old**,
   from before the deploy. Only an uncached query showed `3.3.1` live.
3. **A risk score.** A scoring pass was dispatched against a staged set; further edits followed. The score
   described a set that no longer existed by the time it was read.

## Symptoms

1. A verification is reported with more authority than it holds, because the state it covered is implicit.
2. The failure is invisible in the direction that matters: the check is green and honest, so nothing
   prompts a re-read.
3. Downstream investigation is misdirected — instance 1 above cost a wrong diagnosis before the real cause
   was found.

## Workaround

Re-read what the check actually ran against before citing it, and re-run it as the last action before
staging. Operator memory, which is what JTBD-400's checkable-artefacts outcome exists to remove.

## Impact Assessment

- **Who is affected**: the maintainer, and anyone reading a report that cites a verification.
- **Frequency**: three times on 2026-08-19. Unknown before that, because the failure leaves no trace.
- **Severity**: Minor so far. Every instance to date was caught before user-visible harm, twice by luck
  rather than by a control.
- **Analytics**: 3 instances, 3 surfaces (lockfile, HTTP cache, risk score), 1 shipped artefact, 0 end-user impact.

## Root Cause Analysis

A verification and the change it certifies are related only by narration. Nothing records _what_ a check
ran against, so a claim that "this was verified" cannot be checked against the thing being shipped.

The three instances share that root but differ in how the state went stale: an edit landed after the check
(1), an intermediary served an older answer (2), and the subject moved after dispatch (3). Any remedy that
only addresses one of those leaves the class open.

### Investigation Tasks

- [x] **Land the mechanically-checkable half. DONE 2026-08-19.**
      `test/js/__tests__/lockfile-agrees-with-manifests.test.mjs` asserts the lockfile's mirror of every
      workspace manifest matches that manifest exactly, in both directions. Verified against the released
      commit `78253ee4` rather than asserted: it fails that commit, naming `license-checker`. It reads both
      files at test time, so it cannot itself go stale — which is the property the thing it replaces lacked.
- [ ] Decide the general discipline for the other two shapes, which no test covers:
      **(a)** an intermediary serving an older answer — read `cf-cache-status` / `age` / the version in the
      `etag` before believing a live check, and force a cache miss;
      **(b)** a check dispatched against a moving subject — record the SHA or staged-tree hash a
      verification ran against, and compare it before citing the result.
- [ ] Establish whether "re-run as the last action before staging" is sufficient on its own, or whether it
      just relocates the ordering problem. It is a discipline, not a control, and disciplines are what
      failed here.
- [ ] Sweep for other verifications cited in this repo's records whose stated evidence may predate the
      change it vouches for.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: the class cluster below.

## Related

- **P106** ([`106-license-compliance-gate-scans-an-empty-tree-and-exits-zero.md`](106-license-compliance-gate-scans-an-empty-tree-and-exits-zero.md))
  — the context instance 1 arose in, and the ticket whose own new audit exposed it. **Not the parent**: P106's
  defect is a scope assumption inside a licence tool and all its tasks are tool-bound, whereas this applies
  unchanged to a test run, a risk score or a production probe. The one-off lockfile reconciliation rides with
  the licence-gate work; the durable assertion belongs here.
- **P104**, **P098**, **P103**, **P101** — siblings, not parents. Hang-off check returned PROCEED_NEW against
  all five candidates on the grounds that each of their defects is _a check that did not examine what it
  reported on_, while this one examined it correctly at the wrong time, and their fix loci are all inside
  their own tool.
- **R023** (pipeline watchers report success on a red run) — owns the family at register level, scoped by its
  H1 to the class rather than to any one script. The family now has five distinct members: **empty-corpus**
  (P106, P104), **never-ran** (P098), **no-guard** (P103), **no-reader** (P101), and **stale-state** (this).
  **The five are 4+1, not five peers**, and the distinction is the point: empty-corpus, never-ran, no-guard
  and no-reader are all fixed by making the check _cover its subject_; stale-state is fixed by _binding the
  check to a state identifier_. Four remedies of one kind, one of another. Worth clustering at the next
  `/wr-itil:review-problems` rather than absorbing.
- **A sixth instance, in the risk pipeline's own record.** `.risk-reports/` holds 33 files dated 2026-08-17
  to 2026-08-19, of which **22 are one byte** — a bare newline — while `docs/risks/` Evidence Logs cite that
  directory as evidence and the ADR-056 drain reads it as a corpus. The populated 11 cluster before
  2026-08-19T00:59; everything after is blank, which correlates with scorers dispatched as background agents
  (the P402 shape). A directory of 33 files reads as a populated record at a glance. Not yet a ticket of its
  own — it is an empty-record defect rather than this ticket's ordering one — and it is named here so it is
  not lost. Quantified deliberately: a first check using `find -size +0` reported all 33 as non-empty, because
  that predicate means "more than zero blocks" and a 1-byte file occupies one. The check could not have
  failed. That is this ticket's own class, committed while writing this ticket.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer`.

Captured via `/wr-itil:capture-problem` after a risk-scoring pass named the ordering defect behind a lockfile
inconsistency as a recurrence class rather than an incident.
