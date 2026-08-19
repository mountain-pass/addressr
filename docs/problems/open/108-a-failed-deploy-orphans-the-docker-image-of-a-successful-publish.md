# Problem 108: A failed deploy orphans the Docker image of a successful publish

**Status**: Open
**Reported**: 2026-08-19
**Priority**: 9 (Medium) — Impact: 3 × Likelihood: 3 — rescored 2026-08-19, same day as capture, from
6 (2×3). **Impact 2 was a straight mis-fit against the policy's own wording, and it also scored the payload
rather than the mechanism.** RISK-POLICY Impact 2 _requires_ "The npm package, **Docker image**, and live
AWS service continue functioning normally" — the image did not; it was never produced. Impact 3 reads
"npm publish pipeline, **Docker image build**, or AWS deployment pipeline disrupted … but existing npm
installations, **running Docker containers**, and the live RapidAPI service continue operating on their
current version", which is this incident verbatim, including the "stale, not broken" reasoning that was
offered _for_ Impact 2.
Separately: nothing in the mechanism prefers routine releases. Orphan a security patch and image consumers
sit on a known-vulnerable build while npm and production are patched — and per Symptom 4 nothing asserts
the gap. The exposure is content-dependent and unbounded upward; the first rating scored the one instance.
Likelihood 3 stands: the post-publish surface is wide, but it has fired once.
**Origin**: internal
**Effort**: S
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`docker-publish` is gated on the whole release **job**, not on the publish **step**:

```yaml
docker-publish:
  needs: release
  if: needs.release.outputs.published == 'true'
```

The deploy and production smoke run _after_ the publish inside that same job, so a failure in either
skips the image build even though npm already has the version. Re-running does not recover it: the
changesets action has nothing left to consume, `published` resolves to the empty string, and the gate
fails again.

**This was not an unknown defect.** `release.yml` recorded it in terms — **past tense: the fix commit
replaces that comment block, so the wording below is quoted from the pre-fix file, not from the current
one** — as an accepted Bad consequence of
ADR-040 — _"a red prod smoke after a successful npm publish leaves npm and the GHCR image divergent,
recoverable via the documented `DOCKER_PUBLISH_SEMVER=1 npm run docker:push` break-glass (a local PAT
with write:packages against ghcr.io)"_. This ticket does not report a surprise; it asks whether that
acceptance still holds now that the trade has been paid once and its shape is visible.

### What happened, 2026-08-19, releasing 3.3.2

1. `changeset publish` succeeded — npm shows 3.3.2 as `latest`, and the published tarball installs
   cleanly (120 packages, exit 0).
2. `Deploy new version` failed: _"updating Elastic Beanstalk Environment: 6 errors occurred: Instance
   deployment: 'npm' failed to install dependencies"_. Most likely a registry propagation race — the
   deploy began about two minutes after publish, and the same package installs cleanly now.
3. `docker-publish` skipped, because its `needs: release` dependency had failed.
4. Production converged to 3.3.2 by itself and is healthy. Re-running the release job through the
   pipeline went green and reconciled Terraform.
5. `docker-publish` skipped **again** on the re-run, `published` now being false.

Net: npm 3.3.2, production 3.3.2, container registry 3.3.1.

## Symptoms

1. A successful publish can lose its image to a failure in an unrelated later step.
2. Re-running the release cannot recover it — the condition that gates the image is single-use.
3. A manual dispatch cannot recover it either: `docker-image.yml`'s `workflow_dispatch` declares **no
   inputs**, while `publish_semver` exists only under `workflow_call`. `DOCKER_PUBLISH_SEMVER` therefore
   evaluates to `'0'` on a dispatch, pushing the sha-tagged image _without_ the bare `:<semver>` tag.
4. **Nothing asserts the gap.** The pipeline already fails loudly when a publish was expected and did not
   happen. There is no equivalent comparing "a version was published" against "an image exists for it",
   so the divergence is silent until someone pulls.

## Workaround

**None is taken, by decision.** ADR-050 (2026-08-19) withdraws the local `docker:push` break-glass and
deliberately builds no replacement, so 3.3.2 has no image and will not get one; the next release carries
its own. See ADR-050's accepted Bad consequence.

The documented control _did_ exist, and this ticket's first version got that wrong in both directions —
worth recording, because the second error was made while correcting the first.

- **First reading: "no recovery path exists."** Wrong. `release.yml` documents
  `DOCKER_PUBLISH_SEMVER=1 npm run docker:push` with a `write:packages` PAT, and the script is real.
- **Second reading: "the documented one, and it still works."** Too generous, and it stopped at existence
  without examining quality. That path runs `docker:push` alone, so **none of `docker-image.yml`'s smoke
  steps run** — non-root user, `/health` boot, SIGTERM. ADR-039's named compensating control for accepting
  a floating `:nonroot` base is precisely that the image pushed is the image smoke-tested; the break-glass
  voids it by construction. It also **re-points `:latest` unavoidably** — `scripts/docker-tags.sh` prints
  `:latest` unconditionally and only the bare `:<semver>` sits behind the flag. And `prebuild:docker` packs
  the _working tree_, so a local build with uncommitted changes mints a `:<version>-<gitsha>` for content
  that sha does not contain.
- **On the runbook**: `docs/BREAK_GLASS_RUNBOOK.md`'s `DO NOT run terraform apply` section is
  terraform-scoped, but its _opening_ rule is broader and newer — out-of-band production mutation is not
  sanctioned, "Recovery is the pipeline, always", user decision 2026-08-18. A GHCR push is not production
  mutation, so it did not withdraw the control; but that dated direction is the strongest ground for
  withdrawing it now, which ADR-050 does.

## Impact Assessment

- **Who is affected**: consumers pulling the container image. Not hosted-API users; not npm consumers.
- **Frequency**: once, on 2026-08-19. Requires a post-publish failure in the release job.
- **Severity**: Moderate, matching the Impact 3 rescore above. An earlier draft read "Minor … a documented
  manual recovery exists", which went stale the moment the rating moved and the Workaround was rewritten —
  the manual recovery is withdrawn by ADR-050, and what remains reachable through the pipeline is the sha
  tag and `:latest`, not the bare `:<semver>`.
- **Analytics**: 1 occurrence; 1 version divergent (3.3.2); 2 skipped `docker-publish` runs.

## Root Cause Analysis

**Job granularity.** `needs: release` plus GitHub's implicit success requirement couples the image build
to steps that have nothing to do with building an image. The publish succeeded; the artefact that should
have followed it was withheld because something later in the same job failed.

**And the recovery is single-use by construction.** `published` is an output of the changesets action,
true only on the run that consumes the changesets. Any recovery attempt is therefore on the wrong side of
the gate. That is why re-running — the obvious first move, and the one the tooling suggests — cannot work.

### Investigation Tasks

- [x] **Decide whether ADR-040's accepted Bad consequence still stands. RESOLVED 2026-08-19 — it does not.**
      Recorded in ADR-050, which supersedes **four** clauses of ADR-040 — the publish-path
      coupling consequence, the fail-closed coupling consequence in part, the standing of `docker:push` as
      a sanctioned manual route, and that break-glass's restatement in the 2026-07-28 GHCR amendment — and
      marks two further restatement sites in ADR-039. The count reached two, then three, then four across
      successive reviews; each time it was declared closed and each time a restatement site had been
      missed, which is why ADR-050 records the set as a best current reading rather than a guarantee.
- [x] ~~Give `docker-image.yml`'s `workflow_dispatch` a `publish_semver` input.~~ **Rejected by user
      decision 2026-08-19, and the reason matters.** ADR-040 accepted the dispatch trigger _because_
      `publish_semver` is unset there, so it "can never re-point a consumer's bare-semver pin", and its
      Confirmation criterion asserts the bare digest is unchanged by a docker-axis publish. Adding the
      input would create a second writer of the bare tag, falsifying the first and making the second
      unsatisfiable. Fixing the cause costs neither.
- [x] **Gate `docker-publish` on the publish rather than the whole job. DONE 2026-08-19.**
      `if: "!cancelled() && needs.release.outputs.published == 'true'"`. Smaller than first assumed: the
      orphaning was caused by GitHub's _implicit_ `success()`, not by the `== 'true'` comparison, so the
      positive form and the empty-string protection are untouched. **Pinned EXACTLY**, with property
      assertions beside it as explanation. An earlier version of this line said "pinned by property rather
      than literal", and that belief was the defect: property assertions bind operands, not the operator, so
      `!cancelled() || …` satisfied every one of them while writing the bare `:<semver>` tag on every master
      push. Mutation-verified against **four** regressions — implicit `success()`, `always()`, the negated
      form, and the `||` inversion — each of which reds the suite.
- [ ] Add the missing assertion: a published version with no corresponding image should fail loudly,
      mirroring the existing swallowed-publish check. Without it this stays silent.
- [ ] Establish whether the underlying deploy failure was in fact a publish→deploy propagation race, and
      if so whether the deploy should wait for registry availability before installing. Evidence so far is
      circumstantial but consistent: the deploy began about two minutes after publish, and the identical
      package installs cleanly now.
- [ ] **R023 says its fixes are "not yet exercised in anger." That arguably stopped being true on
      2026-08-19.** On the re-run the watcher reported green while `docker-publish` was skipped, and R023's
      default-deny scan treats `skipped` as acceptable _by design_. This incident sits inside R023's own
      declared residual and its Monitoring trigger — the first live red run after those fixes — has fired.
      Update the entry rather than leaving it claiming otherwise.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: the publish/deploy coupling family below.

## Related

- **ADR-040** (`docs/decisions/040-release-pipeline-change-type-action-matrix.proposed.md`) — records this
  divergence as an accepted Bad consequence, with the `docker:push` break-glass as its compensating
  control. `release.yml` states it at the `docker-publish` job. This ticket is in part a request to
  revisit that acceptance, which is why it is a ticket rather than a surprise.
- **P039** ([`039-decouple-saas-deployment-from-npm-publish.md`](../known-error/039-decouple-saas-deployment-from-npm-publish.md))
  — sibling in the publish/deploy coupling family, opposite direction. P039 is "a deploy has no entry
  point other than a publish"; this is "a deploy failure destroys an artefact of the publish". Different
  fix locus — P039 never touches `docker-image.yml`.
- **P044** (closed) — the mirror image, and instructive for that. Its defect was `published == 'false'`
  with a **green** job; this is `published == 'true'` with a **red** one. Its remedy, the swallowed-publish
  assertion, correctly stays quiet here because the publish genuinely succeeded — which is exactly why a
  second assertion over a different pair of facts is needed.
- **R023** — family owner. This is a **no-guard** member: nothing ever checks that a published version has
  an image. Distinct from P107's stale-state member; worth clustering at the next `/wr-itil:review-problems`.
- **JTBD-400** (Ship Releases Reliably From Trunk), persona `addressr-maintainer`.

Captured via `/wr-itil:capture-problem` after the 3.3.2 release. Hang-off check dispatched against P039,
P044, P101 and P107 — verdict PROCEED_NEW, on the grounds that no candidate's fix locus is the job-level
`needs` or the missing dispatch input.
