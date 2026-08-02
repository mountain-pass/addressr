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
- **R022** `unstaged-terraform-lockfile-drift-arms-deploy-axis` — `release.yml:214` excludes the lockfile from the deploy pathspec by construction and announces the exclusion with a `::notice::`. The scorer called this "structurally discharged" during the decommission.
- **R009** `production-search-backend-major-version-cutover` — the 2.19→3.5 major cutover completed 2026-07-14; ADR-041 was an analyzer migration on the same engine version, not a major cutover.

**Search-backend cluster, heavily overlapping — consider consolidating (7 entries):** R003, R006, R007, R008, R013, R021, R025 all describe some facet of "a terraform apply against the prod root module during a search-backend change". R021 is the clearest statement of the mechanism and the others could become evidence lines on it. Decide consolidation before curating each separately, or the same reasoning gets written seven times.

**Genuinely need individual curation (~8):** R002, R012, R014, R015, R017, R018, R019, R020, R023, R024, R026 — distinct hazards with real content.

### Investigation Tasks

- [ ] Merge the three traffic-figure entries into one; retire the other two with a cross-reference
- [ ] Verify and retire R001, R022, R009 per the reasoning above (the register README documents a `.retired.md` rename; R005 is the precedent)
- [ ] Decide whether the seven-entry search-backend cluster consolidates onto R021 before curating any of them individually
- [ ] Curate the remainder against the R010 template — grounded scores, evidenced-versus-procedural controls, a re-assess trigger that fires at the decision point rather than on scorer noise, `Realised-as` wired
- [ ] Report the missing curate/update skill upstream to `windyroad/agent-plugins` per the P077 precedent — `create-risk` cannot edit an existing entry, which is why P079's routing instruction is unsatisfiable
- [ ] Consider a cadence: the drain scaffolds continuously, so without one this backlog re-forms

## Dependencies

- **Blocks**: (none directly, but every assessment is degraded until the cluster entries at least carry baselines)
- **Blocked by**: (none)
- **Composes with**: P079, P077

## Related

- **R010** (`docs/risks/R010-warm-standby-decommission-removes-instant-rollback-net.active.md`) — curated 2026-08-03 in commit `9507d29`. The worked example and the template.
- **R005** — the only prior curated entry, retired. Precedent for extending the entry shape deliberately and recording that in the Change Log.
- **P079** — its task "route via `/wr-risk-scorer:create-risk`" is unsatisfiable as written; see Root Cause.
- **P077** — the upstream-report precedent for this plugin suite, and the defect whose second instance (scoring against an implicit zero baseline) is exactly what a curated register would guard against.
- **wr-risk-scorer ADR-056** — the Phase 2b drain that scaffolds these entries. Plugin-scoped ID; this repo's ADR-056 does not exist.

Origin: internal, surfaced 2026-08-03 after curating R010 revealed that 24 of the remaining 25 entries carry the same sentinel, and that sixteen assessments in the preceding session had each reported the missing baseline without anything acting on it.
