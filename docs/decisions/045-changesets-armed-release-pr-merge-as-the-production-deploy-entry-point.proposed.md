---
status: 'proposed'
date: 2026-08-10
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent, wr-risk-scorer:pipeline]
informed: []
reassessment-date: 2026-11-10
---

# Changesets-armed release-PR merge as the production deploy entry point

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context; human-oversight: unconfirmed until ratified at the /wr-architect:review-decisions drain.

## Context and Problem Statement

Two prior decisions each reached this question and each explicitly declined to answer it, reserving it for this record:

- ADR-001 (`001-risk-gated-release-process.proposed.md:57`) — _"The successor entry point — an infrastructure change carrying a changeset for a deployment package, with the release-PR merge as the apply — is a separate decision and will be recorded in its own ADR rather than smuggled in here."_
- ADR-040 (`040-release-pipeline-change-type-action-matrix.proposed.md:303`) — _"**What this does NOT do.** It does not establish the successor entry point."_

The gap they left is live. On 2026-08-10 the `deploy/**` push-tier apply axis was retired (commit `dd9c950b`) because its detection predicate diffed a **path**, so a rename _out of_ `deploy/` presented as deletions _under_ it and would have armed a production Terraform apply on a pure refactor. That left `deploy_only` — a `workflow_dispatch` boolean — as the only route to a production infrastructure apply, and R020 scores that route at residual 10, above the appetite of 5.

The user's governing principle, stated the same day, rules `deploy_only` out as the permanent answer: _"there should be only one pipeline path to production. Some of the steps may may not trigger. that is okay. But it's One pipeline."_ and _"I don't want it being a flag that the agent has to provide from our local machine. The change sets should determine what does and doesn't trigger and deploy."_

`deploy_only` passes the first test and fails the second. It dispatches the same `release.yml` and reaches the same steps, so it is not a second pipeline — but nothing in the repo records that a deploy was wanted or why. No changeset, no CHANGELOG entry, no reviewable artefact. The question this ADR answers is therefore not _"is it one pipeline?"_ but _"what decides that a deploy happens?"_, and the answer must be a committed, reviewable declaration.

## Decision Drivers

- **The changesets must decide.** A value supplied at dispatch time by whoever is at the keyboard leaves no record; a changeset leaves a reviewable one, lands a CHANGELOG entry, and is visible on the release PR beside its Terraform plan.
- **One pipeline, `if:`-widened and never forked.** ADR-001's single-definition doctrine is the mechanical half of the user's principle: exactly one set of deploy steps shared by every entry point.
- **The predicate must not repeat the rename trap.** Whatever replaces the retired axis must not be defeatable by moving a directory.
- **A hand edit must not arm production.** The retirement of the `deploy/**` axis withdrew push-tier arming; a successor that lets an unreviewed local edit apply Terraform readmits it by a different door.
- **Silent-green is the failure class this repo treats as worst.** Recorded repeatedly: P044's swallowed-publish guard failing open, two harnesses passing by construction, and a rename firing a production apply — all green.
- **Deploys need their own changelog.** User: _"I want the deploys to have their own change set and change log. That's a gap we have at the moment."_

## Considered Options

1. **Changesets-armed release-PR merge (chosen)** — an infra change carries a changeset for `packages/deployment`; the deploy gate fires on that package's version bump, and merging the release PR is the apply.
2. **Keep `deploy_only` as the permanent entry point** — the status quo after the axis retirement. Rejected: it is a flag supplied from a local machine at dispatch time, which fails the user's stated principle directly, and it records nothing about why a deploy was wanted.
3. **Re-arm a path-based push axis with a corrected predicate** — keep push-to-master as the trigger but fix the rename defect. Rejected: it restores push-tier arming with no risk score and no reviewable declaration of intent, which is the hazard R021 recorded and the 2026-08-10 retirement withdrew.
4. **Auto-dispatch `deploy_only` on detecting an infra change (P039 variant 4b)** — keep the dispatch mechanism but fire it automatically. Rejected as a mechanism while adopted in substance: the chosen option _is_ variant 4b, with a committed changeset as the trigger instead of a path diff. Its deferral (`"deliberately deferred until the manual path has been exercised"`) is discharged by fact — the manual path ran on 2026-08-05, runs `30989443618` and `30991052224`.

## Decision Outcome

Chosen option: **"Changesets-armed release-PR merge"**.

**The gate.** The `release.yml` deploy gate's second disjunct becomes a conjunction of two conditions:

1. `packages/deployment/package.json`'s `version` **VALUE** differs between `github.event.before` and HEAD. Read both ends explicitly — `git show <BEFORE>:packages/deployment/package.json` — and compare the parsed values. This is **not** a path diff. `git diff --name-only` on that path presents a future move of `packages/deployment/` as a change to the file and would arm a production apply on a rename, which is the exact defect that retired the predecessor axis. A value comparison is structurally immune: on a rename the HEAD-side read _fails_ rather than _differs_.
2. The push **consumed changesets** (`.changeset/*.md` deleted in this push), so a hand-edited version bump pushed directly to master arms nothing. User-directed 2026-08-10 in preference to the simpler any-version-change predicate, on the grounds that a hand edit is not a changeset decision.

**Fail closed** when either read fails to parse: a rename, an all-zeros `github.event.before` on branch creation, a force-pushed-away parent, and a non-`push` event (which carries no `github.event.before` at all). An indeterminable range must not deploy.

**The gate moves at all three sites.** `release.yml:373` (Deploy new version), `:435` (Wait for deployment to stabilize) and `:439` (Smoke test production) carry the identical disjunct. Repointing only `:373` produces a run that applies Terraform to production and then skips the stabilise wait and the production smoke test, **green** — and the smoke test is the only control on the accepted consequence below. `test/js/__tests__/release-workflow-deploy-only.test.mjs` pins the occurrence count at three; per ADR-040's standing criterion it is updated, not deleted.

**Version resolution is unchanged.** `packages/deployment/resolve-version.sh` keeps its two-path split and its `npm view --prefer-online` registry read on the non-publish path. User-directed, verbatim: _"The deploy path MUST take the last published version."_ A proposal to read the live Elastic Beanstalk application version instead was considered and rejected in-session: if a publish succeeds and the deploy then fails, an environment read would faithfully re-ship the older version and call that safe, whereas the user's requirement is that the fix moves forward. Keeping the registry read also preserves P095's installability guarantee — ADR-040's 2026-08-08 amendment, _"whatever the registry serves is the only thing EB can actually install"_ — and needs no AWS credentials in the devcontainer, where an environment read would have widened the credential surface from Terraform's variable channel to every child process.

**The cascade, recorded here because no ADR covers it.** `.changeset/config.json`'s `updateInternalDependencies: "patch"`, combined with an **exact** version pin on `@mountainpass/addressr` in `packages/deployment/package.json`, is what makes an app changeset bump the deployment package. Loosening either — the pin to `*`, a semver range or `workspace:*`; the config to `"minor"`; or adding the deployment package to `ignore: []` — silently stops infrastructure changes deploying, **on a green run**. `private: true` on the deployment package is load-bearing for the same class of reason: it is what makes `changeset publish` skip the package while `changeset version` still bumps it. All four are pinned in test.

**Consequence of the cascade, accepted.** Because an app changeset already bumps the deployment package, committed Terraform reaches production as a rider on an ordinary app release. This is today's behaviour under `published == 'true'` and this decision preserves it rather than introducing it.

## Consequences

### Good

- The decision to deploy becomes a committed artefact — reviewable in the release PR, recorded in `packages/deployment/CHANGELOG.md`, and attributable — where the dispatch recorded nothing.
- Deploys gain their own changeset and changelog, closing a gap the user named explicitly.
- The predicate is structurally immune to the rename defect that retired its predecessor, rather than patched against it.
- One entry point instead of two, satisfying the one-pipeline principle mechanically rather than by convention.
- A hand-edited version bump cannot arm a production apply.

### Neutral

- The chosen option is P039 variant 4b in substance. Its deferral is discharged by fact rather than by decision, so adopting it reverses no standing judgement.
- `terraform-plan.yml` survives unchanged in function. It is read-only and decides nothing, so the changesets-decide principle — which governs what _triggers and deploys_ — does not reach it. Its header needs re-pointing, not its trigger.

### Bad

- **The successor starts at zero real applies of its own.** `deploy_only` had its plumbing run twice on 2026-08-05, against an empty plan; the successor inherits none of that. R020 is re-scored against the successor at the deletion commit rather than closed by the predecessor's removal, and R020's own monitoring clause ("any change to the deploy-gating expression") arms that re-score.
- **An infra-only apply ships whatever npm `latest` is.** On the non-publish disjunct `published` is false, so `resolve-version.sh` reads the registry. If production is behind, an infrastructure change carries an application upgrade with it, and the production smoke test is the only control on that.
- **The arming mechanism needs its own guard, and the guard has a residual.** _(AMENDED 2026-08-10, later the same day — this bullet read "its blocking rule is open"; the rule is settled in criterion 5.)_ A Terraform-only change carries no app changeset, so nothing releases and the author gets a green push with no signal — JTBD-400's founding incident class one level up. Criterion 5's guard converts that into a refusal at push time. **The residual it does not cover:** the guard catches the **push**, not the **merge**. A changeset written to satisfy the guard and then deleted before the release PR merges is uncaught, and so is a bypass trailer used without cause. The guard makes the omission loud; it does not make it impossible.
- **The predicate is subtler than the one it replaces**, and subtle predicates rot. Two conjuncts, four fail-closed cases and a value-not-path distinction all have to survive future tidying, which is why each is pinned in test rather than described in a comment.

## Confirmation

1. **Gate pinned at three sites.** `test/js/__tests__/release-workflow-deploy-only.test.mjs` asserts the new disjunct appears at exactly three steps — Deploy, Wait for stabilize, Smoke test — updated rather than deleted per ADR-040's standing criterion.
2. **Value-not-path proved.** A test asserts the detection step reads `git show <ref>:packages/deployment/package.json` and compares parsed values, and that the literal step id `deploy-paths` appears nowhere in `release.yml` including comments.
3. **Fail-closed proved.** A test drives the detection step with each of: a rename, an all-zeros `github.event.before`, an unreachable parent, and a non-`push` event — asserting no-deploy in every case.
4. **Cascade pinned.** `test/js/__tests__/deployment-cascade-pin.test.mjs` asserts `updateInternalDependencies === "patch"`, an exact pin on `@mountainpass/addressr`, the deployment package absent from `ignore`, and `private: true`. Each mutation-proved: `"minor"`, `"^3.3.0"`, `"workspace:*"`, and an `ignore` entry must each turn it red, with the mutation recorded in the test header per this repo's mutation-proving convention.
5. **Changeset guard. RULE SETTLED 2026-08-10, later the same day.** A change to `packages/deployment` infrastructure that will arm no deployment version bump is caught before it can sit unapplied. Runs as a `pre-push` hook **and** as a CI leg over `github.event.before..GITHUB_SHA` — on the grounds that a client-side-only gate is bypassable and the failure it guards is silent and green.

   **The rule: BLOCK when nothing pending will bump `packages/deployment`; PASS when an app changeset will cascade.** Blocking the cascade case would be a false red on the ordinary mixed push, where the apply genuinely will happen.

   **The decisive case, user's words:** _"if we have a terraform only change, then there will be no package release, so we must have a deploy changeset."_ That is what makes the guard necessary and it is narrower than the case first argued for it. A Terraform-only change carries no app changeset, so **nothing releases at all** — no release PR opens, nothing publishes, nothing deploys, and the author gets a green push with no signal. Then it worsens rather than resolves: weeks later an unrelated app changeset cascades a bump and the forgotten Terraform applies as a rider on a release nobody connected to it. A late surprise apply is worse than a loud refusal at push time.

   **A wrong argument is recorded here because it was made and withdrawn in-session.** It was first claimed that a missing changeset strands infrastructure indefinitely, and then — on noticing the cascade — that the delay is "self-clearing" because infra always rides the next changeset of any kind. Both are wrong. The first overstates: with app work in flight, infra does ride along. The second understates: it holds only when app work is in flight, and fails exactly in the pure-infra case, which is the case this entry point exists to serve.

   **Three shapes were offered and rejected** before the rule settled, and they are kept as rejected rather than deleted: block-on-real-failure-warn-on-riders (the notice half was dropped as noise), always-require-a-deployment-changeset (over-fires on every mixed push), and stop-cascade-only-bumps-deploying (changes today's behaviour for no gain once the terraform-only case is covered).

   **Trigger set.** Under `packages/deployment/`, excluding `package.json` — the file the cascade rewrites and a human edits to move the pin, covered by criterion 4 instead — and excluding documentation. **Including `.terraform.lock.hcl`, which INVERTS ADR-040's amendment point 6** (`040-…:146`), where that path was deliberately excluded from the retired push axis. The inversion is intended: under a path-diffed axis a provider bump firing an apply was an accident; under a changeset-armed gate a provider version change is a real apply that should carry a declaration. Recorded here so the two records are not left in silent disagreement.

   **Bypass: a `Deploy-Guard-Bypass: <reason>` commit-message trailer, honoured by BOTH the hook and the CI leg** (user-directed 2026-08-10). Fail-closed will block a legitimate recovery push when the parent has been force-pushed away, so a sanctioned route must exist. The trailer is chosen over a named environment variable because it makes the bypass a committed, reviewable, greppable artefact visible on the release PR — the same standard this ADR sets for the deploy declaration itself at Decision Driver 1. CI may honour it precisely _because_ it is committed rather than supplied at the keyboard; an environment variable honoured by CI would make the CI leg client-controllable and dissolve the reason for having it.

   **SEQUENCING CONSTRAINT, load-bearing.** The guard MUST NOT land before criteria 1–3 (the gate repoint). Today `packages/deployment` is `private: true`, so `changeset publish` skips it, `published` stays false, and a release PR carrying only a deployment changeset versions the package and **skips Deploy, Stabilise and Smoke, green** — stated in `release.yml:257-264` and `packages/deployment/package.json:10`. Shipping the guard first would block the terraform-only author, have them comply, and still not apply anything: a ceremony that reads as sufficient and arms nothing. That is worse than the state it replaces, where the author at least knows they must dispatch `deploy_only`. If the two are ever separated, the guard's refusal message must name `deploy_only` as the actual apply route, and that wording must be pinned in test so it cannot outlive the gap it describes.

   **Placement.** The CI leg is its own workflow, not a job in `release.yml`. A job there inherits neither the `release` job's `if: github.ref == 'refs/heads/master'` (`:199`) nor an exemption from the workflow's `pull_request` trigger (`:3-9`), so on a PR it would see no `github.event.before`, fail closed, and red every pull request — the guard people then disable, which fires this ADR's own reassessment criterion on day one. ADR-040's reasons for co-locating the docker job (`040-…:150`) and for rejecting split workflows (`:132`) both turn on reading `steps.changesets.outputs.published` and on not forking deploy steps; this guard does neither.

6. **First real apply.** R020's treatment — the first infrastructure change carrying a non-empty plan — runs through this route, sequenced behind a plan read before the merge.

## Pros and Cons of the Options

### Changesets-armed release-PR merge

- Good, because the arming declaration is committed, reviewable and attributable.
- Good, because a rename cannot arm it and a hand edit cannot arm it.
- Good, because it collapses two entry points to one without adding a second pipeline.
- Bad, because it has carried no real infrastructure mutation of its own at adoption.
- Bad, because the predicate is subtle and needs four fail-closed cases pinned in test to stay correct.

### Keep `deploy_only` as the permanent entry point

- Good, because its plumbing has been run twice and is known to work end to end.
- Good, because it requires no new machinery at all.
- Bad, because it fails the user's stated principle directly — a flag supplied from a local machine at dispatch time.
- Bad, because nothing in the repo records that a deploy was wanted or why.

### Re-arm a path-based push axis with a corrected predicate

- Good, because a path diff is simpler to write and read than a value diff.
- Bad, because it restores push-tier arming with no risk score.
- Bad, because it re-opens the class of defect that required the retirement, ten days after it.

### Auto-dispatch `deploy_only` on detecting an infra change

- Good, because it reuses a mechanism already proven for dispatch, gating and step entry.
- Bad, because the trigger would be a path diff or a heuristic rather than a declaration, so it records no intent.
- Bad, because it keeps a `workflow_dispatch` input alive as production machinery.

## Reassessment Criteria

- The first real infrastructure apply through this route fails, or reveals that the two-conjunct predicate does not fire when it should.
- The changeset guard misfires in either direction. _(RE-POINTED 2026-08-10, later the same day — this read "the blocking rule, once settled, proves to over-fire"; the rule is settled, so the criterion now names what would falsify it.)_ Specifically: an ordinary **mixed** push reds — the cascade-PASS arm is the anti-over-fire concession and a red there means it is not working — or a **Terraform-only** change slips through, which means the arm that justifies the guard is not working. Either falsifies the rule. A guard people bypass is worse than none, and the `Deploy-Guard-Bypass:` trailer appearing routinely rather than exceptionally is the measurable form of that.
- The cascade is deliberately changed (a linked or fixed package group, a different `updateInternalDependencies` value), which would move what a deployment version bump means.
- A Preview or staging environment becomes affordable. This decision was made when production is the only environment; a second environment reopens both the version-resolution question and the meaning of a deployment changeset.
- npm's major version moves, or workspace linking semantics change such that `changeset version` no longer leaves `package-lock.json` consistent enough for `npm ci`.

## Related

- **Supersedes** ADR-001's `deploy_only` entry point, and discharges the successor-ADR obligation ADR-001 `:57` and ADR-040 `:303` both recorded.
- **Amends** ADR-040 — its characterisation that _"a changeset now means 'the package changed', not 'make something happen'"_ (`040-…:265`) is inverted for the deployment package by this decision, deliberately.
- **Narrows** ADR-007 — its reassessment criterion _"moving to a monorepo with multiple packages"_ (`007-…:50`) fired at commits `ad034ea5` and `bf106786`. The cascade semantics this ADR records are the workspace behaviour ADR-007 predates and does not describe.
- **R020** — re-scored against this route at the `deploy_only` deletion commit, not closed by it.
- **P095** (deploying an unpublished version) and **P044** (swallowed publish) — the reasons the registry read survives unchanged.
- **JTBD-400** — the job this serves; its Desired Outcome recording the changeset as the arming declaration was ratified at commit `09f6418`.
