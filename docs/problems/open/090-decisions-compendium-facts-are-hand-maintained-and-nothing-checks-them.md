# Problem 090: Decisions compendium facts are hand-maintained and nothing checks them

**Status**: Open
**Reported**: 2026-08-07
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3) — derived at capture. Impact 2 per [RISK-POLICY](../../../RISK-POLICY.md) § Impact level 2: no runtime, publish or consumer path. It is not Impact 1 because `docs/decisions/README.md` is the surface the architect agent reads first for routine compliance review, so a false fact there misleads a machine consumer, not just a human skimming. Likelihood 3: two instances landed on 2026-08-07 alone, and the only standing control is a comment asking a human to check three places.
**Origin**: internal
**Effort**: M — derived at capture: one test asserting the three count claims against the filesystem plus `ADR-NNN` token resolution, mutation-proved. Same shape as the existing register-invariant test, one tree over — cf. P084 (M).
**WSJF**: 3.0 — (6 × 1.0) / 2
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`docs/decisions/README.md` carries facts that are written by hand or derived by a hook, and no test checks any of them. Two defects landed on 2026-08-07, both found by risk review rather than by any gate:

1. **Count drift.** When ADR-042 landed, the total was hand-corrected from "41 (37 in-force, 4 historical)" to "42 (38 in-force, 4 historical)", but the section subheading beneath it still read "_37 ADRs._". One of the two restatements was updated. This is the intra-file-restatement class recorded in [R028 register curation is unmechanised so it drifts against itself](../../risks/R028-register-curation-unmechanised-so-it-drifts-against-itself.active.md), which is scoped to `docs/risks/` and therefore does not cover this tree.

2. **A phantom cross-reference.** ADR-029's Related line read `… ADR-034, ADR-041, ADR-074`. **There is no ADR-074** — the tree holds 42. It is a mis-derivation from P074, a problem ticket that landed in the same window. ADR-029's own Related section lists no such reference, so the token entered via the hook's inbound-reference derivation.

A third, adjacent instance occurred in the same session on an ADR body rather than the compendium: ADR-042's Reassessment Criterion 4 located a criterion it had landed on ADR-025 as "the fifth bullet" when it is the fourth, and the same sentence said ADR-025 had "three existing criteria". Three plus one is four. Both statements were in the remediation for a _previous_ false cross-ADR assertion.

**A fourth instance occurred inside this ticket, on its first draft.** The Workaround section below linked R004 as `R004-business-metrics-in-public-repo.active.md`; the file is `R004-traffic-sample-counts-in-public-adr-prose.active.md`. Risk review caught it before commit. Unlike the three above it would have been caught by `doc-links-resolve.test.mjs` — as a red build on master, not as a pre-commit signal, since no hook resolves `docs/**` links.

That is four instances of one class in a single day, the last two occurring inside the remediation for the first two. It is the strongest evidence this ticket has, and it is why the Likelihood is rated on observed recurrence rather than on judgement.

## Symptoms

- A count claim in the compendium disagrees with the filesystem, or with another count claim in the same file.
- A Related line names an `ADR-NNN` that does not exist.
- A cross-ADR reference locates its target by ordinal position, which goes silently false the moment a bullet or criterion lands ahead of it.
- None of the above fails anything. `test/js/__tests__/doc-links-resolve.test.mjs` resolves markdown link **targets**, and its own header names the gap: it does not catch a link that resolves but points at the wrong artefact. Compendium Related entries are bare tokens, not links, so it never sees them.

## Workaround

Risk review caught every instance. That is a person reading carefully, which does not scale and is the control shape [R004 traffic sample counts in public ADR prose](../../risks/R004-traffic-sample-counts-in-public-adr-prose.active.md) and R028 both refuse to credit.

## Impact Assessment

- **Who is affected**: the maintainer, and the architect agent, which reads this file first on every routine compliance review.
- **Frequency**: twice in one day on the compendium, plus one positional-reference instance on an ADR body.
- **Severity**: Minor. Governance-record accuracy only. The compounding cost is that a false fact in a governance index is trusted precisely because it looks derived.
- **Analytics**: N/A.

## Root Cause Analysis

### Preliminary observation

The compendium is generated, but generation is not the whole story here: the standalone generator is destructive in this repo (it strips hook-authored entries), so the working practice is hook-writes-entries plus hand-corrects-counts. That split leaves the counts and the derived Related lines with no producer that can be re-run and diffed, and no consumer that validates them.

`test/js/__tests__/risk-register-invariants.test.mjs` demonstrates the fix shape for the sibling tree: it asserts declared canonical state and bans positional references in `docs/risks/`. Nothing equivalent exists for `docs/decisions/`.

### Investigation Tasks

- [ ] Investigate root cause: confirm whether the phantom `ADR-074` came from the compendium-refresh hook's inbound-reference derivation, and whether it can distinguish `ADR-NNN` from `P-NNN`
- [ ] Add an invariant asserting the three count claims (total, in-force, historical) agree with the filesystem
- [ ] Add an invariant asserting every `ADR-NNN` token in a Related line resolves to a file
- [ ] Consider banning ordinal cross-references ("the fifth bullet") in `docs/decisions/`, matching the existing ban in the register test
- [ ] Mutation-prove each: revert the in-force count to 37, re-insert `ADR-074`, and confirm both fail
- [ ] Extend the check to **absolute** links, which nothing validates today. `doc-links-resolve.test.mjs` resolves relative paths only, so `https://github.com/...` URLs have never been checked. On 2026-08-07 this surfaced nine dead links across four files plus one in `CHANGELOG.md`, all pointing at `tompahoward/addressr` — an org/repo that does not resolve at all (`gh repo view` returns "Could not resolve to a Repository"). They had been accumulating undetected, and one of them was in the repo's most-read file. The convention itself is settled per maintainer direction 2026-08-07: **relative for documents in this repo, absolute for GitHub issues** (GitHub resolves relative links against the file's location and cannot reach `/issues/`, so an issue link has no relative form). A check could assert that shape as well as reachability — an absolute `github.com/<owner>/<repo>/blob|tree` link pointing at _this_ repo is a convention violation, since it should be relative.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: [P089 No file-length lint rule, so two source files have grown past 1000 lines](089-no-file-length-lint-rule-so-two-source-files-have-grown-past-1000-lines.md) — both are missing mechanical checks on a surface that is currently maintained by attention.

## Related

Captured via `/wr-itil:capture-problem` on a risk-review remediation recommendation.

- [R028 register curation is unmechanised so it drifts against itself](../../risks/R028-register-curation-unmechanised-so-it-drifts-against-itself.active.md) — the same class, scoped to `docs/risks/`; this ticket is that class running uncontrolled one tree over.
- `test/js/__tests__/risk-register-invariants.test.mjs` — the fix shape, already built for the sibling tree.
- `test/js/__tests__/doc-links-resolve.test.mjs` — resolves link targets; its header names the wrong-artefact gap this ticket sits in.
- [ADR-042 Anchored span phrase clause for street-level-first ranking](../../decisions/042-anchored-span-phrase-clause-for-street-level-first-ranking.proposed.md) and [ADR-025 Symmetric ssla Indexing for Search Ranking](../../decisions/025-search-ranking-symmetric-ssla.accepted.md) — the ADRs whose landing surfaced all three instances.
