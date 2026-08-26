---
status: 'proposed'
date: 2026-08-19
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-risk-scorer:pipeline]
informed: []
reassessment-date: 2026-11-19
supersedes-clause: 040#docker-axis-deploy-coupling
---

# The image follows the publish, not the deploy

> Captured via `/wr-architect:capture-adr` after the consequence ADR-040 accepted as benign was realised in
> production on 2026-08-19. Born `human-oversight: unconfirmed` for the `/wr-architect:review-decisions`
> drain. The substance — that registry publishing belongs to the pipeline rather than a laptop, and that no
> recovery mechanism is built for an already-orphaned version — was taken by the user on 2026-08-19.

## Context and Problem Statement

Releasing 3.3.2, `changeset publish` succeeded and `Deploy new version` then failed on an Elastic
Beanstalk instance `npm install`. Because `docker-publish` declared `needs: release` and inherited
GitHub's implicit `success()`, the image build was skipped — even though the publish it depends on had
already succeeded. Re-running could not recover it: `published` is `'true'` only on the run that consumes
the changesets, so every subsequent attempt evaluates the gate to false.

npm went to 3.3.2. Production went to 3.3.2. The container registry stayed on 3.3.1.

ADR-040 anticipated this exactly and accepted it, on a stated ground:

> Bad: **on the publish path the docker axis is not independent of the deploy axis.** `needs: release` plus
> GitHub's implicit success requirement puts the docker publish behind the deploy, the 120s wait, and the
> whole prod smoke block. A red prod smoke after a successful npm publish leaves npm and Docker Hub
> divergent with no automatic retry. **Benign — it degrades to today's manual `npm run docker:push`** — but
> it is real, and it adds publish latency

Two things have made that ground false. The first is that "today's manual path" is no longer sanctioned:
`docs/BREAK_GLASS_RUNBOOK.md`, dated 2026-08-18, opens by refusing out-of-band production mutation —
"Recovery is the pipeline, always" — and on 2026-08-19 the user extended that to the registry in terms:
_"`npm run docker:push` should be part of the pipeline. Not run locally."_ The second is that "benign" was a
prediction, and it has now been paid.

## Decision Drivers

- A successful publish must not lose its image to a failure in a step that has nothing to do with building
  images.
- Registry pushes come from the pipeline. A recovery that requires a laptop and a personal access token is
  not a recovery this project accepts, for the same reason `terraform apply` is not run locally.
- The bare `:<semver>` tag must keep exactly one writer. Every property ADR-040 built around tag
  immutability is to survive this decision untouched.

## Considered Options

- **A — Decouple the axes.** Replace the implicit `success()` on `docker-publish` so it follows the publish
  rather than the whole job.
- **B — A `publish_semver` input on `docker-image.yml`'s `workflow_dispatch`,** so an orphaned version can be
  republished through the pipeline.
- **C — A dedicated republish workflow that checks out the release tag.**
- **D — Keep the local `docker:push` break-glass.**

## Decision Outcome

**Chosen: A, and A alone.**

`docker-publish` becomes:

```yaml
docker-publish:
  needs: release
  if: "!cancelled() && needs.release.outputs.published == 'true'"
```

`!cancelled()` rather than `always()`, because a cancelled run must not publish. The positive
`== 'true'` comparison is untouched and remains load-bearing for its own reason: when the changesets step
publishes nothing the output is the empty string, and `'' == 'true'` is false.

**B and C are rejected, and the reason is the point of this record.** Both create a second writer of the
bare `:<semver>` tag. ADR-040 accepted the `workflow_dispatch` trigger specifically because
`publish_semver` is unset on a dispatch, so it "can never re-point a consumer's bare-semver pin" — and its
Confirmation criterion asserts the bare digest is unchanged by a docker-axis publish. Adding a second
writer would falsify the first and make the second unsatisfiable. Fixing the cause costs neither.

**Accepted consequence, taken deliberately by the user rather than defaulted into: 3.3.2 does not get its
bare `:3.3.2` tag.** Stated precisely, because an earlier draft said "no recovery exists", which is false
and is contradicted by P108's own Symptom 3 in the same commit: a `workflow_dispatch` of `docker-image.yml`
_does_ publish through the pipeline — it just cannot write the bare `:<semver>` tag, since `publish_semver`
exists only under `workflow_call`. So the sha tag and `:latest` are reachable; the bare alias is not.

That route is **declined rather than unavailable**, and the reason is the tree: a dispatch today builds from
current master, minting `:3.3.2-<sha-of-a-different-tree>` and moving `:latest` to a trunk build. Per
`040:174` the bare tag is "a release-time convenience alias, not an identity" while `:<version>-<gitsha>` is
"authoritative, and it is what a self-hoster should pin" — so what is forgone is the convenience alias.

The divergence is also **bounded, not open-ended**: a changeset for 3.3.3 is already queued, one release-PR
merge away.

**D is withdrawn.** `predocker:push` and `docker:push` remain in `package.json` because the pipeline itself
invokes `docker:push` — that is where it belongs. What is withdrawn is their standing as a sanctioned
manual recovery route.

### Consequences

- Good: a post-publish failure no longer orphans the image. The image follows the artefact it belongs to.
- Good: no new writer of the bare `:<semver>` tag, so ADR-040's immutability properties, its dispatch bound
  and its Confirmation criterion all stand unchanged.
- Good: the recovery story stops depending on a laptop holding a `write:packages` token.
- Bad: **3.3.2 does not get its bare `:3.3.2` tag**, and no version orphaned before this fix will.
  Recovery through the pipeline is _declined_, not unavailable — see the Accepted-consequence paragraph
  above for what a dispatch can and cannot write, and why building 3.3.2's tag from a later tree is the
  wrong trade. The answer if it recurs is to ship the next version, not to reach for a manual push.
- Bad: `docker-publish` can now run on a release job that failed. It cannot run on a _swallowed publish_ —
  the P044 assertion fires only when `published != 'true'` and this gate requires `== 'true'`, so the two
  are mutually exclusive by construction — but a reader should not have to re-derive that, so it is
  recorded here and in the workflow.
- Neutral, and stated because it is load-bearing and unproven: the fix assumes `needs.release.outputs`
  stays readable when the release job fails at a later step than the one that set them. Both branches,
  because an earlier draft claimed the change "can only improve the outcome, never worsen it" — which
  proves safety only in the branch where the assumption FAILS, and the entire behavioural delta lives in
  the branch where it HOLDS:
  - **Assumption fails** → `published` is the empty string, `'' == 'true'` is false, the job skips.
    Exactly today's behaviour. Safe — **but silent**: the next post-publish failure orphans another image
    and nothing says so. Confirmation criterion 4 therefore depends on P108's open task to make a published
    version with no image fail loudly; without it, criterion 4 is a hope rather than a check.
  - **Assumption holds** → the image publishes on a failed release job. The deploy-failure case is the
    improvement this decision exists for. The case that is genuinely WORSE than today is a failed
    `Smoke test production`: that step asserts artefact-level properties (P019 rel completeness, the
    ADR-025 ranking probes), and after this change a version failing it still reaches the registry.
    **Accepted**, and on one ground only: `changeset publish` has already succeeded by then, so the
    identical defect is already on npm under `latest` and already running in production. Withholding the
    image leaves the divergence ADR-040 exists to remove rather than protecting anyone.
    **No substitute pre-release control is claimed.** An earlier draft named `test:integration:search` as
    catching this class; that is false and was asserted without checking. It resolves to a single file,
    `test/integration/search-analysis.test.mjs`, the ADR-041 partial-prefix property over a four-address
    synthetic index — it exercises neither the rel-completeness assertion nor the ranking probes, and
    cannot exercise ranking against the production index, which is why those probes live in the smoke.

## Confirmation

1. `release.yml`'s `docker-publish` gate carries `!cancelled()`, retains the positive
   `needs.release.outputs.published == 'true'` comparison, and contains neither `always()` nor a negated
   `published !=` form. **Pinned EXACTLY in `test/js/__tests__/release-workflow-deploy-only.test.mjs`; the
   property assertions beside it are explanation, not the control.** An earlier draft of this criterion said
   the reverse — "pinned by property rather than by literal" — and that belief is what produced the defect:
   property assertions bind operands, not the operator, so
   `!cancelled() || needs.release.outputs.published == 'true'` satisfied all of them while publishing the
   bare `:<semver>` tag on every master push, re-pointing consumer pins. Mutation-verified against **four**
   regressions, each of which reds the suite: reverting to the implicit `success()`, substituting
   `always()`, negating the comparison, and inverting the conjunction to `||`.
2. `docker-image.yml`'s `workflow_dispatch` still declares **no inputs**, so the dispatch path still cannot
   write a bare `:<semver>` tag. This decision must not become a reason to add one.
3. The next release after this lands publishes an image for its version. Until one does, this decision is
   unverified in anger.
4. The assumption in the last Neutral consequence is confirmed or refuted at the next post-publish failure,
   and this record updated to say which.

## Superseded clauses of ADR-040

Four, enumerated exactly rather than counted, because `supersedes-clause`'s anchor text is not
machine-checked and a single anchor cannot express a multi-clause scope. **The count reached two, then
three, then four across successive reviews** — each time the set was declared closed and each time a
restatement site had been missed. That history is left here deliberately: the enumeration is hand-made and
nothing mechanises it, so treat four as the best current reading rather than a guarantee.

1. **`040:225`, the Bad consequence.** Quoted verbatim above. Retired: the axes are now independent, and the
   ground that made it benign — degradation to a manual `docker:push` — is withdrawn.
2. **`040:188`,** _"`predocker:push` and `docker:push` are **retained as documented break-glass**"_. The
   scripts remain; their standing as a sanctioned manual route does not.
3. **`040:224`, the fail-closed-coupling consequence — PARTIALLY.** _"With `needs: release`, a failing
   `release` job — including the P044 swallowed-publish assertion — skips the docker publish even for a
   pure `Dockerfile` change. Not publishing from a red tree is desirable, but it is a behavioural change
   from today's independent `docker-image.yml`."_ Two of its clauses fall: "a failing `release` job skips
   the docker publish" is now false on the publish path, and "not publishing from a red tree is desirable"
   is the judgement this record reverses, for the reason in the Neutral consequence above. **The P044
   clause survives** — that path remains unreachable, by the mutual exclusivity argued above. (Its "even
   for a pure `Dockerfile` change" was already wrong independently of this record: that path fires
   `docker-image.yml`'s own push trigger.) An earlier draft of this section missed this site entirely and
   asserted "Everything else in ADR-040 stands", which was false.

   **The P044 clause survives as an OUTCOME, not as the stated mechanism.** That path still skips, but no
   longer because `needs: release` plus the implicit `success()` stops it — it skips because P044 fires
   only when `published != 'true'` while this gate requires `== 'true'`. The causal model the clause states
   is retired even though its conclusion holds.

4. **`040:93`, the 2026-07-28 GHCR amendment point 3, "Break-glass changes shape".** _"A local
   `npm run docker:push` no longer uses Docker Hub credentials; it now needs a classic **PAT with
   `write:packages`** exported as `GITHUB_TOKEN` … recorded so it is not a surprise."_ This is site 2
   restated in a later amendment — and by ADR-040's own convention (`040:146`, "read the amendment for what
   is built") amendments outrank body text, so retiring `040:188` alone would leave the withdrawn
   break-glass described as a live, re-credentialed route in the tier a reader is told to trust.

**Not superseded, and checked rather than assumed:** the stage-2 dispatch bound at `040:24`, Decision
Driver `040:120`, the Good consequence at `040:217`, and the Confirmation criterion at `040:250` all stand.
Choosing option A rather than B or C is what keeps them true, and each was read against disk rather than
inferred.

## Related

- **ADR-040** (`040-release-pipeline-change-type-action-matrix.proposed.md`) — the decision this supersedes
  in part.
- **ADR-039** (`039-distroless-docker-runtime.proposed.md`) — its compensating control for the floating
  `:nonroot` base is that the image pushed is the image smoke-tested. Option A preserves that; a manual
  `docker:push` would have voided it, which is a second reason D is withdrawn.
- **P108** (`../problems/open/108-a-failed-deploy-orphans-the-docker-image-of-a-successful-publish.md`) —
  the incident record.
- **JTBD-202** (Obtain and run the published image) — the accepted Bad consequence is a cost against its
  desired outcome; routed to `/wr-jtbd:confirm-jobs-and-personas` rather than edited here.
