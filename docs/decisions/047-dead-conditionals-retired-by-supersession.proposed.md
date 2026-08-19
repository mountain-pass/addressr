---
status: 'proposed'
date: 2026-08-17
human-oversight: confirmed
oversight-date: 2026-08-17
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent, wr-risk-scorer:pipeline]
informed: []
reassessment-date: 2026-11-17
supersedes-clause: 045#confirmation-5-sequencing
---

# Dead conditionals retired by supersession

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context and RATIFIED by the decision-maker on 2026-08-17, in the same session, without waiting for the /wr-architect:review-decisions drain.

## Context and Problem Statement

ADR-045's confirmation criterion 5 carries a sequencing constraint, and that constraint ends with a conditional instruction. Quoted in full, because this decision retires it and the convention here is that a shipped, ratified sentence is quoted rather than rewritten:

> If the two are ever separated, the guard's refusal message must name `deploy_only` as the actual apply route, and that wording must be pinned in test so it cannot outlive the gap it describes.

The antecedent was the changeset guard shipping **ahead** of the gate repoint (criteria 1–3). In that world the instruction was correct: an author would comply with the guard, write a deployment changeset, and still apply nothing, because `apps/addressr-deployment` is `private: true` and the release would skip Deploy, Stabilise and Smoke while reporting green. Naming `deploy_only` was the honest remedy, because at the time it was the real apply route.

Both halves of that antecedent are now false, and not recoverably so:

- The gate repoint shipped **first**, at commit `8199e5b9` ("feat(release): arm production deploys from changesets, delete deploy_only"), which in the same commit **deleted** the `workflow_dispatch` `deploy_only` input.
- The guard shipped **behind** it, at commit `114d9cc8` (2026-08-17). The two were never separated in the direction the constraint feared, and cannot be — the input it names no longer exists.

The problem is not that the sentence is stale. It is that the sentence is an **instruction**, sitting inside the section ADR-045 designates as its specification, in a record that says of itself that each element is "pinned in test rather than described in a comment." A future implementer reading criterion 5 to build from would write a refusal message routing authors to a dispatch input GitHub now rejects outright. The refusal message is the artefact an author meets at the moment of failure, and JTBD-400 treats it as a checkable artefact that replaces memory. A wrong route there is worse than silence, because it is followed.

The repo's behaviour already contradicts the sentence. The shipped refusal names the package (`@mountainpass/addressr-deployment`), the command (`npx changeset`), the consequence of ignoring it, and the `Deploy-Guard-Bypass:` trailer last with its purpose — and deliberately does not name `deploy_only`. That absence is asserted by a negative test. So the specification and the implementation disagree, and only one of them is executable.

Amending ADR-045 in place is not available: this repo prohibits ADR amendments, on the grounds that an amendment rides on the parent's ratification without being ratified itself. That prohibition is what makes this a decision rather than an edit.

## Decision Drivers

- The sentence is an instruction inside a specification section, not narrative prose, so a reader is meant to act on it.
- Its antecedent is permanently unsatisfiable — the named input was deleted, not merely disused.
- Following it would produce a refusal message pointing at a route that no longer exists, on the artefact an author meets at the moment of failure.
- Amendments to ADRs are prohibited here, so correcting it in place is not an option.
- A shipped, ratified sentence should be retained and quoted by whatever replaces it, not silently deleted.
- The tested behaviour already contradicts the sentence, so the record is the thing that is wrong.

## Considered Options

1. **Retire the sentence by superseding ADR (chosen)** — a new ADR quotes the dead conditional in full, records that its antecedent is permanently unsatisfiable, and supersedes that sentence alone.
2. **Leave it and rely on the test** — the negative assertion in `check-deployment-changeset.test.mjs` already prevents `deploy_only` reaching the refusal message, so the harm is arguably already contained.
3. **Amend ADR-045 in place** — strike or annotate the sentence where it sits.
4. **Delete the sentence** — remove it from ADR-045 without a record.

## Decision Outcome

Chosen option: **"Retire the sentence by superseding ADR"**, because it is the only option that makes the record agree with the tested reality without either destroying history or smuggling an unratified change into a ratified document.

Option 2 was the closest contender and is genuinely partly right — the negative test does prevent the specific bad string reaching the refusal. But a test constrains the implementation, not the specification. The next implementer reads criterion 5, writes the wrong thing, and discovers the disagreement only when the suite reds; at best that is a confusing failure, and at worst the reader "fixes" the test to match the ADR, because the ADR is the ratified artefact and the test looks like the deviation. Leaving a false instruction standing and defending it with a tripwire inverts which one is authoritative.

Option 3 is prohibited, and the prohibition has a reason this case illustrates well: an amendment to criterion 5 would be read as carrying criterion 5's ratification, when in fact nobody would have ratified the amendment.

Option 4 loses the history. The sentence was correct when written, and the conditions under which it was correct are worth being able to reconstruct — that is exactly what a superseding record preserves and a deletion does not.

**Scope is deliberately narrow: this supersedes only the quoted sentence.** The rest of criterion 5 stands, including the sequencing constraint's substantive requirement that the guard must not land before criteria 1–3 — which was honoured, and is the reason the conditional never fired.

**On the mechanics of a clause-level supersession, because this one deliberately skips most of the documented process.** `DECISION-MANAGEMENT.md` describes only the WHOLE-ADR shape: rename the parent to `.superseded.md`, restatus it, add a "Superseded by" note. None of that is available or correct here — ADR-045 is not superseded, 95% of it is in force, and renaming it would be false. So this performs step 1 of that five-step process and none of steps 2–4, by design. The precedent is ADR-045's own `Related` line, which supersedes "ADR-001's `deploy_only` entry point" while leaving `001-…proposed.md` unrenamed and unrestatused. That makes this the second clause-level supersession in the corpus, not the first — but the shape is still unrecorded in `DECISION-MANAGEMENT.md`, and with two instances it is now worth recording there.

**ADR-045's own oversight marker correctly stays `confirmed`.** **wr-architect ADR-066**'s re-confirm carve-out fires when a supersession changes a decision's DECISION OUTCOME; this retires a sentence in its Confirmation section, which is not that. Stated because the opposite reading is available and would force a pointless re-ratification.

**This decision changes no behaviour.** Nothing in the pipeline, the guard, or the refusal message moves. It aligns the written record with what already ships and is already tested.

## Consequences

### Good

- The specification and the tested behaviour agree, so an implementer working from the ADR text alone cannot reintroduce a reference to a deleted dispatch input.
- The conditions under which the original sentence was correct are preserved by quotation, so the reasoning remains reconstructable rather than lost to a deletion.
- It establishes the route for dead conditionals generally. This repo will hit the pattern again: ADR prose accumulates conditionals guarding sequencing risks, and sequencing risks resolve.

### Neutral

- ADR-045's status is untouched. It remains `proposed`, and this decision is not grounds to promote it — criterion 6 (first real apply) is the production-validation criterion and is undischarged, with R020's zero-real-applies precondition still standing.

### Bad

- It costs a whole ADR for one sentence, and a reader of criterion 5 must now follow a supersession link to read it correctly. The registry grows faster than the decision surface does.
- **It mechanises nothing, and worse, it FORECLOSES the cheapest mechanisation of its own reassessment criterion 1.** No check detects the next dead conditional — this one was caught by hand, while implementing the criterion that contained it, by someone who happened to notice the instruction named a deleted input. A different implementer, or the same one on a busier day, follows it instead. But the compounding cost is sharper than that: because the amendment prohibition means the dead sentence stays in `045-…proposed.md` **forever**, any future detector that scans ADR prose for references to deleted inputs, flags or workflows will red on ADR-045 permanently, and cannot be made green without either amending ADR-045 (prohibited) or maintaining an exemption list. Every future clause-level supersession adds another permanent entry to that list, so the corpus accumulates known-dead text a detector cannot distinguish from live rot. The `supersedes-clause: 045#confirmation-5-sequencing` frontmatter scalar is a one-line down-payment against that: it hands a future detector the exemption key rather than making it reconstruct one by prose-reading.
- Supersession-per-sentence is a heavier instrument than the rot it removes, and applying it consistently would be costly. This decision does not commit to applying it consistently — it records the route, not a sweep.

## Confirmation

1. **The dead instruction is not followed anywhere in EXECUTABLE content.** Comment-stripped, `deploy_only` appears nowhere under `scripts/`, `.github/workflows/` or `.husky/`:

   ```sh
   for f in $(git ls-files scripts .github/workflows .husky apps package.json); do
     grep -vE '^[[:space:]]*#' "$f" | grep -nE 'deploy[_-]only' | sed "s|^|$f:|"
   done | grep -vE 'release-watch\.sh.*--deploy-only|package\.json.*"deploy:watch"'   # must print nothing
   ```

   Three things in that command are load-bearing, and **each replaced a version of this criterion that was wrong**. They are spelled out because the ADR's whole argument is that an unrunnable criterion is worse than none, and this criterion needed three passes to become runnable.

   - **Whole-comment-lines only, via `grep -v`, NOT `sed -E 's/#.*//'`.** The `sed` form blanks a line from its first `#` regardless of context, so `${var#prefix}` and any `#` inside a quoted string blank the executable content after it. For a NEGATIVE grep that fails **open** — it goes green while live `deploy_only` exists, which is the silent-green class ADR-045 treats as worst. The correction fails closed.
   - **`deploy[_-]only`, not `deploy_only`.** The operator-facing spelling is hyphenated. TWO live refusal stubs name it and are correct: `scripts/release-watch.sh`'s `--deploy-only` handler, and root `package.json`'s `deploy:watch` script, which exits 1 with a message explaining that no deploy-only command exists. Both are carved out **by name**, so the carve-out list is itself a readable inventory of the retirement stubs. Matching only the underscore form would have passed by spelling accident and would not catch a re-added operator path.
   - **The scope is the whole executable surface**, `apps/` and root `package.json` included. An earlier version scanned three directories while claiming "executable content" — a claim wider than its evidence. Widening it immediately surfaced the `package.json` stub the narrow version had never seen, which is the criterion doing its job at the cost of one more carve-out.

   `docs/` is excluded, and the exclusion is narrower than it looks: it was verified against ADR-001, ADR-040 and ADR-045, which all discuss `deploy_only` correctly as history. It is NOT a blanket warrant for `docs/` — see the note under Reassessment Criteria.

2. **The absence is asserted, not assumed.** `test/js/__tests__/check-deployment-changeset.test.mjs` contains the case "does NOT name `deploy_only`, which no longer exists", which fails if the string reaches the refusal message. Verified by mutation at capture time.
3. **The antecedent is genuinely unsatisfiable, and this is already MECHANISED** — cited as the machine check it is rather than described as a human read. `test/js/__tests__/release-workflow-deploy-only.test.mjs` asserts `!('deploy_only' in inputs)` against `release.yml`'s `workflow_dispatch`, naming ADR-045 in its failure message. The deletion commit is `git log -S 'deploy_only' --oneline -1 -- .github/workflows/release.yml` → `8199e5b9`. Both the path scoping and the `-1` are needed: unscoped, `-S` counts occurrence changes across every file; scoped but unbounded it still returns seven commits, because the input was introduced, moved and re-commented over its life. Only the most recent is the deletion.
4. **The supersession is legible from the SUPERSEDED end.** ADR-045's compendium badge line in `docs/decisions/README.md` carries `**Superseded in part by:** ADR-047 (criterion 5's sequencing conditional)`, and ADR-047 appears on its `Related:` line.

   **And it is MECHANISED, not hand-run.** `test/js/__tests__/decisions-invariants.test.mjs` derives every `supersedes-clause` scalar from ADR frontmatter and asserts the target's compendium badge carries a matching `Superseded in part by:` reference. That matters because the badge is a hand-edit in a file whose own header reads AUTO-GENERATED, do NOT hand-edit — the generator is documented-destructive and runs at the review-decisions drain, so without the assertion this criterion's mechanism dies on the next regeneration, silently, and the criterion quietly becomes false again. Mutation-verified: wiping the badge reds, and pointing the scalar at a nonexistent ADR reds. The check is derived from frontmatter rather than hardcoding this pair, so the next clause supersession is covered the moment it declares the scalar.

   **This criterion was FALSE when first written**, and the correction is the point. It originally claimed reachability was "checked by the decisions compendium listing ADR-047 with its supersession relationship" — but the compendium recorded that relationship only at the SUPERSEDING end, which is the direction that already worked. A reader arriving at the dead sentence in ADR-045 had nothing pointing forward. The reverse badge is what makes the claim true, and editing the compendium is not an amendment: it is a derived index, not a ratified decision.

## Pros and Cons of the Options

### Retire the sentence by superseding ADR

- Good, because the record ends up agreeing with the behaviour that actually ships and is tested.
- Good, because the superseded text is quoted, so the history and the conditions that justified it survive.
- Good, because it respects the amendment prohibition instead of working around it.
- Bad, because one sentence now costs an ADR and a link-follow.
- Bad, because it detects nothing — the next dead conditional is found by luck, as this one was.

### Leave it and rely on the test

- Good, because the negative assertion already blocks the specific harmful string, at zero further cost.
- Good, because it adds nothing to the decision registry.
- Bad, because it leaves a false instruction standing in the document a future implementer builds from.
- Bad, because it makes the test the authority over the ADR, which inverts the intended relationship — the likely resolution of the conflict is someone changing the test.

### Amend ADR-045 in place

- Good, because the correction sits exactly where a reader encounters the problem.
- Bad, because it is prohibited in this repo, and for a reason this case demonstrates: the amendment would read as ratified when nobody ratified it.

### Delete the sentence

- Good, because it is the cheapest possible fix and leaves nothing misleading.
- Bad, because it destroys a correct-at-the-time decision and the reasoning behind it.
- Bad, because a silent edit to a ratified record is indistinguishable from the rot it is meant to remove.

## Reassessment Criteria

- **A second dead conditional is found in ADR prose.** One is a catch; two is a pattern, and the second should trigger mechanised detection (a check for ADR prose naming inputs, flags, files or workflows that no longer exist) rather than a third ADR of this shape.
- **The supersession-per-sentence pattern proves heavier than the rot it prevents** — for instance if it is invoked often enough that criterion sections routinely require following several supersession links to read correctly. At that point the amendment prohibition itself is what needs revisiting, not this route.
- **A dead conditional is found in `docs/` outside the three ADRs the criterion-1 exclusion was verified against.** That exclusion rests on ADR-001, ADR-040 and ADR-045 all discussing `deploy_only` correctly as history; it is not a blanket warrant for `docs/`. One instance is already known and is NOT covered by it — `docs/jtbd/addressr-maintainer/JTBD-400-…validated.md` names the `deploy_only` dispatch in the present tense as "the act that applies it", which is the same defect class in a validated story rather than an ADR.
- **A dead conditional is found to have been FOLLOWED** before anyone noticed it was dead. That falsifies the assumption behind this decision's narrow scope — that hand-catching is adequate in the interim — and makes mechanised detection urgent rather than eventual.
- **ADR-045 reaches a terminal status** (accepted after criterion 6 discharges, or superseded wholesale), at which point this record's scope should be re-examined: superseding one sentence of a wholly-superseded ADR is redundant.

## Related

- **Supersedes** the single quoted sentence of ADR-045 (`045-changesets-armed-release-pr-merge-as-the-production-deploy-entry-point.proposed.md`) confirmation criterion 5's sequencing-constraint paragraph. **Only** that sentence; the remainder of criterion 5 and of ADR-045 stands, and ADR-045 is NOT promoted by this record.
- **ADR-001** and **ADR-040** — the `deploy_only` entry point they established, which ADR-045 superseded at `8199e5b9`. Their prose still references `deploy_only` as history, correctly.
- **ADR-049** (`049-amendment-scoped-by-whether-a-human-would-ratify-it.proposed.md`) — supersedes this record's amendment-prohibition premise. **P102** (`docs/problems/open/102-no-amendment-directive-conflicts-with-decision-management.md`) — the conflict that produced it. Both added 2026-08-18 as navigational cross-references only (`DECISION-MANAGEMENT.md` § What May Be Amended At All).
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer` — the job the refusal message serves, and the source of the "checkable artefacts, not memory" outcome that makes a wrong route in that message a real cost.
- **R020** — the deploy-path precondition risk; its zero-real-applies baseline is untouched by this record.
- **P039** (`docs/problems/known-error/039-decouple-saas-deployment-from-npm-publish.md`) — carries the changeset guard's implementation notes, including why the refusal deliberately omits `deploy_only`.
