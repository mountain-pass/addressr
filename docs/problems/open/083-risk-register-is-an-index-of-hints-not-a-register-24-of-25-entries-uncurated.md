# Problem 083: The risk register is an index of hints, not a register — 24 of 25 entries uncurated

**Status**: Open
**Reported**: 2026-08-03
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Possible (3) — derived at capture; every risk assessment runs without a lifetime baseline, which is a governance-quality cost rather than a runtime one
**Origin**: internal
**Effort**: M — derived at capture: triage is done (below); the remaining work is ~8 real curations plus ~10 retirements and merges, no code
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`docs/risks/` holds 25 active entries. **Twenty-four still carry the ADR-026 ungrounded-output sentinel `not estimated — no prior data` in every scoring field**, with `Owner: pending review`, `Treatment: pending`, and a `Next review` date that in most cases has already passed. They were auto-scaffolded by the Phase 2b drain (wr-risk-scorer ADR-056) from `RISK_REGISTER_HINT` lines emitted by the pipeline scorer, and nothing has drained the curation queue since.

The consequence is not abstract. **Every risk assessment run in this project reports "no lifetime baseline to reconcile against."** The scorer said so on all sixteen assessments during the 2026-08-02 ADR-041 cutover and decommission — for R003, R007, R008, R009, R010, R012, R015, R018, R020, R021, R022, R024 and R026. So the register functions as an index of what the scorer has _noticed_, not as a register of what the project has _decided about_. Its ISO 31000 § 6.4.3 job — recording residual risk and the treatment decision — is unperformed for 96% of entries.

R010 was curated 2026-08-03 (commit `9507d29`) as the worked example. That curation is the template for the rest, and it surfaced what the work actually involves: grounding the scores, splitting evidenced controls from procedural ones, correcting a re-assess trigger that fired on scorer noise rather than on the hazard, and wiring `Realised-as` to the ticket that treats it.

## Symptoms

An assessment cites a catalog entry, finds `not estimated` in every field, and proceeds on the per-action score alone. The entry contributes a slug match and nothing else. Meanwhile R010 — the entry pricing the warm-standby trade — sat unread through **three** cutovers, because its re-assess trigger was "any new pipeline hint with this risk_slug", which fires on scorer activity rather than at the decision point.

## Workaround

Assessments proceed without a baseline and say so. That is honest and it is also the whole problem: the register cannot contradict a per-action score it has no content to contradict with.

## Impact Assessment

- **Who is affected**: the maintainer, and every future risk assessment. No consumer or runtime path.
- **Frequency**: every assessment. Sixteen in one session.
- **Severity**: Moderate. The cost is governance quality — decisions get made on per-action scores with no institutional memory of whether this hazard has been priced, accepted, or treated before. The R010 case shows the concrete failure: an entry that would have told someone the rollback net had never been exercised, unread through three opportunities to read it.

## Root Cause Analysis

The scaffold path is automated and the curation path is not. `RISK_REGISTER_HINT` → Phase 2b drain → new `.active.md` with sentinels is fully mechanical. Curation requires a human judgement per entry and has no cadence, no queue surface, and no skill.

Contributing: **there is no curate/update skill.** `wr-risk-scorer` 0.18.6 ships `pipeline`, `assess-*`, `bootstrap-catalog`, `create-risk`, `update-policy`, `wip` and `external-comms`. `create-risk` Step 3 mints a _new_ ID and has no path for editing an existing entry, so P079's instruction to "route via `/wr-risk-scorer:create-risk` rather than editing scoring fields by hand" cannot be satisfied as written. R010 was hand-written against the skill's Step-5 shape instead, which is the only available route.

### Triage — done 2026-08-03, so the remaining work is scoped rather than open-ended

**Duplicates and near-duplicates, merge to one (3 entries → 1):**

- R011 `read-shadow-soak-traffic-count-in-committed-docs`
- R016 `read-shadow-soak-traffic-figures-in-committed-docs`
- R004 `traffic-sample-counts-in-public-adr-prose`

All three are the same hazard: absolute traffic figures committed to a public repo. R011 and R016 are near-identical by title. Merge into one entry with the combined evidence log; the control (express as ratios, never absolute counts) is already in force and proved itself repeatedly during the ADR-041 work.

**Likely retirable — verify then retire:**

- **R001** `aws-managed-opensearch-fgac-password-clobber-on-blue-green` — FGAC is **disabled** per ADR-033. `deploy/modules/opensearch/main.tf:1-5` states the clobber "has no surface here". Structurally discharged.
- **R022** `unstaged-terraform-lockfile-drift-arms-deploy-axis` — `release.yml:235` excludes the lockfile from the deploy pathspec by construction and announces the exclusion with a `::notice::`. The scorer called this "structurally discharged" during the decommission.
- **R009** `production-search-backend-major-version-cutover` — the 2.19→3.5 major cutover completed 2026-07-14; ADR-041 was an analyzer migration on the same engine version, not a major cutover.

**Search-backend cluster, heavily overlapping — consider consolidating (7 entries):** R003, R006, R007, R008, R013, R021, R025 all describe some facet of "a terraform apply against the prod root module during a search-backend change". R021 is the clearest statement of the mechanism and the others could become evidence lines on it. Decide consolidation before curating each separately, or the same reasoning gets written seven times.

**Genuinely need individual curation (~8):** R002, R012, R014, R015, R017, R018, R019, R020, R023, R024, R026 — distinct hazards with real content.

### Investigation Tasks

- [x] **Merged 2026-08-04.** R011 and R016 retired into R004, which now carries the general scope and a merged base rate of four instances. R016's description had already flagged itself as "standing R011 surface awaiting curation" — a known duplicate that outlived the curation it was waiting for. **R016's own description was carrying a live production query rate**, scrubbed at retirement; the register entry warning about committed traffic figures was committing one. R004 is scored 12 inherent / **9 residual and deliberately left ABOVE APPETITE**: the file-content surface where all four instances occurred is covered by nothing mechanical (the external-comms gate scans prose you pass to a reviewed surface, never committed file bodies), and crediting the ratio-discipline habit for a drop to appetite would contradict a four-instance base rate. Named treatment is a pre-commit scrub, not yet built.
- [x] **Checked 2026-08-04, and two of the three retirement candidates in this ticket's own triage were WRONG.** Verifying against source rather than against the triage is what caught it — the same lesson this session learned three times over on `.dry-aged-deps.json`.
  - **R001 retired.** Genuinely dischargeable: `deploy/modules/opensearch/main.tf` carries no `advanced_security_options` block and states the consequence in its header. No master user exists, so no master-user password can be reset. Scored 16 inherent / 4 residual before retirement per the R005 precedent, so the entry records what the risk was worth as well as why it no longer applies.
  - **R022 RE-SCOPED, not retired.** The triage was half right. `release.yml:235` does exclude `deploy/.terraform.lock.hcl` by name — but the entry's actual hazard is unstaged `deploy/**` drift, and `deploy/main.tf` and `deploy/vars.tf` are NOT excluded and were dirty in the working tree throughout the very session that proposed retiring it. Retiring on the narrow reading would have closed the register's only entry covering a hazard that fired as a scoring input on more than a dozen commits in three days. Now scored 15 inherent / 5 residual, at the appetite line, with the explicit-pathspec habit deliberately NOT credited.
  - **R009 NOT retired — the triage was simply wrong.** Its description says "recurs every engine cutover" in as many words. A completed cutover does not discharge a risk that recurs on the next one. Left active for individual curation.
- [x] **Decided 2026-08-04: the "seven-entry cluster" is not one cluster, and my triage was wrong for the third time on this ticket.** The triage grouped R003, R006, R007, R008, R013, R021 and R025 as "facets of a terraform apply against the prod root module during a search-backend change", proposing R021 as the consolidation target. Reading the bodies rather than the slugs gives a different answer:

  - **A real apply-axis cluster of four**: R003 (EB redeploy during any apply), R007 (apply provisioning a NEW parallel domain), R021 (the push-tier trigger), R025 (the same axis with its manual path unexercised) — plus R022, already curated. These genuinely share a mechanism and R021 is the clearest statement of it. **Consolidation is still the right call for these**, and it is the remaining work.
  - **R006 is not in the cluster at all.** It is a _runtime availability coupling_ — `/health` returns 503 on a failed OpenSearch ping while EB has Automatically-Terminate-Unhealthy-Instances on, so a sustained false-503 pulls healthy instances. Nothing to do with an apply. It was grouped on the word "OpenSearch". **Curated individually** (see below).
  - **R008 is not in the cluster either.** Its hazard is a ranking regression surviving the deploy-time `/health` auto-rollback, because the rollback sees connection failures and not relevance. That is the P075 / P078 surface, not an infra one.
  - **R013 was not a risk at all.** Retired — see below.

  **The triage failure mode is now three-for-three and always the same:** it grouped and dispositioned entries by slug words rather than by mechanism, which is exactly why R022's stale title ("Lockfile") produced a wrong retirement proposal. A slug is an identifier. Reading it as a description is what produced every wrong call on this ticket.

- [x] **R008 and R009 curated 2026-08-05.** Both cutover risks, deliberately kept separate: R008 is _wrong results_, R009 is _untested at full concurrency_. Different mechanisms on the same event.
  - **R008** (16 inherent / **8 residual, above appetite**, Mitigate) — a ranking regression that passes the health gate. **Not hypothetical: it fired at the most recent cutover.** ADR-041 was measured across 800 pairs — 793 of 800 top-1 unchanged, 4 regressions and 3 improvements, net −1, plus three genuine exact-to-range flips found by hand across the full 5,991-pair frame. The regressions were judged acceptable, and the point is that the judgement was only possible because someone measured. P069 is the hiding half at full duration: four years live, because nothing was wrong with the _connection_.

    The `exact-vs-range-frame.json` control did not exist when this was scaffolded, and it is credited as a **tool rather than a gate** — `grep` confirms nothing under `test/integration/` references it and CI's `test:integration:search` does not run it. Likelihood 2 not 1 for exactly that reason. Named treatment: make the frame a documented cutover-playbook step with a stated blocking threshold, not a CI job (it needs two live domains and exceeds any push-gate budget). Run at one cutover of four.

  - **R009** (15 inherent / **8 residual, above appetite**, Mitigate) — the concurrency gap. The soak mirrors real production query _distribution_ for 33.8 h, but a mirror is fire-and-forget: nothing waits on the response. At the flip the domain serves the real stream with consumers attached, for the first time. Impact reduced 5 → 4 by the exercised-and-timed rollback (6m36s), **conditional on the standby still existing** per R010. The k6 harness is named as NOT a control on its measured 3× noise floor (P032). Named treatment: use P079's retention window as the concurrency check it already is, with an explicit verification step rather than an elapsed-volume count.

    **This also corrects a fourth-listed triage error.** P083 listed R009 as retirable because the 2.19→3.5 cutover completed 2026-07-14. Its description says "recurs every engine cutover" in as many words — a standing risk is not discharged by one instance of it not firing.

- [x] **R021 and R003 curated 2026-08-04, closing the apply-axis group.** Both verified in source rather than from their descriptions, and the pair demonstrates why the consolidation was rejected.
  - **R021** (15 inherent / **5 residual, at the line**, Accept) — the push-tier trigger. `release.yml` gates three deploy entry points differently, and this is the only one where a routine `git push` reaches production infrastructure, with no plan-approval step and no blue/green. Base rate as at 2026-08-04 is three successful production applies (`33e6c04`, `96e965c`, `2e557b9`); a fourth followed 2026-08-05 against an empty plan, so it exercised the trigger rather than an apply — see R021's Monitoring cell, which is the canonical count. Held AT the appetite line rather than below it deliberately: the gap between "an apply starts" and "an apply is reviewed" is unclosed by design on this path, three applies is a small sample against a Severe impact, and an entry at 5 keeps the gap legible. Scoring it lower on the base rate would make the register agree with the axis rather than describe it.
  - **R003** (16 inherent / **8 residual, above appetite**, Mitigate) — what an apply _does_. `deploy/main.tf:28` binds `version_label` to the application-version resource, so any apply that moves it redeploys the live serving environment. **Impact is UNREDUCED at 4 after a correction during review, and the correction is the fifth instance of this ticket's pattern in a new costume.** The first draft scored 3 by crediting `create_before_destroy` and a "rolling" deploy. Both were withdrawn against the configured values: `DeploymentPolicy = "Rolling"` is a policy _name_ while `BatchSize = 100 Percentage` cycles the whole fleet at once, and `create_before_destroy` engages only on resource _replacement_, never on the in-place `version_label` update the entry is named after. `ADR-001`'s 2026-07-26 Correction had already documented that exact conflation — so the draft reproduced an error the repo had already corrected. Only `RollbackLaunchOnFailure` survives for the modal case, and a recovery control bounds duration rather than reducing impact.

    **The pattern, now five for five:** four wrong calls came from dispositioning by _slug_ rather than by body; this one came from crediting a control by its _name_ rather than its configured value. Same root shape — the label trusted over the mechanism. Held above appetite on the honest gap: the rollback covers _launch_ failure, not a version that launches cleanly and behaves wrongly — R008's shape, and what P069 hid for four years. Named treatment is the ADR-031 read-shadow soak pattern applied to the application tier.

  **The pair is the proof the consolidation would have been wrong.** R003 is trigger-independent: it fires identically on a publish-triggered deploy, a release-tier dispatch and a push-tier `deploy/**` change. Folding it into R021 would have hidden a hazard that survives closing R021's governance gap entirely.

- [x] **The apply-axis consolidation, worked 2026-08-04 — and the triage was wrong a FOURTH time, in a new way.** It proposed folding four entries onto R021. Reading the bodies:

  - **R020 and R025 are a genuine duplicate pair, and R025 names R020 in its own description.** R020 was not in the triage list at all. Merged: R025 retired into R020. Same self-declared-duplicate shape as R011/R016 into R004 earlier in this drain, which means the drain has now produced two duplicate pairs that each flagged themselves and then outlived the curation that would have caught it.
  - **R003, R007 and R021 are three DIFFERENT hazards and must not be consolidated.** R021 is about _who can start an apply_ (the push-tier trigger and its governance level). R003 is about _what any apply does_ (EB redeploy on the live app) and fires regardless of trigger, including on a release-tier dispatch. R007 is about a _specific apply shape_ (provisioning a new parallel domain). Folding them onto R021 would repeat the exact error this ticket keeps making: grouping on the word "terraform apply" rather than on mechanism.

  So the real answer is one merge, not a four-into-one consolidation. **Four wrong triage calls, one root cause each time: dispositioning by slug rather than by body.**

- [x] **R020 re-scoped on measured evidence, and the premise had half-changed.** Its hazard was a conjunction — the push-tier axis is armed AND the manual `deploy_only` path is unexercised. Both halves checked against the Actions history rather than assumed:
  - **Axis half DISCHARGED.** Three successful production applies as at 2026-08-04 (a fourth followed 2026-08-05 against an empty plan; see R021) (`33e6c04` ADR-041 cutover, `96e965c` and `2e557b9` decommission), each verified by reading the `Deploy new version` step's conclusion in the `release` job.
  - **Recovery half NOT.** All four `workflow_dispatch` runs of `release.yml` skipped `Deploy new version`, `Wait for deployment to stabilize` and `Smoke test production`, so as at 2026-08-04 `deploy_only=true` had never been dispatched — zero exercises at that point. First dispatched 2026-08-05, twice, against a plan that changed nothing; see R020.

  The inversion is the finding: the path that was supposed to be proven first was, as at 2026-08-04, the one still unproven, and the path armed on the strength of that deferral is now well-exercised. Scored 12 inherent / **8 residual, above appetite**, Treatment **Mitigate** with a one-action fix — dispatch it once with the box ticked, against already-deployed code on a green master, at a time of the operator's choosing rather than during an incident.

  Note the base rate this joins: the project has now twice armed a production capability on "we will exercise the fallback later" and twice not done it (R010's warm-standby net, 0-for-2 until the 2026-08-02 drill; this path, 0-for-4 dispatches as at 2026-08-04). R010's took a session to close. This one takes a dispatch.

- [x] **R006 curated 2026-08-04, and its scaffolded score corrected in both directions — ending UP at 10/25.** The hint said residual 8/25, above appetite. Reading `src/es-health.js` and `deploy/main.tf` gives 5/25, at the line: the hint had not counted the ELB `UnhealthyThreshold` of 5 consecutive failures at 10s (~50s sustained before the pool acts) or the `HEALTH_ES_PROBE=off` kill switch that reverts `/health` to always-200 **without a redeploy**. That last control is the one that matters under a live incident, because it does not need the deploy path a health-gated failure may itself be blocking. Unusually for this register, all four controls are structural — no procedural control carries any weight. Treatment **Mitigate**, not Accept — and that changed during review. The first draft scored likelihood 1 on the strength of the ~50s window and recorded Accept. The risk scorer challenged it: the window absorbs transients, but two paths never self-clear — a permissions change denying `HEAD /` while `_search` still works, and overload amplification where a saturated cluster exceeds the 2000 ms probe timeout and pulling API instances cuts serving capacity without relieving the cluster. Likelihood 2, **residual 10/25, above appetite**, with two named controls not yet built (distinguish probe-timeout from unreachable; alert before `UnhealthyThreshold` acts). The coupling itself stays: removing it re-opens the ADR-029 failure mode where a bad cutover deploys cleanly and breaks search silently.

  **Two of the six entries curated so far sit above appetite** (R004 at 9, R006 at 10). That is the expected shape of an honestly-scored register, not a scoring failure — and it is the opposite of what the sentinel-bearing version implied, which was silence.

- [x] **R013 retired 2026-08-04 as a scoring artefact rather than a hazard.** Its description reads "Single staged change scores impact 5 / likelihood 1 = 5/25 Medium with no mitigating control" — a description of a _score_, naming no asset, no failure mode and no condition that could occur. "A single staged change" is every commit this project has made. It also misstates the appetite: it claims 5/25 "breaches the Threshold-5 appetite", but `RISK-POLICY.md` sets 5 **inclusive**, so 5 is within appetite by definition. The entry was scaffolded from a scorer narrating the shape of a score it had just emitted, not reporting a hazard it had found — the drain cannot tell those apart. Retired rather than curated, because filling in its fields would mean inventing a hazard to fit a slug.
- [x] **Curate the remainder against the R010 template — DONE 2026-08-05.** All 16 active entries curated across seven batches; zero carry the ADR-026 sentinel. See the Progress table and close-out below.
  - **R023 curated with the strongest evidence in the register.** Upgraded from hypothetical to **observed**: it fired on 2026-08-03, reporting a red master as a successful push and hiding the Babel 8 regression. Scope widened from `docker-publish` to the allow-listed-job-names class, which affected BOTH watcher scripts across four distinct selectors. 16 inherent / 4 residual, held above Rare-and-retired because both fixes are verified against a REPLAYED run rather than a live failure.
  - Every curation so far has named a control the scaffold would have credited and the evidence does not support: R010's retention gate, R022's explicit-pathspec habit, R004's ratio convention. That distinction — evidenced versus procedural — is the template's most load-bearing part.
  - Re-assess triggers: all four now fire at the decision point (a proposal to enable FGAC; `deploy/**` dirty at session start; a new job in `release.yml`; a fifth traffic-figure instance) rather than on "any new pipeline hint with this risk_slug", which fires on scorer noise and is why this register sat uncurated.
- [ ] Report the missing curate/update skill upstream to `windyroad/agent-plugins` per the P077 precedent — `create-risk` cannot edit an existing entry, which is why P079's routing instruction is unsatisfiable
- [ ] Consider a cadence: the drain scaffolds continuously, so without one this backlog re-forms

## Dependencies

- **Blocks**: (none directly, but every assessment is degraded until the cluster entries at least carry baselines)
- **Blocked by**: (none)
- **Composes with**: P079, P077

## Progress

| Batch | Date          | Entries                                                                                                      | Register after         | Sentinel-bearing after |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------- |
| 1–5   | 2026-08-04/05 | R001, R011, R013, R016, R025 retired; R004, R006, R020, R022 re-scoped; R003, R008, R009, R021, R023 curated | 20 active / 6 retired  | 10                     |
| 6     | 2026-08-05    | R002, R014, R017, R019 retired; R012, R015, R018 curated                                                     | 16 active / 10 retired | 3                      |
| 7     | 2026-08-05    | R024, R026 retired; R007 curated; **R027 + R028 created**                                                    | 16 active / 12 retired | **0**                  |

## The drain is complete

**Zero entries carry the ADR-026 ungrounded-output sentinel.** Every one of the 16 active entries has grounded scores, a control list that separates evidenced from procedural, a treatment decision, a named owner, and a re-assess trigger keyed on the hazard rather than on scorer activity.

**Eleven of the 16 sit above appetite** — R006 at 10, R004 and R027 at 9, R003/R008/R009/R015/R020 at 8, R007, R012 and R028 at 6. Of the remaining five, three (R010, R021, R022) sit exactly at 5, which is within appetite because the threshold is inclusive. R020 briefly read 4 on 2026-08-05 before the scorer withdrew the drop: exercising the path retired its plumbing sub-hazard only, and both exercises ran against a plan that changed nothing. R028 moved 8 → 6 in the same sitting when two mechanical checks landed; a first draft put it at 4 and within appetite, and the scorer withdrew that because one check covered a single phrasing and the other did not run in the gate at all.

That is what an honestly-scored register looks like, not a backlog signal. Scoring any of them down to 5 to tidy the number would be the failure this ticket was opened about — and the temptation is real precisely because three entries already sit on the line.

Batch seven also closed a gap this ticket would otherwise have shipped past: **R027 did not exist.** P077 had cited it by slug since 2026-08-02 as the treatment target for the deferral-scoring defect, so a drain declaring "every entry curated" while a cited entry was missing would have reproduced the defect in miniature. It was created and scoped to the _class_ — an action priced against an unscored baseline, of which deferral and inaction are two observed instances — rather than to deferral alone, which would have repeated R022's title-versus-class defect.

### The drain's own last lesson

The risk scorer, run on the batch that declared the register curated, found **nineteen drift instances still live** in it on that pass — a sixth category surfaced on a later pass, bringing the tabled total on [R028](../../risks/R028-register-curation-unmechanised-so-it-drifts-against-itself.active.md) to twenty: two contradictory above-appetite counts in this file, five duplicated `## Change Log` stanzas, nine entries asserting in present tense that their own grounded fields were ungrounded, two Descriptions quoting superseded residuals, and one unchecked task claiming "~15 sentinel-bearing entries remain" directly above the section declaring zero.

All were repaired. The point worth keeping is that this is what one batch of careful hand-maintenance produced **while the maintainer was actively watching for exactly this class of error**, having already caught one instance of it in the same sitting. That is the evidence base for [R028](../../risks/R028-register-curation-unmechanised-so-it-drifts-against-itself.active.md), and the reason its treatment is a test rather than more care.

### What remains, stated rather than implied

- **The root cause is untouched.** There is still no curate/update skill: `wr-risk-scorer`'s `create-risk` mints a new ID and has no path for editing an existing entry, so every curation here was hand-written against its Step-5 shape (13 curated across the seven batches, plus R027 and R028 created outright, plus R010 curated 2026-08-03 before the drain opened — 16). P079's instruction to "route via `/wr-risk-scorer:create-risk` rather than editing scoring fields by hand" remains unsatisfiable as written. The scaffold path is automated; the curation path still is not. **That asymmetry is now bounded rather than removed**: `test/js/__tests__/risk-register-invariants.test.mjs` landed alongside R028 and fails the build on a sentinel-bearing entry, a duplicated Change Log, or an index row disagreeing with its entry's own scores. The next Phase 2b drain will still scaffold ungrounded entries — it will just stop the build until they are curated, which converts silent accumulation into a loud halt. The root cause is unchanged and is not this repo's to fix.
- **Treatments named but not built**, carried on their own entries rather than here: R004's pre-commit scrub, R012's caller-composition extraction, R015's smoke parameterisation (P039), R007's provision-via-`deploy_only`, R027's `AGENTS.md` rule.
- **`docs/risks/TEMPLATE.md` exists**, despite the `create-risk` skill asserting it should not ("No `docs/risks/TEMPLATE.md` exists — per user direction 2026-05-04 the entry shape lives in this skill"). That template is what sanctions the four categories, including the `delivery` slot R027 is the first entry to use. Skill and repo disagree; the repo is what the register actually follows.

Batch six also produced work beyond curation, because R018's re-scope required it. The entry's original framing was factually wrong (it claimed a problem ticket did not exist; the file had moved), and correcting it exposed **174 broken relative doc links across 50 files** — problem tickets carry lifecycle state as a directory and ADRs carry status as a filename suffix, so every transition breaks every inbound link. All 174 were repaired and `test/js/__tests__/doc-links-resolve.test.mjs` landed as R018's evidenced control.

## Related

- **R010** (`docs/risks/R010-warm-standby-decommission-removes-instant-rollback-net.active.md`) — curated 2026-08-03 in commit `9507d29`. The worked example and the template.
- **R005** — the only prior curated entry, retired. Precedent for extending the entry shape deliberately and recording that in the Change Log.
- **P079** — its task "route via `/wr-risk-scorer:create-risk`" is unsatisfiable as written; see Root Cause.
- **P077** — the upstream-report precedent for this plugin suite, and the defect whose second instance (scoring against an implicit zero baseline) is exactly what a curated register would guard against.
- **wr-risk-scorer ADR-056** — the Phase 2b drain that scaffolds these entries. Plugin-scoped ID; this repo's ADR-056 does not exist.

Origin: internal, surfaced 2026-08-03 after curating R010 revealed that 24 of the remaining 25 entries carry the same sentinel, and that sixteen assessments in the preceding session had each reported the missing baseline without anything acting on it.
