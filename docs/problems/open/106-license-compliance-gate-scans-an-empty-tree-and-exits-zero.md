# Problem 106: The license compliance gate scans an empty tree and exits 0

**Status**: Open
**Reported**: 2026-08-19
**Priority**: 12 (High) — Impact: 3 × Likelihood: 4 — rescored 2026-08-19, same day as capture, from
10 (2×5). **The first rating was the mirror of the error it was trying to avoid.** It set Impact 2 on the
grounds that "no violation has actually shipped" — but that is a statement about how _likely_ the harm is,
not about what the harm _costs_. P104 pulled Impact up from the harm chain; this pulled Impact down from the
absence of harm. Both put the two axes on different events.
The test that settles it: with Impact pinned to "an absent control over build tooling", a blind licence gate
and a blind lint gate score identically, because Impact is the only axis where _what the control guards_ can
enter. Impact 3 because a non-conforming licence does not stay in the tooling — it travels inside the
published package to consumers, which is Impact 3's public-artefact-exposure clause ("requires immediate
remediation … does not affect service availability"). Not Impact 5, which is reserved for a security
vulnerability; a licence defect is not one.
Likelihood 4, not 5: the gate is blind on every invocation, but the empirically clean tree belongs on **this**
axis, and most of the ecosystem is permissive.

Two sites carried the superseded reasoning after the rescore and were corrected the same day: the Evidence
section's "no live violation" claim, and the Impact Assessment's Severity line, which still read "Minor
today, because the tree is in fact clean" — the repudiated form (impact judged from the absence of realised
harm) surviving in the ticket that records it as the error. Noted here because the correction is where the
next error enters, and this one entered twice.

**Origin**: internal
**Effort**: M — larger than P105 despite being the same origin, because the correct invocation is not yet
known (see Investigation Tasks) and the control also needs a CI home it has never had.
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`package.json:99` defines the license compliance gate:

```
check-licenses: license-checker --production --onlyAllow '<13-license allow-list>' --summary
```

The root manifest is `private` and has **zero** production dependencies — the ADR-046 workspace restructure
moved them into `packages/addressr`. So `--production` resolves an empty set. license-checker prints

```
Found error: No packages found in this path..
```

and **exits 0**. The pre-commit hook reads that as a pass and continues to the next task.

The published package's resolved production tree is **234 packages. The gate checks 0 of them.**

### The control is thinner than it looks

The only caller is the local pre-commit hook at `package.json:100`. **CI runs no license check at all** — a
grep across `.github`, `.husky` and every `package.json` returns only those two lines plus the devDependency
declaration. So the entire license control for a published, revenue-generating package is one local hook,
which is also bypassable with `--no-verify`.

### Evidence

- Reproduced: `npm run check-licenses; echo $?` → prints the error, `EXIT=0`.
- Root production dependency count goes **19 → 0** across `a3261242` → `8199e5b9`, both 2026-08-10 — the
  ADR-046 restructure. The gate has been blind for 9 days at capture.

**No breach found, and the method's limits stated so the claim does not outrun them.** All four packages a
hand check flagged would **pass** the allow-list once the gate is pointed at the right tree — verified by
running license-checker against the resolved tree and reading what it reports for each. But one of the four
passes for a reason that is not a licence:

| Package             | license-checker reports                              | Verdict                                                                           |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `spawndamnit@3.0.1` | `MIT*`                                               | Fine. Manifest says `SEE LICENSE IN LICENSE`; the `LICENSE` file is verbatim MIT. |
| `chainsaw@0.1.0`    | `MIT*`                                               | Fine. Manifest declares `MIT/X11`, an older spelling of MIT.                      |
| `traverse@0.3.9`    | `MIT*`                                               | Fine. Same, and it ships a LICENSE file.                                          |
| `buffers@0.1.1`     | `Custom: http://github.com/substack/node-bufferlist` | **Not fine, and the allow-list hides it.**                                        |

**`buffers@0.1.1` carries no licence grant of any kind** — no `license` field, no `licenses` field, no LICENSE
file. The string license-checker reports is scraped from **line 10 of its README**, a sentence saying the
package is "a cleaner more Buffery rehash of [bufferlist](http://github.com/substack/node-bufferlist)". That
URL names a _different_ package, which is not in this tree at all. So the allow-list's thirteenth entry,
`Custom: http://github.com/substack/node-bufferlist`, allow-lists a README hyperlink rather than a licence,
and the gate is configured to wave through the one package in the set that has no licence.

The first version of this ticket filed `buffers` as the most obviously benign of the four. It is the least.

**What this method does and does not support.** It reads each resolved package's `package.json` licence
fields, falling back to the LICENSE file where the manifest defers to it. That has a known blind spot, and
`buffers` is standing in it: a field-reading pass returns _nothing_ for a package that declares nothing, and
"nothing" is easy to resolve to "fine". The matcher's recall against SPDX expression forms
(`(MIT OR Apache-2.0)`), bare `BSD`, `Apache 2.0` spelling variants and `UNLICENSED` was not established.
So: **no breach was found**, which is weaker than "the tree is clean", and deliberately so.

**Count**: the resolved production tree is **234 packages**. An earlier draft said 235 in two places; that was
the path count from `npm ls --parseable`, whose first line is the repository root rather than a package.

## Symptoms

1. A compliance gate reports success having examined nothing.
2. A non-conforming license could enter the published package and the Docker image with no signal.
3. The failure is _louder_ than silence and still ignored: license-checker prints `Found error:` on every
   single commit, and the exit code says pass, so the text scrolls past unread.
4. No CI coverage at all, so the control does not survive `--no-verify` or a contributor without hooks.

## Workaround

Run the check by hand against the real tree. At capture that meant enumerating
`npm ls -w @mountainpass/addressr --omit=dev --all --parseable`, dropping its first line (the repository
root, not a package), and reading each `package.json` licence field, because no `license-checker` invocation
tried produces that set. Operator memory, which is what
JTBD-400's checkable-artefacts outcome exists to remove.

## Impact Assessment

- **Who is affected**: the maintainer, and any consumer relying on the package's stated license posture.
- **Frequency**: every invocation since 2026-08-10.
- **Severity**: Moderate, matching Impact 3 above. The only automated control over what licences reach a
  published artefact checks nothing, and `buffers@0.1.1` ships with no licence grant, admitted by an
  allow-list entry that is a README hyperlink rather than a licence.
- **Analytics**: 234 production packages in scope, 0 checked, 9 days, 1 bypassable local caller, 0 CI callers.

## Root Cause Analysis

**A scope assumption rotted, not a path.** This is the distinction from its siblings: `check-licenses`
resolves fine and executes fine. What broke is the assumption behind `--production` — that the root manifest
is where the production dependencies live. ADR-046 emptied it. A referrer guard would report this gate
healthy, because nothing about it fails to resolve.

**And the empty result was reported as success.** license-checker exits 0 on "No packages found", so the
empty-corpus case is indistinguishable from the all-clear case at the exit-code layer that the hook reads.

### Investigation Tasks

- [ ] **Determine the correct invocation — this is genuinely open, not a known fix.** license-checker's flag
      handling is inconsistent: `--start <dir>` silently nullifies `--production` (both
      `--start packages/addressr --production` and the bare invocation return the identical 777-package tree
      including dev dependencies), and adding `--onlyAllow` changes the scanned set again. No invocation tried
      yields the published package's 234-package production set. Replacing license-checker is on the table.
- [ ] Assert a non-empty corpus, so "no packages found" fails instead of passing. Whatever tool is chosen,
      the floor has to be asserted outside it — the same requirement ADR-048 criterion 5 records, and the
      same fix applied to the npm-run guard and doc-links on 2026-08-18.
- [ ] **Give the gate a CI home.** A compliance control that exists only in a bypassable local hook is not a
      control. This is arguably the larger half of the ticket.
- [ ] **Remove or justify the `Custom: http://github.com/substack/node-bufferlist` allow-list entry.** It
      admits a package with no licence grant, on the strength of a README hyperlink to a different project.
      Whatever replaces the gate keeps passing `buffers@0.1.1` until this entry is dealt with, so fixing the
      invocation alone leaves the one real exposure in place.
- [ ] Establish `buffers@0.1.1`'s actual licence position — it reaches the tree transitively, so the options
      are upstream clarification, replacement, or an accepted-and-recorded risk. Do not close it by allow-list.
- [ ] Decide whether the allow-list should tolerate `MIT/X11` and `SEE LICENSE IN LICENSE` explicitly, since
      all of today's candidates needed a human read to clear.
- [ ] Re-run the clearance with a recorded, re-derivable matcher covering SPDX expressions, bare `BSD`,
      `Apache 2.0` spelling variants and `UNLICENSED`, so the result is reproducible rather than asserted.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: the ADR-046 restructure collateral family, and the empty-corpus-passes class below.

## Related

- **P105** ([`105-changesets-cli-ships-as-a-production-dependency-of-the-published-package.md`](105-changesets-cli-ships-as-a-production-dependency-of-the-published-package.md))
  — found in the same sitting, same origin commit `8199e5b9`, and **they compose in the safe direction**.
  `spawndamnit@3.0.1` — one of the four packages this ticket had to hand-clear — is in the production tree
  _only_ via `@changesets/git` via `@changesets/cli`. The whole `@changesets` subtree sits inside the
  234-package corpus quoted above for the same reason. So P105's fix shrinks this ticket's problem rather
  than merely sitting beside it, and **P105 should be done first** — for that reason, not for its effort.
- **P104** ([`104-perf-probe-retrieve-threshold-passes-on-zero-samples.md`](../closed/104-perf-probe-retrieve-threshold-passes-on-zero-samples.md))
  and **P103** ([`103-workflow-referrers-outside-guard-coverage-rot-unseen.md`](103-workflow-referrers-outside-guard-coverage-rot-unseen.md))
  — **siblings of one class, none of them its parent**: a check reporting success on something it never
  examined. Hang-off check returned PROCEED_NEW against both, plus P098 and P101, on the grounds that a class
  is not a parent and every candidate's fix locus is a different file with a different remedy. Recommend
  `/wr-itil:review-problems` cluster these rather than absorb any into another.
- **R023** — owns the class at register level, scoped by its H1 rather than to the script that triggered it.
- **ADR-048** ([`048-moved-path-referrers-resolved-by-executable-guard.proposed.md`](../../decisions/048-moved-path-referrers-resolved-by-executable-guard.proposed.md))
  — criterion 5 requires guards to carry non-empty floors.
- **ADR-046** ([`046-packages-are-distributable-apps-are-deployed.proposed.md`](../../decisions/046-packages-are-distributable-apps-are-deployed.proposed.md))
  — the restructure that emptied the root manifest of production dependencies.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer`.

Captured via `/wr-itil:capture-problem` after the pre-commit output printed `Found error:` and the commit
succeeded anyway.
