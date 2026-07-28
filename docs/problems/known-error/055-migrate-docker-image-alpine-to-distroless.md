# Problem 055: Migrate the Docker image from Alpine to Distroless (supersedes ADR-013 base-image pick)

**Status**: Known Error
**Reported**: 2026-07-18
**Priority**: 4 (Low) — Impact: 2 (Minor — attack-surface hardening on the public npm/Docker image; no current user-facing defect) × Likelihood: 2 (Unlikely — no active exploit; a standing-risk reduction) — derived at capture
**Origin**: internal
**Effort**: M — derived at capture (multi-stage Dockerfile rework: build layer runs `npm install -g`, runtime layer is `distroless/nodejs22`; verify `docker build` + container start + a smoke request)
**WSJF**: 4.0 — (4 × 2.0) / 2 — corrected 2026-07-29 (review): was 2.0 (stale Open-status multiplier); Known Error multiplier 2.0 now applied
**JTBD**: JTBD-200
**Persona**: self-hosted-operator

## Description

ADR-013 chose an Alpine base with dumb-init for the `mountainpass/addressr` Docker image. User decision 2026-07-18 (during the `/wr-architect:review-decisions` oversight drain): move to a Distroless runtime (`gcr.io/distroless/nodejs22`) for a smaller attack surface, since addressr is a revenue-generating public API. Distroless has no shell and a minimal CVE surface. Trade-off accepted: loss of in-container shell debugging.

## Symptoms

- No active defect — this is a standing-risk (attack-surface) reduction on the published Docker image.

## Workaround

Alpine image continues to work; this is a security-posture improvement, not a fix.

## Root Cause Analysis

### Investigation Tasks

- [x] Multi-stage Dockerfile: build layer (npm global install) → `distroless/nodejs22` runtime layer copying the installed package — `d284853`
- [x] Confirm dumb-init is unnecessary (distroless/nodejs uses a proper init / node as PID 1) or vendor a static init if signal handling regresses — **the first branch was tried and was wrong; the second branch is what shipped.** `dumb-init` was dropped on the belief that node-as-PID-1 handles signals, the CI SIGTERM assertion disproved it empirically as intended, and a Debian-packaged `tini` was vendored as PID 1 in `18f0d9b`. See "Second CI Run" below
- [ ] Verify `docker build`, container start, and a smoke request against the running container — **NOT DONE, see Verification below**
- [x] Author the superseding ADR recording the Distroless decision — [ADR-039](../../decisions/039-distroless-docker-runtime.proposed.md), `d86c6cb`

## Fix Authored (2026-07-26) — Not Yet Build-Verified

Two commits on master, unpushed at time of writing:

- `d284853` — `Dockerfile` reworked to a multi-stage build (`node:22-bookworm-slim` build stage → `gcr.io/distroless/nodejs22-debian12:nonroot` runtime stage); `dumb-init` dropped; `CMD` is the resolved script path because Distroless has no shell and no `/usr/bin/env`; `WORKDIR` is `/home/nonroot` so the loader keeps a writable cwd; all eight `ELASTIC_*` / `ADDRESSR_INDEX_*` defaults re-declared in the runtime stage. Also adds `.github/workflows/docker-image.yml` and flips ADR-013 to superseded.
- `d86c6cb` — ADR-039, the compendium entry, a README `Self Hosted with Docker` section, and a patch changeset naming the two consumer-breaking changes.

### Verification (DEFERRED — requires a machine or CI runner with Docker)

**Nothing in this fix has been built or run.** This session had no Docker daemon and was explicitly barred from running any container command; a prior attempt at this ticket stalled for 60 minutes and was killed, almost certainly on a hanging `docker build`. The verification criterion is:

`docker build` succeeds, the container starts, and a smoke request against the running container returns a result.

`.github/workflows/docker-image.yml` job `build-and-smoke` runs exactly that on the first push touching the Dockerfile, plus two assertions the manual criterion did not cover: the runtime user is non-root, and `docker stop` terminates the container in under 10s (which is what actually proves SIGTERM handling survives the loss of `dumb-init`). **The workflow has never executed.** Until it goes green, ADR-039 stays `proposed` and this ticket stays Known Error.

One check the CI job does not cover, verify by hand before relying on the loader: running the loader from the image writes `/home/nonroot/target/keyv-file.msgpack` without EACCES. The `WORKDIR` choice rests on `/home/nonroot` being writable by uid 65532.

## Reconciled with ADR-040 (2026-07-26) — publishes on the Docker axis, not via an npm bump

The patch changeset this fix originally carried (`.changeset/distroless-docker-runtime.md`) has been
**removed**. The reasoning that justified it no longer holds.

That changeset was added for one stated reason: the image tag derived from `${npm_package_version}`,
so without a version bump the next `docker:push` would retag an already-published version with a
materially different image. A tagging deficiency was forcing a version bump, and the bump was in
turn dragging an npm publish and a full production deploy behind it, for a change that alters
nothing in the npm package.

[ADR 040](../../decisions/040-release-pipeline-change-type-action-matrix.proposed.md) fixes the
tagging deficiency directly. Every build now writes an immutable `:<version>-<gitsha>` plus
`:latest`, and the bare `:<semver>` only on a package release, so an image-only rebuild can no
longer collide with a tag a self-hoster has pinned. The Distroless image therefore publishes on the
**docker axis** and needs no npm version bump. Implemented in `52930b1` (`scripts/docker-tags.sh`
plus the `package.json` scripts); the CI publisher itself is a later stage.

The consumer-facing news the changeset carried — no shell, the loader invoked by script path, the
loader needing a writable `target` mount — moved to
[`docs/DOCKER-IMAGE-CHANGELOG.md`](../../DOCKER-IMAGE-CHANGELOG.md), which is keyed by image tag
rather than npm version. It is deliberately not deferred: without it, removing the changeset would
leave a breaking image change with no versioned notice anywhere for an operator tracking `:latest`.

ADR-039 is amended accordingly in `3807e99` (tag scheme, the build-only scope note closed, and the
base-image digest-pin trigger assessed and declined).

### Follow-ups Not Done This Iteration

- **JTBD gap.** The JTBD reviewer returned FAIL on a real gap: no documented job covers running, inspecting, or troubleshooting the self-hosted container, so the accepted shell-loss trade-off has no job to be weighed against. It asked for a new `JTBD-202: Operate and troubleshoot a self-hosted Addressr container` and for `Dockerfile` to be added to a job's `screens:` list. Both are frontmatter edits on `human-oversight: confirmed` artefacts and must go through `/wr-jtbd:confirm-jobs-and-personas`, which this AFK run had no interactive access to. It also noted P055's own `JTBD: JTBD-200` is a poor fit — JTBD-200 is a non-regression constraint here, not the served job — and should re-point at JTBD-202 once it exists.

  **Expanded 2026-07-26 under ADR-040.** The JTBD review of the tag scheme re-derived this same gap independently and added to it. JTBD-202 should also own the **tag contract**: which tag to pin, what `:latest` promises, when a pinned tag can and cannot change, and how an operator learns an image changed. Until it lands, `docs/DOCKER-IMAGE-CHANGELOG.md` is a consumer-facing surface no documented job owns. Separately, JTBD-400's `screens:` omits `package.json`, `Dockerfile`, `.github/workflows/docker-image.yml`, `.dockerignore.tmpl`, and `docs/DOCKER-IMAGE-CHANGELOG.md`, and its Desired Outcomes still assert the `deploy/**` auto-deploy deferral (P039 variant 4b) that the user lifted on 2026-07-26. All of it batches into one interactive `/wr-jtbd:confirm-jobs-and-personas` run.

  **Expanded again 2026-07-26 under the `tini` fix — the signal and lifecycle contract.** The JTBD reviewer found this change _enlarges_ the gap rather than merely sitting inside it, and named a third distinct operator-facing contract JTBD-202 must own, alongside shell-loss and the tag contract: **what is PID 1**, that `docker stop` / `SIGTERM` terminates the container within the orchestrator's grace window rather than being SIGKILLed, and the explicit caveat that prompt termination is **not** in-flight request draining. That last distinction is exactly the trade-off JTBD-202 exists to adjudicate, and there is currently no job statement or desired outcome anywhere in `docs/jtbd/` against which "stops fast but drops connections" can be judged acceptable or not.

  **Expanded again 2026-07-27 under ADR-040 stage 3 — image currency.** Option C removes `package.json` / `package-lock.json` from `docker-image.yml`'s master push filter, which changes an operator-facing property with no owning job. A dependency or transitive-CVE fix that lands without a changeset no longer rebuilds the image on master at all; it waits for the next package release. So `:latest` staleness becomes **release-cadence-dependent and unbounded** for that class, and `:latest` changes meaning a third time — from "the latest release" (ADR-013/039), to "the latest trunk build" (ADR-040), to "the latest Dockerfile-or-release build". There is no job statement anywhere in `docs/jtbd/` against which "a CVE fix waits for the next changeset" can be judged acceptable or not.

  So JTBD-202 should carry FOUR desired outcomes, not one, when it is authored: (a) diagnosis without an in-container shell, (b) the tag-pinning contract, (c) the container terminates within the orchestrator grace window on `SIGTERM`, with the in-flight-drain guarantee stated explicitly as either in scope or a named exclusion, and (d) **image currency** — under what circumstances a dependency or security fix reaches `:latest`, and the maximum staleness an operator tracking `:latest` should expect. Screen mapping to land in the same run: `Dockerfile` and `.github/workflows/docker-image.yml` onto JTBD-202's `screens:`, and `docker-image.yml` additionally onto JTBD-400's, folded into the omissions listed above.

  This is also why [P067](../open/067-no-sigterm-graceful-shutdown-handler.md) is personed `self-hosted-operator` / `JTBD-202 (pending)` rather than the `addressr-maintainer` / `JTBD-400` its capture supplied: request draining is a runtime property, and JTBD-400 is release determinism.

- **ADR-039 oversight.** Authored `human-oversight: unconfirmed` for the same reason. The substance was decided by the user on 2026-07-18; `/wr-architect:review-decisions` should promote it.
- **ADR-013 composes-with gap — CLOSED, not deferred.** ADR-013 recorded "no Docker-build CI workflow exists" as an open gap, which is why nothing ever caught a Dockerfile regression. `.github/workflows/docker-image.yml` closes it. Publishing stays manual (`npm run docker:push`) as of that commit; **the "separate decision" it deferred is [ADR-040](../../decisions/040-release-pipeline-change-type-action-matrix.proposed.md)**, which promotes CI to the publisher. The wiring is a later stage.

## First CI Run (2026-07-26) — the image built; the assertion was wrong, not the image

`build-and-smoke` ran for the first time on master (run `30195417720`) and **failed on a
test-assertion bug, not an image defect**.

What the run actually proves:

- **`docker build` succeeds.** `npm run build:docker` completed against the multi-stage Distroless
  Dockerfile on a clean runner. This is the first mechanical evidence the rework builds at all —
  the largest unknown this ticket carried since `d284853`.
- **The runtime user is non-root.** The step printed `runtime user: 65532`, which is the Distroless
  nonroot uid. The image is correct. The assertion was not: it accepted only `nonroot` and
  `65532:65532`, but `gcr.io/distroless/nodejs22-debian12:nonroot` reports `Config.User` as the
  **bare uid**, so a correct image false-negatived and reddened master.

What the run does **not** prove — the job exits at the first failing step, and neither of the
remaining steps carries `if: always()`, so both were skipped:

- **Container start and `/health`** — not exercised.
- **SIGTERM termination under 10s** — not exercised. This is the assertion that empirically
  confirms dropping `dumb-init` was safe, and it remains unconfirmed.

Fix: the assertion now accepts the bare `65532` alongside the two existing alternatives. It is still
a fail-closed exact-string allowlist — every root form (`""`, `0`, `0:0`, `root`) fails all three
arms — so the non-root property the step exists to prove is unchanged in strength.

The Dockerfile was **not** touched. ADR-039 stays `proposed` and this ticket stays Known Error until
a green `build-and-smoke` run exercises the boot and SIGTERM steps end to end.

Carry-forward for ADR-040 stage 2: when these steps move into the reusable `workflow_call`
definition, transplant the **fixed** three-arm assertion, or the same red build returns.

## Second CI Run (2026-07-26) — the boot passed, and the SIGTERM assertion caught a real image defect

With the non-root assertion corrected, `build-and-smoke` got past it and exercised both remaining
steps. The result inverts the previous run: this time the assertion was right and the **image** was
wrong.

- **Container start and `/health` — VERIFIED.** The steps run sequentially with no `if: always()`,
  so a run reaching the SIGTERM step is proof the container booted and answered a real HTTP request.
  That closes the check that exists to catch an unresolvable `CMD` path, which was the single
  largest unknown left after the loss of the shell.
- **SIGTERM termination — FAILED, on a genuine defect.** The container took 11s and was SIGKILLed at
  Docker's 10s grace deadline.

**Root cause.** The kernel applies no default signal dispositions to PID 1, and node installs no
explicit `SIGTERM` handler of its own, so node running as PID 1 under the Distroless `ENTRYPOINT`
discarded the signal outright. The investigation task above was closed on the first branch —
"dumb-init is unnecessary because node is PID 1" — and ADR-039 wrote that reasoning down as fact. It
was false. The task's own second branch, "or vendor a static init if signal handling regresses", is
what was actually needed, and ADR-039's matching reassessment criterion fired exactly as written.

**Fix (`18f0d9b`).** A Debian-packaged `tini` runs as PID 1 and forwards `SIGTERM` to node, which as
a child does carry the default disposition and exits.

- Build stage: `apt-get install -y --no-install-recommends tini`.
- Runtime stage: `COPY --from=build /usr/bin/tini /tini` — one deterministic source path, no
  fallback, so the build hard-fails if Debian stops shipping it.
- `ENTRYPOINT ["/tini", "--", "/nodejs/bin/node"]`. `CMD`, the nonroot uid 65532, `WORKDIR` and all
  eight env defaults are unchanged. `tini` needs no privilege, and it appends CMD args and execs
  node, so the loader-by-script-path invocation is unaffected.
- Debian's `tini` is glibc-linked rather than static. Safe here for this image's own stated reason
  for the bookworm build stage — build and runtime share a Debian 12 libc — but that parity is now
  load-bearing in the present tense rather than anticipatory, and the Dockerfile says so.

**No changeset, no release.** No `src/` file changed, so this publishes on the docker axis under
ADR-040. ADR-039 is amended in place rather than superseded (`d310c4b`): five falsified passages
rewritten, three declined alternatives recorded, two reassessment triggers discharged.

**This fixes prompt termination, not graceful shutdown.** node as tini's child dies at once, so
in-flight requests are still dropped, and the `<10s` assertion will now pass while saying nothing
about draining. Captured as
[P067](../open/067-no-sigterm-graceful-shutdown-handler.md) — wire the existing `stopServer()` to
`process.on('SIGTERM')`, which is a `src/` change and therefore an npm release.

**Not verified.** Nothing has built or booted the `tini` image; this iteration was again barred from
running docker. The stop-timing threshold was deliberately left at Docker's 10s contract rather than
tightened, so that a green run still isolates which change produced it. This ticket stays Known
Error and ADR-039 stays `proposed` until `build-and-smoke` goes green end to end. Advisory for a
later pass, not done here: once the fix is confirmed, consider whether `-lt 10` should tighten,
since under `tini` the stop should be sub-second and 9s would currently pass.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)

## Related

- Supersedes the base-image pick in [ADR-013](../../decisions/013-docker-image.superseded.md) (Alpine + dumb-init), now superseded by [ADR-039](../../decisions/039-distroless-docker-runtime.proposed.md).
- Composed with the noted ADR-013 open gap (no Docker-build CI, image currency depending on manual builds) — closed by `.github/workflows/docker-image.yml` in `d284853`.
