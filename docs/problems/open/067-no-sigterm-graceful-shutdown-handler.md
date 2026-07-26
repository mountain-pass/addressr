# Problem 067: addressr server has no SIGTERM graceful-shutdown handler wiring `stopServer()`

**Status**: Open
**Reported**: 2026-07-26
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2) — derived at capture. Impact 2: dropped in-flight requests at shutdown, bounded to self-hosted container operators; production is an Elastic Beanstalk source bundle and does not use the container path, and the Distroless image has never been published. Likelihood 2: only realises on a restart or redeploy that lands mid-request, and only for a self-hoster once the image ships.
**Origin**: internal
**Effort**: S — derived at capture: one `process.on('SIGTERM')` registration wired to the `stopServer()` that already exists, plus a test. The mechanism is present; only the wiring is missing.
**JTBD**: JTBD-202 (pending — see [P055](../known-error/055-migrate-docker-image-alpine-to-distroless.md) follow-ups)
**Persona**: self-hosted-operator

> **Anchoring note (2026-07-26)**: captured mid-iter with `persona=addressr-maintainer, jtbd=JTBD-400` supplied by the orchestrator. The JTBD reviewer rejected both. JTBD-400 (Ship Releases Reliably From Trunk) is about release **determinism**; draining in-flight requests during a container stop is a **runtime** property, and nothing in JTBD-400's job stories or desired outcomes is served by it. Re-anchored to `self-hosted-operator` / JTBD-202, which does not exist yet and carries the pending marker per the precedent [P055](../known-error/055-migrate-docker-image-alpine-to-distroless.md) already sets for its own mis-pointed `JTBD-200`. JTBD-001 (Search and Autocomplete Addresses) is the consumer-side **constraint**, not the served job: an autocomplete request killed mid-shutdown is a failed request on that job's primary path.

## Description

`src/waycharter-server.js:1011` exports a `stopServer()` that calls `server.close()`. Nothing wires it to a signal. There is no `process.on('SIGTERM')` anywhere in `src/`, so the server has no graceful-shutdown path at all: whatever terminates the process terminates it abruptly, and requests in flight at that moment are dropped rather than allowed to complete.

This was surfaced by the P055 Distroless work rather than caused by it. The published image ran node as PID 1, where the kernel applies no default signal dispositions, so `SIGTERM` was discarded entirely and `docker stop` SIGKILLed the container at the 10s grace deadline. A `tini` init now runs as PID 1 and forwards `SIGTERM` to node (`18f0d9b`, [ADR-039](../../decisions/039-distroless-docker-runtime.proposed.md) tini amendment). That fixes **prompt** termination and nothing more. node as tini's child takes the **default** disposition and dies at once, so the container now stops fast and still drops connections.

The distinction matters because it is the kind of green that reads as more than it is: the `build-and-smoke` "Container stops on SIGTERM" assertion will now pass while graceful shutdown remains entirely absent. The assertion measures stop latency, not request draining, and no check anywhere measures the latter.

## Symptoms

- No `process.on('SIGTERM')` or `process.on('SIGINT')` registration exists in `src/`; `stopServer()` has no caller on any signal path.
- A container stop or a process termination drops in-flight HTTP requests instead of letting them finish.
- The CI stop-timing assertion passes on the `tini` image, which is correct for what it measures and silent about what it does not.

## Workaround

None at the application level. An operator can lengthen the orchestrator's grace period, but that does not help: without a handler the process dies on the first `SIGTERM` regardless of how long the orchestrator was prepared to wait. A load balancer drain that stops routing new requests before the stop signal reduces the exposure without closing it.

## Impact Assessment

- **Who is affected**: `self-hosted-operator` running the published container, on every restart, redeploy, or host drain. `web-app-developer` sees it as the consumer-side symptom — a failed request on the JTBD-001 primary path.
- **Frequency**: every shutdown that lands mid-request. Ordinary for a container that restarts on deploys; rare for a long-lived one.
- **Severity**: Minor. Bounded to the container path, which production does not use, and the Distroless image is still unpublished.
- **Analytics**: N/A

## Root Cause Analysis

### Preliminary Hypothesis

`stopServer()` was written for test teardown, not for process lifecycle, so it never acquired a signal caller. Under ADR-013's Alpine image `dumb-init` was PID 1 and forwarded `SIGTERM` to node, which as a child took the default disposition and exited — prompt, and equally non-graceful. So the gap is not a regression from the Distroless migration; it predates it and was simply never visible, because nothing asserted anything about shutdown until `build-and-smoke` started asserting stop latency.

An explicitly installed handler is honoured even for PID 1 (only the _default_ disposition is suppressed there), so this handler would have fixed the P055 SIGKILL on its own. It was considered and declined as the sole fix for that defect — recorded as alternative 1 in ADR-039's tini amendment — because it is a `src/` change and therefore an npm package release under [ADR-040](../../decisions/040-release-pipeline-change-type-action-matrix.proposed.md)'s decoupled matrix, for a defect living entirely on the docker axis. It is wanted for a different property, and is deferred rather than dropped.

### Investigation Tasks

- [ ] Confirm no signal handler exists anywhere on the server startup path, including inside waycharter or Express middleware, before adding one
- [ ] Decide handler scope: `SIGTERM` alone, or `SIGINT` as well for a local `Ctrl-C` that currently also drops requests
- [ ] Decide the drain timeout and what happens when it expires — `server.close()` waits indefinitely on keep-alive connections, so a bounded fallback to a hard exit is needed or a stuck connection outlives the orchestrator grace window and re-earns the SIGKILL
- [ ] Handle re-entrancy: a second `SIGTERM` during drain should force immediate exit rather than being ignored
- [ ] Write the failing test first per the repo TDD rule — assert the handler is registered and that `stopServer()` is what it calls
- [ ] Ship as a package release: this is a `src/` change, so it needs a changeset, unlike the docker-axis `tini` fix

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: [P055](../known-error/055-migrate-docker-image-alpine-to-distroless.md) — same shutdown surface, opposite axis. P055's `tini` fix is docker-only and release-free; this one is a `src/` change and a package release.

## Related

- [ADR-039](../../decisions/039-distroless-docker-runtime.proposed.md) — the tini amendment records this as considered-and-deferred alternative 1, carries the prompt-but-not-graceful consequence, and names in-flight request loss becoming concrete as the reassessment trigger that points here.
- [ADR-040](../../decisions/040-release-pipeline-change-type-action-matrix.proposed.md) — why the fix is npm-axis and the `tini` fix was not.
- [P055](../known-error/055-migrate-docker-image-alpine-to-distroless.md) — the Distroless migration that surfaced this, and the ticket carrying the JTBD-202 gap this ticket's `JTBD:` field is pending on.
- `src/waycharter-server.js:1011` — the existing `stopServer()` awaiting a caller.
- Captured via `/wr-itil:work-problems` iter, 2026-07-26 (manual capture-problem steps; Skill tool erroring this session).
