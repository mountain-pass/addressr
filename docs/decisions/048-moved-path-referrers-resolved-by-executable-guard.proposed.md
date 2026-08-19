---
status: 'proposed'
date: 2026-08-18
human-oversight: confirmed
oversight-date: 2026-08-18
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent, wr-risk-scorer:pipeline]
informed: []
reassessment-date: 2026-11-18
---

# Moved-path referrers resolved by executable guard

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context; RATIFIED by the decision-maker on 2026-08-18 at the /wr-architect:review-decisions drain.

## Context and Problem Statement

ADR-046 decided the monorepo layout and listed four Confirmation criteria. They assert, in order: that a root `workspaces` glob matches the deployment directory and changesets does not ignore it; that `npx npm@10 ci` resolves under CI's exact resolver; that each `package.json` name agrees with its directory name; and that no `packages/*` entry is private while no `apps/*` entry is publishable.

Every one is about **workspace membership** — does the glob match, does the resolver resolve, do the names agree, is the publishable/private split honoured. Not one can see a **referrer**: a file elsewhere in the repo naming a path the move invalidated.

So the layout moved twice on 2026-08-10 (`deploy/` → `packages/deployment/` at `bf106786`, then → `apps/addressr-deployment/` at `2f729d1b`), ADR-046 was and remained fully satisfied, and its consequences rotted anyway. Found since, all downstream of that one move:

- **`.github/workflows/perf-regression.yml:66`** ran `npm run genversion`, a script that moved into the `@mountainpass/addressr` workspace. It does not resolve at the repo root. **The job failed on every scheduled run from 2026-08-12 to 2026-08-17** — six consecutive nights, at the same step, unread.
- **`.github/workflows/perf-regression.yml:80`** imported `./service/address-service.js` where its twin in `release.yml` had been repointed. Cache-masked: the G-NAF `-f` guard skips the branch on a cache hit, so it throws only on a miss. The file carried the corrected path at line 72 and the stale one at line 80, two lines apart.
- **`.github/workflows/terraform-plan.yml`** told operators, in the present tense, to "Run this before every `deploy_only`" — a dispatch input deleted at `8199e5b9`.
- **`docs/jtbd/addressr-maintainer/JTBD-400-…validated.md`** omitted `scripts/detect-deployment-bump.sh` from its `screens:` list, and separately named the `deploy_only` dispatch as "the act that applies it".
- **`docs/risks/R015`** and **`R020`** carried path coordinates into the deleted `deploy/` directory.

Five artefacts, one move, and the deciding record green throughout. Nobody was careless — the referrers someone happened to be looking at _were_ repointed, in the same commits. What was missing is any mechanism that distinguished the repointed ones from the missed ones, so the missed ones surfaced by accident over the following eight days: an unrelated `gh run list`, a link check, a governance review.

**This is not a defect in ADR-046.** That is worth stating plainly, because the obvious move — bolt a fifth criterion onto ADR-046's Confirmation — is wrong for a reason that survives whatever one thinks about amendment policy. A guard asserting that referrers resolve tells you nothing about whether `packages/*` is distributable or `apps/*` is deployed. It confirms a **different proposition**. And its scope is wider and longer-lived than ADR-046's: it fires for a script renamed inside a single workspace next year, or a workflow added long after the packages/apps split stops being interesting. A criterion that reds for reasons unrelated to a decision does not belong in that decision's Confirmation section.

So the gap ADR-046 exposed is real, and the place to fix it is not inside ADR-046.

**How the two records relate, stated here rather than in ADR-046.** A reader arriving at ADR-046 to check whether it still holds should know this: its four Confirmation criteria stayed green while the move they confirm rotted five referrers, because each tests workspace membership and none can see a referrer. That is a limit of what those criteria cover, not a fault in them — and it is written here rather than in ADR-046 deliberately. ADR-046's `## Related` carries a bare navigational pointer to this record and nothing more, because a caveat on how to read a ratified Confirmation section is interpretation, and interpretation attached to a ratified record is the widest available reading of "navigational". Putting the interpretation here rather than on ADR-046 keeps the amendment boundary's first application unambiguously inside itself. **Factual correction 2026-08-18**, retained per the rule ADR-049 establishes: this read _"This record is `unconfirmed` and freely rewritable; ADR-046 is neither"_, which was the true reason at the time and stopped being true when this record was ratified in the same drain sitting. The placement is unchanged and still correct — a caveat on how to read a ratified Confirmation section is interpretation, and interpretation belongs with the record that draws the relationship, not bolted onto the record it describes.

## Decision Drivers

- A Confirmation set that can be fully satisfied while the decision's consequences have rotted is not confirming the decision.
- The rot was found by accident — an unrelated `gh run list`, a link check, a governance review — and accident is not a control.
- The worst instance was invisible for six days specifically because it lived on a `schedule`-triggered surface nobody waits on. Detection cannot depend on someone looking.
- Inspection-based criteria were already flagged as provisional by ADR-046 itself: its criterion 4 says the rule is "currently checkable by inspection … and should become an assertion when a third arrives". Inspection is what failed here, before the third directory arrived.
- The guard's scope exceeds any one layout decision, so it needs a home that outlives the move that motivated it.

## Considered Options

1. **A standalone decision, composing with ADR-046 rather than modifying it (chosen)** — record the referrer-resolution rule in its own right, with its own executable Confirmation.
2. **Leave it** — the rot was found and fixed each time, so arguably the existing review surfaces suffice.
3. **Put the criterion inside ADR-046** — as a fifth Confirmation criterion, whether by supersession of that section or by amendment in place.
4. **A broad "no stale references anywhere" lint** — one check over every path-like string in the repo.

## Decision Outcome

Chosen option: **"A standalone decision, composing with ADR-046 rather than modifying it"**.

**The rule: a tree move is not complete until its referrers resolve, and that is asserted mechanically rather than by inspection.** It applies to any move — a package relocated between `packages/*` and `apps/*`, a script renamed inside one workspace, a document reorganised — and is not scoped to the layout question ADR-046 settled.

**The guards must sit outside the surface they protect.** This is the load-bearing part rather than an implementation note. A check living inside `perf-regression.yml` would only have run when `perf-regression.yml` ran — which was the broken thing. Running in the ordinary unit suite is what lets the check reach a workflow nobody triggers.

Option 3 — putting the criterion inside ADR-046 — was the first draft of this record, and it is wrong for a reason independent of amendment policy: **criterion 5 would not confirm ADR-046.** ADR-046 decides a layout rule, and all four of its criteria test that rule. A green referrer guard says nothing about whether `packages/*` is distributable or `apps/*` is deployed. Worse, the guard is repo-wide and permanent, so it would fire inside ADR-046's Confirmation for moves that have nothing to do with the packages/apps split — a criterion reddening for reasons unrelated to the decision it purports to confirm.

There is also a policy question here, and it is recorded rather than leaned on, because this decision does not need it. **The user's standing direction is that ADRs are not amended** — "an ADR should be a single decision; additional decisions go in a new ADR" — on the grounds that an amendment is never itself ratified yet inherits the parent's ratification. `DECISION-MANAGEMENT.md` reaches the same concern and resolves it differently: it permits amendment as "by far the most frequently exercised" treatment, requiring **retain-as-history** once a decision is ratified and implemented, and its own rationale is nearly the user's words — the marker "attests to the substance as it stood at `oversight-date`, and an amendment afterwards neither re-runs the ratification nor clears the marker." Those two positions are not reconciled, and reconciling them is not this decision's business. **This record deliberately does not rest on either**, because the scope argument above decides the question on its own. The conflict is tracked as **P102** (`docs/problems/open/102-no-amendment-directive-conflicts-with-decision-management.md`) — named rather than left as "flagged for resolution elsewhere", because an ADR is a fine place to record a conflict it does not decide and a poor place to hold one.

Option 2 loses on the record in the Context: three of the five instances were found by unrelated activity, and the six-day one by an accident of scrolling. "We caught them all" describes luck, not a control, and the next one has no reason to surface as quickly.

Option 4 was rejected as unfalsifiable in the direction that matters. A lint over every path-like string in a repo this full of deliberate historical references — ADR-001, ADR-040 and ADR-045 all discuss `deploy/` and `deploy_only` correctly, as history — produces a permanent exemption list, and an exemption list is where a real finding goes to hide. Narrow guards that are exactly right beat a broad one that is routinely overridden.

**ADR-046 is untouched.** Its rule, its criteria, its status and its ratification marker all stand. This record composes with it and with ADR-045, ADR-007, and any future move equally.

## Consequences

### Good

- The rot class that produced six unread nights of CI failure now reds the unit suite on the commit that introduces it.
- The guards are derived, not enumerated: `workflow-npm-scripts-resolve` reads the root `workspaces` glob, so a package added tomorrow is covered without touching the test.
- ADR-046's criterion 4 anticipated that inspection would not hold. This acts on that before the third directory arrives rather than after.
- The rule has a home that outlives the move that motivated it. A guard scoped to the whole repo does not sit inside a layout decision it exceeds and outlives.

### Neutral

- ADR-046's status, Decision Outcome and layout rule are all untouched. This is not grounds to promote or reopen it.

### Bad

- **The guards cover less than the criterion's wording suggests, and enumerating the gaps makes them sound smaller than they are.** `workflow-npm-scripts-resolve` sees `npm run <script>` and nothing else — not bare script paths, not `npx`, not module imports inside `node -e` blocks. The second `perf-regression.yml` defect was exactly such an import, and it was found by a human reviewer, not by this. `doc-links-resolve` sees relative links and not prose: `terraform-plan.yml`'s present-tense instruction about a deleted input would still pass both.
- **Nothing here detects a referrer that is stale in meaning rather than in syntax.** A path that still resolves but now points at the wrong thing is invisible to both guards, and that is the harder half of the class.
- **~~ADR-046's body carries no forward pointer to this record.~~ DISCHARGED 2026-08-18, before this record landed.** The user resolved the amendment-policy conflict (P102) by scoping the directive to substance: a `Related:` cross-reference carries no decision content, so there is nothing in it to ratify and the marker cannot falsely attest to it. `DECISION-MANAGEMENT.md` now says so, and ADR-046's `## Related` carries a navigational pointer here. Retained rather than deleted because the reasoning is worth keeping — and because an earlier draft of this bullet got it wrong twice: it claimed no forward pointer existed at all, when ADR-046's compendium entry already carried the edge and that entry is the routine review surface under ADR-077; and it charged the remaining gap to composing-rather-than-modifying when the cause was the prohibition, which laundered a contingent cost into an inherent one.
- **That compendium edge is itself hand-maintained and unasserted.** `decisions-invariants.test.mjs` checks that ADR ids on a `Related:` line resolve to a file; nothing asserts that ADR-046's line names ADR-048 specifically. It lives in a file headed AUTO-GENERATED whose generator is documented-destructive. This record's forward reachability therefore rests on an edge that a regeneration could drop silently. Accepted rather than mechanised: asserting one hardcoded pair inside a general-purpose fence trades one rot class for another, and if a second instance arises the general mechanism becomes worth building. Recorded so the dependency is not implicit.
- One more ADR in a corpus of 48, recording a rule that could plausibly have been three lines in a contributing guide. The justification is that it was invisible to decision-level review for eight days, and a guide nobody consults would have been too.

## Confirmation

Each of these was **run**, not asserted, at capture. That matters more than usual here: three Confirmation criteria written earlier in this same session turned out to be unrunnable or false when executed, and that is why this section states only what executes.

**The criteria are scoped to what the guards actually check, deliberately.** The rule in the Decision Outcome is general — referrers resolve — but a Confirmation criterion phrased that generally would overclaim, and the overclaim would travel further than its caveat: the decisions compendium carries the `Confirmation:` line into the architect's routine review surface while omitting Consequences by design. A reader there would see "referrers resolve, asserted mechanically" with no way to learn what is out of scope. So the general rule stays in the Decision Outcome as intent, and the criteria below name their own limits.

1. **Every `npm run <script>` in `.github/workflows/**` resolves to a script declared in the scope it runs in**, honouring `-w`/`--workspace` and derived from the root `workspaces` glob — `test/js/__tests__/workflow-npm-scripts-resolve.test.mjs`, 2/2 at capture.
2. **Every relative documentation link resolves to a file** — `test/js/__tests__/doc-links-resolve.test.mjs`, green in the ordinary suite (518/518 overall at capture).
3. **Both guards run outside the surfaces they protect**, in `npm run test:js` on every push — so a workflow nobody triggers still cannot carry an unresolvable script, which is the property the six-night failure turned on.
4. **The workflow guard catches the real defect, not a synthetic one.** Reverting `perf-regression.yml`'s repoint to `npm run genversion` reds it with the remediation named in the message; pointing `-w` at a nonexistent workspace reds it. Both mutations run and reverted at capture.
5. **Neither guard can pass by matching nothing.** The workflow guard asserts the corpus is non-empty, that more than five invocations were matched, and that workspace resolution returned packages — a runner that matches nothing and reports success is a failure class this repo has already hit.

**NOT COVERED, and the list is longer than it first looks.** These two shapes only. Uncovered referrer kinds: bare script paths, `npx`, module imports inside `node -e` blocks — which is exactly the second `perf-regression.yml` defect, found by review rather than by test — Dockerfile `COPY`, `turbo.json` pipeline paths, `.github/actions/**`, `.husky/` hooks, Terraform `source`/`filename`, and `package.json` `files`/`bin`/`exports`. Uncovered surfaces: root `package.json` scripts, `scripts/*.sh`, `.husky/`. **Factual correction 2026-08-18**, retained per ADR-049: this also listed repo-root markdown as uncovered, which stopped being true in the same commit — `doc-links-resolve.test.mjs`'s corpus was widened to `DECISION-MANAGEMENT.md`, `PROBLEM-MANAGEMENT.md`, `RISK-POLICY.md`, `AGENTS.md` and `CLAUDE.md` after a load-bearing pointer landed in one of them carrying a mutable `.proposed.md` suffix. Fenced code blocks are skipped there, so a format sample is not mistaken for a reference; an illustrative link written outside a fence remains indistinguishable from a real one. And neither guard sees a referrer that **resolves while being stale in meaning** — `terraform-plan.yml`'s present-tense instruction about a deleted input passes both. ADR-046's own Bad consequence enumerates four shapes a path grep structurally cannot find; criterion 1 covers none of them.

## Pros and Cons of the Options

### A standalone decision composing with ADR-046

- Good, because the rule sits where its scope belongs, rather than inside a decision it exceeds and outlives.
- Good, because the guards run where the rot is, not where the rotted thing runs.
- Good, because it needs no position on the unresolved amendment-policy question to stand up.
- Bad, because the guards' coverage is narrower than "referrers resolve" sounds.
- Bad, because ADR-046's Confirmation section still reads as complete to anyone who does not find this record.

### Leave it

- Good, because every instance so far was in fact found and fixed, at no tooling cost.
- Bad, because they were found by accident, and one took six days on a surface nobody watches.
- Bad, because it leaves ADR-046 claiming confirmation it does not deliver.

### Put the criterion inside ADR-046

- Good, because the new criterion would sit exactly where a reader of ADR-046 looks.
- Bad, because it would not confirm ADR-046 — a green referrer guard says nothing about the packages/apps split.
- Bad, because the guard is repo-wide and permanent, so it would red inside ADR-046's Confirmation for moves unrelated to that decision.
- Bad, because it needs a position on the unresolved amendment-policy question, and this decision does not.

### A broad "no stale references anywhere" lint

- Good, because it would catch classes the narrow guards miss, including the `node -e` import.
- Bad, because this repo is full of deliberate historical references to `deploy/` and `deploy_only`, so it would need a standing exemption list — and an exemption list is where a real finding hides.
- Bad, because a check that is routinely overridden trains people to override it.

## Reassessment Criteria

- **A moved-path referrer rots again in a class the guards do not cover.** Most likely a `node -e` import, a bare script path, or prose that is stale in meaning while resolving fine. That falsifies the criterion's wording rather than its intent, and the answer is to widen the guard, not to widen the claim.
- **The guards produce a false red that gets worked around.** An exemption added to `workflow-npm-scripts-resolve` is the measurable form of the option-4 failure this decision rejected. One is a signal; a list is the failure.
- **A clause-level supersession is proposed for a defect that is not dead-or-wrong text** — a criterion set that is merely incomplete, or a decision that composes with the parent rather than replacing part of it. That is the supersession route being over-applied, and **one instance is the signal**. This criterion is written to fire on the first draft of this very record, which reached for supersession because it was believed to be the only route available; a trigger that merely counted invocations would have waited for a third and missed the one in front of it.
- **The amendment-policy conflict recorded in the Decision Outcome is resolved, either way — tracked as P102.** `DECISION-MANAGEMENT.md` permits amendment with retain-as-history; the user's standing direction prohibits it. Whichever wins, records written under the other reading need re-reading, ADR-047 first. **Resolution toward the document, or toward scoping the directive to substance, also discharges the forward-pointer Bad consequence above** — that cost is contingent on this question, not inherent to composing.
- **`apps/website` lands** and the referrer surface widens beyond workflows and docs to whatever a second deployable brings. ADR-046's own first reassessment criterion fires at the same moment.

## Related

- **ADR-046** (`046-packages-are-distributable-apps-are-deployed.proposed.md`) — **composes with, does not modify.** Its layout rule, four Confirmation criteria, status and ratification marker are all untouched. The move it decided is what exposed the gap this record closes, and its criterion 4 already flagged inspection-based criteria as provisional.
- **ADR-047** (`047-dead-conditionals-retired-by-supersession.proposed.md`) — the clause-level supersession route, which this record deliberately does **not** use. ADR-047 retired text that was dead; this adds a rule that is new. Those are different defects and the first draft of this record conflated them.
- **ADR-045** — the changesets-armed release-PR merge, whose arming depends on the same `workspaces` glob ADR-046 decided.
- **P032** (`docs/problems/known-error/032-no-ci-perf-regression-detection.md`) — its "awaiting a clean validation run" exit criterion was unreachable for the six-night window, which is where the first instance surfaced.
- **P102** (`docs/problems/open/102-no-amendment-directive-conflicts-with-decision-management.md`) — the unresolved amendment-policy conflict this record declines to decide, and the owner of the forward-pointer cost.
- **P101** (`docs/problems/open/101-scheduled-workflow-loud-failure-has-no-reader.md`) — the sibling defect this does _not_ fix: detection is not delivery, and an unread red is the reason the six nights were possible.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer` — its "Infra-boundary release steps are checkable artefacts, not memory" outcome is what inspection-based criteria fail.
