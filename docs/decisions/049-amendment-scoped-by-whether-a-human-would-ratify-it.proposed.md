---
status: 'proposed'
date: 2026-08-18
human-oversight: confirmed
oversight-date: 2026-08-18
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-risk-scorer:pipeline]
informed: []
reassessment-date: 2026-11-18
supersedes-clause: 047#amendment-prohibition-premise
---

# Amendment scoped by whether a human would ratify it

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context; RATIFIED by the decision-maker on 2026-08-18 at the /wr-architect:review-decisions drain.

## Context and Problem Statement

Two governing statements disagreed for eight days about whether an ADR may be amended, and the disagreement froze a false premise into a ratified record.

**A standing user direction:** _"Please DO NOT 'Amend' ADRs. An ADR should be a single decision. Additional decisions go in a new ADR. The issue with amendments is that they don't get ratified, but they are treated as ratified if the owning ADR is ratified."_

**`DECISION-MANAGEMENT.md`, saying the opposite and saying it first:** amendment is _"by far the most frequently exercised"_ of the three treatments, requiring retain-as-history once a decision is ratified and implemented. At least ten ADRs carry in-place amendment blocks, including ADR-030 — `accepted`, ratified, running in production — amended in place on 2026-08-10.

They share a concern and differ on remedy. The document's own rationale is nearly the direction's words: `human-oversight: confirmed` _"attests to the substance as it stood at `oversight-date`, and an amendment afterwards neither re-runs the ratification nor clears the marker."_

**The cost was not theoretical.** ADR-047 read the direction as a blanket prohibition and wrote it down as repo fact — at **ten sites across seven sections**. It is ratified, so the false premise is frozen. And it was already being argued from: ADR-048's first draft reached for clause supersession because ADR-047 had told it the other route was closed.

This record carries the rule that resolves the conflict, and retires ADR-047's premise as its first application. **The rule was previously written into `DECISION-MANAGEMENT.md` directly; that section is now a pointer here.** A rule governing what may be ratified, living in a document that nothing ratifies, is the root cause P102 records — and reproducing it would be the defect this record exists to close.

## Decision Drivers

- A rule about what may be ratified must itself be ratifiable. `DECISION-MANAGEMENT.md` carries no `human-oversight` marker and no gate; a rule living only there has no ratification surface, which is exactly how the conflict survived eight days.
- The direction's rationale is about **unratified substance inheriting a ratification marker** — that is narrower than a blanket prohibition, and the narrower reading is the one that does the work.
- A blanket prohibition prices every correction at a whole ADR, including a drifted count. ADR-047 itself warned this instrument is heavier than the rot it removes.
- A ratified record asserting a false rule about how the corpus is governed corrupts every decision argued from it, and one already was.

## Considered Options

1. **Scope by ratifiability: three classes, one test (chosen)** — substance is prohibited on a ratified decision; factual corrections take retain-as-history in place; navigation is permitted freely.
2. **Blanket prohibition** — no amendment of any kind; every correction routes to a new ADR.
3. **Document wins unchanged** — amendment generally available with retain-as-history; the direction read as advisory.
4. **Leave both live** — record the conflict and decide case by case.

## Decision Outcome

Chosen option: **"Scope by ratifiability: three classes, one test"**, by user decision 2026-08-18.

**The test is one question: would a human need to ratify this edit?**

| Class                  | Test                                                                                                                                                                          | Rule                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Substance**          | A human would need to read and ratify it — a new or changed Confirmation criterion, retiring an obligation, new reasoning, a different option analysis, implementation notes. | **PROHIBITED on a ratified decision. Route to a new ADR.** Substance added or changed after `oversight-date` inherits a ratification nobody granted it. |
| **Factual correction** | Nothing to ratify: the decision is unchanged and a stated fact about the world is now wrong — a drifted count, a moved path, a renamed command, a shifted line reference.     | **PERMITTED in place, with retain-as-history** once ratified and implemented. Quote the superseded wording, date it, say what replaced it.              |
| **Navigation**         | The edit only tells a reader where else to look — a `Related:` cross-reference, a forward pointer, an index entry.                                                            | **PERMITTED**, at any stage, no retention. A cross-reference carries no decision content, so there is nothing in it to ratify.                          |

**The boundary between the first two rows is not "is the text inside a Confirmation section".** It is whether the edit changes **what the decision requires** — and that discriminator reaches criterion-level edits only. It does not reach reasoning, which changes no requirement and is nonetheless ratifiable. So one more cut is needed, and it is the cut that stops this rule metastasising:

> **A stated fact appearing _within_ reasoning — a count, a path, a renamed command — is a factual correction.** The ratifier agreed to the decision, not to the fact's current value. `DECISION-MANAGEMENT.md` itself carries such a count in explanatory prose and invites recount.
>
> **The inferential step itself — the ground on which an option was chosen or rejected — is substance.** The ratifier agreed to the conclusion _on that ground_, so changing the ground changes what was ratified.

Without that second cut the rule routes a drifted count in a paragraph to a whole new ADR, which is the failure mode ADR-047 flagged at its own `:86` and `:145`. An earlier draft of this record made exactly that error by stopping at "reasoning is ratifiable".

### First application: ADR-047's premise, at all ten sites

ADR-047's conclusion **stands**; only its stated ground was wrong. Retiring ADR-045's `deploy_only` conditional removed an obligation, which changes what that decision requires, which is substance, which routes to a new ADR. Route right, reason wrong.

Seven sites assert the prohibition by name:

> **`:34`** (Context) — "this repo prohibits ADR amendments, on the grounds that an amendment rides on the parent's ratification without being ratified itself. That prohibition is what makes this a decision rather than an edit."
> **`:41`** (Decision Driver) — "Amendments to ADRs are prohibited here, so correcting it in place is not an option."
> **`:58`** (Decision Outcome) — "Option 3 is prohibited, and the prohibition has a reason this case illustrates well…"
> **`:85`** (Bad consequence) — "because the amendment prohibition means the dead sentence stays in `045-…proposed.md` **forever** … cannot be made green without either amending ADR-045 (prohibited) or maintaining an exemption list."
> **`:120`** (Pro of the CHOSEN option) — "Good, because it respects the amendment prohibition instead of working around it."
> **`:134`** (Con of a rejected option) — "Bad, because it is prohibited in this repo…"
> **`:145`** (Reassessment criterion) — "…the amendment prohibition itself is what needs revisiting, not this route."

Three more assert it without the word, and were missed by a keyword sweep — recorded because that is how a threaded premise survives its own correction:

> **`:19`** (Context) — "the convention here is that a shipped, ratified sentence is quoted rather than rewritten". **False as a blanket convention**, and false in a direction none of the other nine cover: it forecloses the entire factual-correction route, under which a shipped ratified sentence stating a wrong fact _is_ rewritten in place with retention.
> **`:54`** (Decision Outcome) — "the only option … without either destroying history or smuggling an unratified change into a ratified document". The conclusion survives — in-place amendment here genuinely would be unratified change, because this edit is substance — but the sentence characterises **all** in-place amendment. Supersede and restate on the corrected ground.
> **`:112`** (**Confirmation**) — "editing the compendium is not an amendment: it is a derived index, not a ratified decision." Right answer, retired taxonomy: a compendium entry is Navigation, a permitted _class of amendment_, not a non-amendment.

`:120` is the sharpest — the false premise credited as a **virtue of the option that won**. `:145` is the most durable — a live trigger aiming a future reader at a prohibition that will not exist. `:112` matters because **Confirmation is a seventh section**, and an earlier enumeration of this record visited six.

**`:42` survives and is not superseded** — _"A shipped, ratified sentence should be retained and quoted by whatever replaces it, not silently deleted."_ "Silently" is the operative word; retain-as-history requires exactly this. Recorded so the sweep does not over-route.

**Restating `:85` on the corrected ground.** Its permanent-red and exemption-list costs **stand**: ADR-045's dead sentence imposes an obligation, retiring an obligation is substance, so it still cannot be amended away. What does not stand is its generalisation. Under this rule, dead text that is a matter of fact — a moved path, a renamed command — is a factual correction and **can** be fixed in place. A future prose detector's permanent exemption list is therefore materially smaller than `:85` forecast: only obligation-retirements accumulate.

**ADR-047's `human-oversight: confirmed` marker correctly stands.** **wr-architect ADR-066**'s re-confirm carve-out fires on a changed Decision Outcome; this changes stated grounds. The opposite reading is more available here than when ADR-047 made the same argument about ADR-045, because the thing retired _is_ reasoning. The distinction that resolves it: substance may not be **added** under an old marker; substance **retired by a separately-ratified record** is the sanctioned route, and this record carries its own marker.

Option 2 was rejected on cost and on evidence — it was live for eight days and produced ADR-047's false premise. Option 3 discards the direction's real concern. Option 4 pays the cost on every future case, which P102 records as already happening twice.

## Consequences

### Good

- The rule governing what may be ratified is now itself ratifiable, closing P102's root cause rather than relocating it.
- The corpus stops asserting a false rule about its own governance, in a record ratified two days ago and already cited by a later one.
- Navigational edits are unblocked, which discharged ADR-048's forward-pointer cost the same day the rule landed.
- **A future prose detector's exemption list shrinks** — only obligation-retirements accumulate, not every stale reference.

### Neutral

- ADR-047's status, marker, `oversight-date`, Confirmation criteria and mechanisms all stand.

### Bad

- **"Clause-level supersession" now covers two different shapes and the anchor does not distinguish them.** ADR-047 superseded one contiguous sentence; this supersedes a claim threaded through ten sites in seven sections under a single `supersedes-clause` anchor. Worse, **the anchor is unchecked**: `decisions-invariants.test.mjs` parses only the leading ADR id from the scalar and never validates the text after `#` against anything. The syntax implies a locatable clause and nothing enforces the implication.
- **The compendium will keep asserting the false premise on the architect's routine load surface.** ADR-047's generated `Decides:` line reads "amending in place (prohibited here)", derived from a body that keeps the premise by design. The reverse badge is the only durable correction available there, which makes it load-bearing mitigation rather than bookkeeping.
- **A third clause-level supersession in two days.** ADR-048's criterion is a class test and this does not trip it. But three invites the reader to infer a rate, so: all three trace to one governance question, **and that question is now settled**.
- The rule is judgement, not machinery. Nothing classifies an edit; the label on a `Related:` line is not a check — and the first violation proved it (see Reassessment).

## Confirmation

1. **Every site is enumerated exactly.** `grep -niE 'amend|prohibit|ratif|rewritten|rewrite|in place' docs/decisions/047-*.md` surfaces the ten sites quoted above plus `:42` (which survives) and the `Related:` pointer. Each of the ten is quoted here verbatim. An exact set, not a count — a count is what let an earlier draft enumerate five, and a keyword sweep is what let the next one stop at seven.
2. **The edits to ADR-047 add no substance.** The diff adds no sentence asserting what that record decides, requires, or why. Stated as a class test, not "the diff shows only `Related:` additions" — a location test passes for a `Related:` line carrying reasoning, which is precisely what an earlier version of that line did.
3. **The supersession is legible from the superseded end, mechanically.** `decisions-invariants.test.mjs` derives `supersedes-clause: 047#amendment-prohibition-premise` and requires `**Superseded in part by:** ADR-049` on ADR-047's compendium badge; the symmetric check reds if the badge is added without the scalar. The badge must land in this commit or the suite reds.
4. **`DECISION-MANAGEMENT.md` § What May Be Amended At All points here rather than restating the rule**, so a contributor reading the document reaches the ratified record, and the rule cannot drift between the two.
5. **The external-citation form is demonstrably working, not asserted.** `047:66` uses `**wr-architect ADR-066**`, and ADR-047's compendium `Related:` line carries `ADR-045, ADR-001, ADR-040` with no ADR-066 — the harvester skips the plugin-qualified form, so the dangling intra-repo edge is closed by evidence.

## Pros and Cons of the Options

### Scope by ratifiability

- Good, because it keeps the direction's actual concern — unratified substance under an old marker — while pricing corrections proportionately.
- Good, because it is ratifiable, unlike the document section it replaces.
- Bad, because it is judgement with no mechanical check, and its first application was violated by the record applying it.

### Blanket prohibition

- Good, because it is unambiguous and needs no boundary judgement.
- Bad, because it prices a drifted count at a whole ADR.
- Bad, because it was live for eight days and produced a false premise in a ratified record.

### Document wins unchanged

- Good, because it matches ten years of repo practice and needs no migration.
- Bad, because it discards the direction's concern, which the document's own rationale shares.

### Leave both live

- Good, because it costs nothing today.
- Bad, because it has already cost twice, and the cost is invisible until a record freezes around the wrong reading.

## Reassessment Criteria

- **Someone applies the navigation carve-out to something substantive.** A `Related:` line carrying reasoning, or an index entry restating a decision. **One instance is the signal — and one has already occurred, in this batch.** ADR-047's `Related:` line was first written carrying a falsity finding, a rule restatement and an argument, all under a "carrying no substance" label, and was caught in review. That the first violation came from the record correcting the rule is the strongest available evidence the boundary needs a mechanical check rather than a label.
- **The substance / factual-correction boundary proves routinely arguable** — most likely where repointing a moved path also changes what a criterion requires. If the fact-within-reasoning cut has to be re-litigated case by case, it is the wrong cut.
- **A fourth clause-level supersession within the month from a cause unrelated to amendment policy.** Three trace to one settled question; a fourth from elsewhere means the route is load-bearing and its cost should be priced deliberately.
- **`DECISION-MANAGEMENT.md` acquires a ratification surface**, or is retired. This record assumes it has none, which is why the rule moved here.

## Related

- **Supersedes** the ten quoted statements in ADR-047 (`047-dead-conditionals-retired-by-supersession.proposed.md`) asserting or depending on a blanket prohibition. **Only** those; its Decision Outcome, Confirmation criteria, mechanisms and markers stand. `:42` survives explicitly.
- **P102** (`docs/problems/open/102-no-amendment-directive-conflicts-with-decision-management.md`) — the conflict, the options, the resolution. This record discharges its remaining scope.
- **ADR-048** (`048-moved-path-referrers-resolved-by-executable-guard.proposed.md`) — recorded the conflict and declined to rest on either side. Mentioned as co-affected only; this record rests on nothing ADR-048 decides. **Factual correction 2026-08-18**, retained per the rule this record establishes: the wording was _"since ADR-048 is `human-oversight: unconfirmed`"_, true when written and false minutes later — both records were ratified in the same drain sitting. The independence claim never depended on ADR-048's oversight state, so only the stated fact changed.
- **ADR-046**, **ADR-045** — the records ADR-047 and ADR-048 act on; unaffected.
- `DECISION-MANAGEMENT.md` § What May Be Amended At All — the contributor-facing pointer to this rule. The retain-as-history trigger and the external-citation form remain in that document and are candidates for the same treatment.
