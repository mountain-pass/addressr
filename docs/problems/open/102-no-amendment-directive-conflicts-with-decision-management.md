# Problem 102: The no-amendment directive conflicts with DECISION-MANAGEMENT.md

**Status**: Open — all investigation tasks discharged 2026-08-18; ready to transition on verification
**Reported**: 2026-08-18
**Priority**: 12 (High) — Impact: 4 × Likelihood: 3 — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: S — derived at capture per Step 4a
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Two governing statements disagree about whether an ADR may be amended, and both are live.

**The standing user directive** (given 2026-08-17): _"Please DO NOT 'Amend' ADRs. An ADR should be a single decision. Implementation notes go in the corresponding story. Additional decisions go in a new ADR. The issue with amendments is that they don't get ratified, but they are treated as ratified if the owning ADR is ratified."_ Confirmed by action the same day — when ADR-045 was found to carry a dead conditional, the direction was "create the superseding ADR", not amend in place.

**`DECISION-MANAGEMENT.md` § Decision Amendment, Deprecation and Supersession** says the opposite, and says it first: _"Three treatments, ordered by scope: amending a claim inside a decision, replacing a decision with another, and retiring one with nothing in its place. **Amendment comes first because it is by far the most frequently exercised of the three.**"_ It requires **retain-as-history** — quote the superseded wording verbatim, date it, say what replaced it — once a decision is ratified **and** implemented.

**They share the same concern and differ on remedy.** The document's own rationale is nearly the directive's words: `human-oversight: confirmed` _"attests to the substance as it stood at `oversight-date`, and an amendment afterwards neither re-runs the ratification nor clears the marker."_ The directive resolves that by prohibiting amendment; the document resolves it by requiring the superseded text be retained and dated.

Repo practice follows the document, at maximum ratification: ADR-030 (`accepted`, `human-oversight: confirmed`, running in production) had its Confirmation section amended in place on 2026-08-10 with a dated retain-as-history note. ADR-034's Confirmation was filled in place after ratification. ADR-004, ADR-009, ADR-016, ADR-027, ADR-028, ADR-031, ADR-032 and ADR-039 all carry in-place amendment blocks.

## Symptoms

1. **A ratified ADR is frozen around a false premise.** ADR-047 (dead conditionals retired by supersession) states at line 34 _"this repo prohibits ADR amendments"_ and repeats it as a Decision Driver at line 41, where it is the sole stated Bad of the option it rejects. ADR-047 is `human-oversight: confirmed` (2026-08-17) and implemented, so both conditions of the retain-as-history trigger hold and the text can now only be corrected by retained amendment or supersession. Picking a side produced a wrong record.
2. **It constrained a second record.** ADR-048 declines to rest on either position and says so explicitly, which is the right handling but cost a paragraph and left a Bad consequence open — no body-level forward pointer from ADR-046, because under the literal reading that edit was prohibited. **Discharged 2026-08-18** by the resolution below; retained here because it is the evidence that the conflict had a running cost rather than a theoretical one.
3. **Anyone following the document does the prohibited thing while believing they are compliant.** The document is the artefact a contributor reads; the directive lives in conversation. There is no surface where they meet.
4. **The two readings diverge on the cheapest possible case.** A `Related:` cross-reference adds no decision substance and cannot inherit ratification, so under the directive's _rationale_ it is arguably not the prohibited thing — while under its _literal wording_ it is.

## Workaround

Take the literal reading and route everything through a new ADR. That is the conservative default for an agent facing an ambiguous standing directive, and it is what ADR-047 and ADR-048 both did. It costs an ADR per correction and, on current evidence, produces its own defects.

## Impact Assessment

- **Who is affected**: anyone amending or superseding a decision record — and, in practice, agents most, because they follow written process literally and cannot ask mid-task.
- **Frequency**: on every correction to a ratified decision. Twice in two days so far.
- **Severity**: Significant for the governance corpus. It does not touch runtime, build or publish. But it has already frozen a false premise into a ratified record, and the corpus is what future decisions are argued from.
- **Analytics**: 2 records affected (ADR-047 frozen, ADR-048 constrained); at least 10 existing ADRs carry in-place amendments made under the document's rule.

## Root Cause Analysis

The directive was given in conversation and never written into the process document it contradicts. Nothing reconciles a spoken standing instruction with a checked-in governing artefact, so both stayed live and neither knew about the other.

### Investigation Tasks

- [x] **Settle the direction. RESOLVED 2026-08-18 — option C, by user decision.** Scope the directive to substance: prohibit amendments that add or change decision content; permit navigational edits (`Related:` cross-references, forward pointers, index entries) which carry no substance and cannot inherit ratification. The boundary is the directive's own rationale applied literally — if a human would need to ratify it, it is substance.
- [x] ~~**Write it into `DECISION-MANAGEMENT.md`.** Done: new section "What May Be Amended At All: Substance vs Navigation", with the substance/navigation table and the history of the conflict retained.~~ **Superseded within the same session.** The table was written there, then replaced by a pointer to ADR-049 on the user's direction to move the rule into a ratifiable record — the document has no `human-oversight` marker, so a rule living there had no ratification surface, which is this ticket's root cause. Struck rather than deleted because its neighbours are struck and an un-struck false task reads as an oversight.
- [x] **Discharge ADR-048's forward-pointer cost.** Done: ADR-046's `## Related` now carries a navigational pointer to ADR-048, marked as such.
- [x] **Correct ADR-047's premise. DONE 2026-08-18 via ADR-049.** Ten sites, not the five first enumerated nor the seven a keyword sweep found — three assert the premise without the word "prohibit", including one in ADR-047's **Confirmation** section, a seventh section the earlier enumeration never visited. ADR-047's outcome stands; only its stated ground was wrong.
- [x] **Move the rule out of `DECISION-MANAGEMENT.md` into a ratifiable record. DONE 2026-08-18.** The section is now a pointer to ADR-049. A rule about what may be ratified, living in a document with no `human-oversight` marker and no gate, has no ratification surface — which is this ticket's root cause, and restating it there would have reproduced it.
- [x] ~~Correct ADR-047's premise — the remaining work.~~ Superseded by the two entries above. It asserts a _blanket_ prohibition at lines 34, 41 and 134, which is false under option C: navigational edits are permitted. It is ratified and implemented, so under the retain-as-history rule this needs a superseding record, not an in-place edit. Note the sharper point for that record: ADR-047's _outcome_ may also not survive — under option C the dead `deploy_only` conditional is substance, so supersession was the right route for it, but the option analysis that rejected in-place amendment as "prohibited" needs redoing on honest grounds.
- [x] **Qualify the unqualified external citation at `047-…:66`. DONE** — `**wr-architect ADR-066**`, and verified working rather than asserted: ADR-047's compendium `Related:` line carries no ADR-066, so the harvester demonstrably skips the plugin-qualified form and the dangling intra-repo edge is closed.
- [ ] ~~Qualify the unqualified external citation~~ in the same record (`ADR-066` is a `wr-architect` plugin ADR needing the bold plugin-qualified form).

The four options considered, retained because the rejected ones explain the choice:

- **A — the directive wins.** Amend `DECISION-MANAGEMENT.md` to replace the amendment section with the prohibition, retaining the superseded text per its own rule. Makes ADR-047's premise retroactively true.
- **B — the document wins.** Amendment stays available with retain-as-history; the directive is read as prohibiting _substantive_ amendment only. Makes ADR-047's premise false and requires the superseding record.
- **C — scope the directive to substance.** Prohibit amendments that add or change decision content; permit navigational edits (`Related:` cross-references, index entries) which carry no substance and cannot inherit ratification. Fits the directive's own stated rationale, and discharges ADR-048's forward-pointer cost directly. **Architect's lean.**
- **D — leave unresolved.** Each future case pays the cost again.
- [x] Re-read other records written under the blanket reading. ADR-047 corrected via ADR-049; ADR-048 needed none, having declined to rest on either side.
- [ ] **Remaining, and larger than this ticket:** `DECISION-MANAGEMENT.md` still carries two more repo-specific rules with no ratification surface — the retain-as-history trigger keyed on the marker rather than `status`, and the external-citation form. Both are candidates for the same treatment ADR-049 just applied. Tracked here rather than opened as work, because the user's direction was to move "the relevant part", and that part is done.

## Dependencies

- **Blocks**: (none) — the direction is settled, so correcting ADR-047 is now unblocked and is this ticket's remaining scope.
- **Blocked by**: (none). It WAS blocked on a user decision, which arrived 2026-08-18. That block was correct while it lasted: an agent picking a side would itself have been an unratified decision inheriting ratification, the exact hazard the directive names.
- **Composes with**: (none)

## Related

- **ADR-047** (`docs/decisions/047-dead-conditionals-retired-by-supersession.proposed.md`) — carries the false premise at lines 34, 41 and 134, ratified and frozen.
- **ADR-048** (`docs/decisions/048-moved-path-referrers-resolved-by-executable-guard.proposed.md`) — records this conflict, declines to rest on either side, and carries the resulting Bad consequence. Its reassessment criteria fire when this is resolved.
- **ADR-030**, **ADR-034** — precedents for in-place amendment of a ratified, implemented decision under the document's rule.
- `DECISION-MANAGEMENT.md` § Decision Amendment, Deprecation and Supersession — the amendment section, and its retain-as-history trigger row. **Anchored by section name, not by line: the earlier `:228-261` and `:239` coordinates were made stale by the very commit that added this ticket**, which is R028's recorded finding that a line-anchored citation is guaranteed to rot because line numbers move on every edit while the fact stays true.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer`.

Captured via `/wr-itil:capture-problem`. Hang-off check: no existing ticket covers decision-record governance policy — the nearest by signal is P065 (RFC story-map backfill), which is about trace completeness rather than amendment policy, so this proceeds as a new ticket.
