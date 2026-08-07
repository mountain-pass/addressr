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

`docs/decisions/README.md` carries facts that are written by hand or derived by a hook. **Nothing checked any of them until 2026-08-07** — see Resolution progress; the structural half is now mechanised and the ordinal-reference half is not. Two defects landed on 2026-08-07, both found by risk review rather than by any gate:

1. **Count drift.** When ADR-042 landed, the total was hand-corrected from "41 (37 in-force, 4 historical)" to "42 (38 in-force, 4 historical)", but the section subheading beneath it still read "_37 ADRs._". One of the two restatements was updated. This is the intra-file-restatement class recorded in [R028 register curation is unmechanised so it drifts against itself](../../risks/R028-register-curation-unmechanised-so-it-drifts-against-itself.active.md), which is scoped to `docs/risks/` and therefore does not cover this tree.

2. **A phantom cross-reference.** ADR-029's Related line read `… ADR-034, ADR-041, ADR-074`. **There is no ADR-074** — the tree holds 42. It is a mis-derivation from P074, a problem ticket that landed in the same window. ADR-029's own Related section lists no such reference, so the token entered via the hook's inbound-reference derivation.

A third, adjacent instance occurred in the same session on an ADR body rather than the compendium: ADR-042's Reassessment Criterion 4 located a criterion it had landed on ADR-025 as "the fifth bullet" when it is the fourth, and the same sentence said ADR-025 had "three existing criteria". Three plus one is four. Both statements were in the remediation for a _previous_ false cross-ADR assertion.

**A fourth instance occurred inside this ticket, on its first draft.** The Workaround section below linked R004 as `R004-business-metrics-in-public-repo.active.md`; the file is `R004-traffic-sample-counts-in-public-adr-prose.active.md`. Risk review caught it before commit. Unlike the three above it would have been caught by `doc-links-resolve.test.mjs` — as a red build on master, not as a pre-commit signal, since no hook resolves `docs/**` links.

That is four instances of one class in a single day, the last two occurring inside the remediation for the first two. It is the strongest evidence this ticket has, and it is why the Likelihood is rated on observed recurrence rather than on judgement.

**A fifth instance, 2026-08-07, and a third sub-class: a status line falsified by a status transition.** ADR-042 was briefly promoted to `accepted` and reverted to `proposed` within the hour. The compendium's ADR-042 entry carries its own `**Status:**` badge, and nothing ties that badge to the ADR's frontmatter — so the badge stayed `accepted` after the revert. This will recur, in the opposite direction, at the eventual genuine promotion.

That makes three distinct sub-classes on one hand-maintained surface: **counts** that disagree with the filesystem, **Related-line tokens** that resolve to nothing, and **Status badges** that disagree with the frontmatter they mirror.

**A sixth instance, and it shows the class is systemic rather than incidental.** [ADR-036 Single API v2 WayCharter only](../../decisions/036-single-api-v2-waycharter-only.proposed.md) carries `human-oversight: confirmed` with `oversight-date: 2026-07-18`, while its capture banner still reads "human-oversight: unconfirmed until ratified". ADR-042 had the identical contradiction until it was fixed by hand on 2026-08-07.

Two independent ADRs with the same defect, three weeks apart, means the ratification drain promotes the frontmatter and leaves the `capture-adr` banner asserting the opposite. That is a gap in the drain, not an authoring slip, and it will recur on every future capture-then-ratify. ADR-036 is left uncorrected here deliberately: fixing the instance without fixing the drain is what produces the next one.

## Symptoms

- A count claim in the compendium disagrees with the filesystem, or with another count claim in the same file.
- A Related line names an `ADR-NNN` that does not exist.
- A `**Status:**` badge disagrees with the frontmatter of the ADR it mirrors, because a status transition edited one and not the other.
- A cross-ADR reference locates its target by ordinal position, which goes silently false the moment a bullet or criterion lands ahead of it.
- **Ordinal cross-references fail nothing**, and are the one symptom above still unchecked. The other three are caught by `test/js/__tests__/decisions-invariants.test.mjs` as of 2026-08-07. Note `doc-links-resolve.test.mjs` never reached any of them: it resolves markdown link targets, and compendium Related entries are bare tokens, not links.

## Workaround

**Superseded 2026-08-07 by the invariant test.** Before it, the workaround was risk review — a person reading carefully, which does not scale and is the control shape [R004 traffic sample counts in public ADR prose](../../risks/R004-traffic-sample-counts-in-public-adr-prose.active.md) and R028 both refuse to credit. The test then caught three live defects that review had not, one of them inside a code span in a file four review rounds had open. Ordinal cross-references remain unchecked and remain a reading problem.

## Impact Assessment

- **Who is affected**: the maintainer, and the architect agent, which reads this file first on every routine compliance review.
- **Frequency**: nine known instances, all surfacing 2026-08-07 — six found by review (see Description) and three more found by the invariant test the moment it ran. Two of the six were created inside the remediation for the first two.
- **Severity**: Minor. Governance-record accuracy only. The compounding cost is that a false fact in a governance index is trusted precisely because it looks derived.
- **Analytics**: N/A.

## Root Cause Analysis

### Preliminary observation

The compendium is generated, but generation is not the whole story here: the standalone generator is destructive in this repo (it strips hook-authored entries), so the working practice is hook-writes-entries plus hand-corrects-counts. That split leaves the counts and the derived Related lines with no producer that can be re-run and diffed. Until 2026-08-07 it also left them with no consumer that validated them; `decisions-invariants.test.mjs` is now that consumer.

`test/js/__tests__/risk-register-invariants.test.mjs` demonstrated the fix shape for the sibling tree: it asserts declared canonical state and bans positional references in `docs/risks/`. The equivalent for `docs/decisions/` landed 2026-08-07 as `decisions-invariants.test.mjs`, with one gap against its sibling — the register test bans positional references, and this one does not yet.

### Investigation Tasks

- [ ] Investigate root cause: confirm whether the phantom `ADR-074` came from the compendium-refresh hook's inbound-reference derivation, and whether it can distinguish `ADR-NNN` from `P-NNN`
- [x] Add an invariant asserting the three count claims (total, in-force, historical) agree with the filesystem — done 2026-08-07 in `test/js/__tests__/decisions-invariants.test.mjs`, including the internal identity (total = in-force + historical) and both section subheadings, since the realised failure was one restatement moving and not the other
- [x] Add an invariant asserting every `ADR-NNN` token in a Related line resolves to a file — done 2026-08-07. Scoped to Related lines: the carve-out comment names `ADR-074` while describing the defect and must not red. Known limit recorded in the test: resolution is not correctness, so a token mis-derived from the plugin's ADR namespace could resolve and still be the wrong artefact
- [x] Add an invariant asserting each entry's `**Status:**` and `**Oversight:**` badges match the frontmatter of the ADR file they mirror — done 2026-08-07. Parses the leading token, since badges carry annotations like `confirmed (2026-07-27)`. Rule is badge-present XOR key-present is a red, both-absent passes; a naive skip-when-absent would have failed open on ADR-013
- [x] Assert that no ADR body claims `human-oversight: unconfirmed` while its own frontmatter says `confirmed` — done 2026-08-07, in two forms. The intra-file check matches the GENERATED capture-adr banner literal rather than any mention, so the legitimate retained provenance paragraphs on ADR-039 and ADR-040 do not red. A second, cross-file check catches an ADR describing ANOTHER ADR as unconfirmed when it is not — which found ADR-003 asserting ADR-036 was unconfirmed, three weeks after ratification, inside a code span where no phrase-level sweep would have seen it.
- [ ] Fix the drain itself so it rewrites the capture banner at ratification, rather than leaving the test to catch it every time. **This repo cannot fix it** — `/wr-architect:capture-adr` emits the banner and `/wr-architect:review-decisions` promotes the frontmatter without rewriting it; both are plugin-owned. The local half is landed (check 1 catches every recurrence at pre-commit). The remaining half needs an upstream filing via `/wr-itil:report-upstream`, following the P087 precedent at `efbcc73`, citing two independent instances three weeks apart (ADR-036 and ADR-042) and the mutation-proved check. Without that filing this task is a standing wish rather than a treatment.
- [ ] Consider banning ordinal cross-references ("the fifth bullet") in `docs/decisions/`, matching the existing ban in the register test
- [x] Mutation-prove each — done 2026-08-07. Four mutations, all caught: in-force count 38 to 37; phantom `ADR-074` re-inserted on ADR-029's Related line; ADR-036's banner reverted; ADR-042's badge flipped to `accepted`.
- [ ] Extend the check to **absolute** links, which nothing validates today. `doc-links-resolve.test.mjs` resolves relative paths only, so `https://github.com/...` URLs have never been checked. On 2026-08-07 this surfaced nine dead links across four files plus one in `CHANGELOG.md`, all pointing at `tompahoward/addressr` — an org/repo that does not resolve at all (`gh repo view` returns "Could not resolve to a Repository"). They had been accumulating undetected, and one of them was in the repo's most-read file. The convention itself is settled per maintainer direction 2026-08-07: **relative for documents in this repo, absolute for GitHub issues** (GitHub resolves relative links against the file's location and cannot reach `/issues/`, so an issue link has no relative form). A check could assert that shape as well as reachability — an absolute `github.com/<owner>/<repo>/blob|tree` link pointing at _this_ repo is a convention violation, since it should be relative.

## Resolution progress

The invariants landed 2026-08-07 as `test/js/__tests__/decisions-invariants.test.mjs`, sibling of `risk-register-invariants.test.mjs` one tree over. It runs in `pre-commit` via `test:js`, so the decisions tree can no longer be left self-inconsistent by a commit.

**It went red on three live defects the moment it landed**, none of which any sweep had found:

1. ADR-036's capture banner asserting `unconfirmed until ratified` three weeks after its 2026-07-18 ratification.
2. ADR-003 describing ADR-036 as `human-oversight: unconfirmed` — a cross-file instance, inside a code span.
3. ADR-013's compendium badge asserting `rejected-pending-supersede` when its frontmatter carries no `human-oversight` key at all. The badge appears to have been derived from past-tense body prose, which is a fourth sub-class: **badge derived from body rather than frontmatter.**

All three fixed in the same commit. What remains open is the drain itself — it promotes frontmatter and leaves the banner, so this will keep recurring and the test will keep catching it. Fixing the producer is better than catching the output.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: [P089 No file-length lint rule, so two source files have grown past 1000 lines](089-no-file-length-lint-rule-so-two-source-files-have-grown-past-1000-lines.md) — both are missing mechanical checks on a surface that is currently maintained by attention.

## Related

Captured via `/wr-itil:capture-problem` on a risk-review remediation recommendation.

- [R028 register curation is unmechanised so it drifts against itself](../../risks/R028-register-curation-unmechanised-so-it-drifts-against-itself.active.md) — the same class, scoped to `docs/risks/`; this ticket is that class running uncontrolled one tree over.
- `test/js/__tests__/risk-register-invariants.test.mjs` — the fix shape, already built for the sibling tree.
- `test/js/__tests__/doc-links-resolve.test.mjs` — resolves link targets; its header names the wrong-artefact gap this ticket sits in.
- [ADR-042 Anchored span phrase clause for street-level-first ranking](../../decisions/042-anchored-span-phrase-clause-for-street-level-first-ranking.superseded.md) and [ADR-025 Symmetric ssla Indexing for Search Ranking](../../decisions/025-search-ranking-symmetric-ssla.accepted.md) — the ADRs whose landing surfaced all three instances.
