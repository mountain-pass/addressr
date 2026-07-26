# Problem 067: addressr server has no SIGTERM graceful-shutdown handler wiring `stopServer()`

**Status**: Known Error
**Reported**: 2026-07-26
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2) — derived at capture. Impact 2: dropped in-flight requests at shutdown, bounded to self-hosted container operators; production is an Elastic Beanstalk source bundle and does not use the container path, and the Distroless image has never been published. Likelihood 2: only realises on a restart or redeploy that lands mid-request, and only for a self-hoster once the image ships.

**Origin**: internal
**Effort**: S — derived at capture: one `process.on('SIGTERM')` registration wired to the `stopServer()` that already exists, plus a test. The mechanism is present; only the wiring is missing.
**JTBD**: JTBD-202 (pending — see [P055](../known-error/055-migrate-docker-image-alpine-to-distroless.md) follow-ups)
**Persona**: self-hosted-operator

> **Priority premise correction (2026-07-26, at fix)**: the capture-time Priority reasoning above rests on "production is an Elastic Beanstalk source bundle and does not use the container path", and the fix falsifies it. The handler is installed unconditionally in `src/server2.js`, which **is** what production EB runs (`deploy/deployment/package.json` `start: addressr-server-2`). The defect was never container-only either: ADR-004's amendment records EB application deploys at `BatchSize = 100%`, so today every production deploy drops in-flight requests fleet-wide. The fix is therefore worth more than a Low ticket suggests, and it also carries more production surface than a Low ticket implies. Impact and likelihood are left at their capture values rather than re-rated mid-fix; the next `/wr-itil:review-problems` pass should re-rate from this corrected premise.

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

- [x] Confirm no signal handler exists anywhere on the server startup path, including inside waycharter or Express middleware, before adding one — confirmed: `grep` over `src/` returned the `stopServer()` definition and no `process.on` anywhere
- [x] Decide handler scope: `SIGTERM` alone, or `SIGINT` as well for a local `Ctrl-C` that currently also drops requests — both. Same drain property, no extra operator surface
- [x] Decide the drain timeout and what happens when it expires — bounded at `ADDRESSR_SHUTDOWN_TIMEOUT_MS`, default 8000ms, force-close then exit 1
- [x] Handle re-entrancy: a second `SIGTERM` during drain should force immediate exit rather than being ignored — force-close then exit 1, and `stop()` is never invoked twice
- [x] Write the failing test first per the repo TDD rule — `test/js/__tests__/graceful-shutdown.test.mjs`, 19 assertions, red before the implementation existed
- [x] Ship as a package release: `.changeset/graceful-shutdown-handler.md` (patch, `@mountainpass/addressr`)

## Fix (2026-07-26, commit `581b533`)

`src/graceful-shutdown.js` is new and self-contained (it imports only `debug`, so a raw `node --test` `.mjs` can load it — the `src/read-shadow.js` precedent, not `src/es-health.js`). It exports:

- `shutdownTimeoutMs(env)` — the drain budget. Unset falls back to 8000ms, comfortably inside Docker's 10s grace; set-but-invalid **throws**, naming `ADDRESSR_SHUTDOWN_TIMEOUT_MS`, matching the fail-at-startup contract `validateProxyAuthConfig` and `validateReadShadowConfig` already set. A silently-`NaN` budget would fire the deadline instantly and drop every in-flight request while looking configured, which is exactly the `self-hosted-operator` persona's documented silent-misconfiguration pain point.
- `installShutdownHandlers({ stop, force, timeoutMs, signals, proc })` — registers `SIGTERM` and `SIGINT`, drains via `stop()`, exits 0 on a clean drain, and on the deadline force-closes and exits 1. Idempotent through a closure-local flag: a repeat signal force-closes and exits at once without re-entering the drain.

`src/waycharter-server.js`: `stopServer()` now returns a promise that **resolves and never rejects** (an `ERR_SERVER_NOT_RUNNING` callback is a no-op, not a failure — `test/js/world.js:67` discards the return value and a rejection there would have become an unhandled rejection reddening the Cucumber suite). It also calls `server.closeIdleConnections()` immediately after `close()`, which is load-bearing rather than cosmetic: `server.close()` alone resolves only when **every** connection ends, and a reverse proxy's idle keep-alive upstream pool would hold it open for the entire budget, so the "graceful" path would have force-exited on every single deploy. `forceCloseConnections()` is new for the deadline path.

`src/server2.js` installs the handlers **above** the `startRest2Server()` call, so a bad `ADDRESSR_SHUTDOWN_TIMEOUT_MS` fails startup before the port is bound (a bound-then-crash would be an EB health-check flap rather than a clean startup failure), and a signal arriving during ES connect drains rather than killing the process.

`Dockerfile:59-64` prose corrected — it asserted no app-level handler existed, which this makes false.

### Composition with the P055 work

The two fixes are on opposite axes and neither is sufficient alone:

- **`tini` (P055, `18f0d9b`, docker axis, no release)** puts an init at PID 1 that forwards `SIGTERM` to node. Without it the signal never reaches node at all, because the kernel applies no default dispositions to PID 1. It makes the container stop **promptly**.
- **This handler (npm axis, released)** drains in-flight requests once the signal arrives. Without it node takes the default disposition and dies mid-request. It makes the container stop **gracefully**.

Note the asymmetry recorded in ADR-039's tini amendment: an explicitly installed handler is honoured even at PID 1, so this change would have fixed the P055 SIGKILL on its own. It was declined as the sole fix there because it is a `src/` change and therefore an npm release under ADR-040, for a defect living entirely on the docker axis. That reasoning holds — it is landing now for the property it was actually wanted for.

The Distroless work also supplies the only real verification path: with ADR-040 stage 2 not landed, a `Dockerfile` push builds and smoke-tests without publishing, so `build-and-smoke` will exercise the real stop against the real image. Its `< 10s` assertion still measures stop **latency**, not draining, and was deliberately left unchanged.

### Residuals and carry-forwards

- **The 8000ms default is a production-visible number chosen against Docker's grace window, not EB's.** The architect's advisory was 3000ms for exactly that reason. 8000ms was kept per direction; `closeIdleConnections()` makes the normal stop sub-second regardless, so the ceiling only bites on a genuinely stuck connection. Revisit if an EB deploy is ever observed sitting on the deadline.
- **Nothing exercises the composed real path** — real SIGTERM through tini to a live listener with a genuine in-flight request. The 19 assertions cover the handler branch matrix against an injected fake `process`; the `server2.js` and `stopServer` wiring assertions are source-inspection (P033). This is the gap that keeps the ticket at Known Error.
- **`test:cli2:*` teardown timing is unverified locally.** `run-p --race` SIGTERMs the server when those tests finish, and that path now drains first. `closeIdleConnections()` should keep it immediate, but this run had no OpenSearch and was barred from docker, so it was not measured.
- **ADR-039 and ADR-040 are both `human-oversight: unconfirmed`** and this change cites both. Cleared by the architect as a documented carry-forward on three grounds: both ADRs record their substance as user-taken on their face (the marker is an AFK-authoring provenance artefact), the changeset requirement follows from ADR-007 independently of ADR-040, and ADR-039's dependency here is a deferral pointer rather than a contested option. **This commit does not ratify either ADR** — neither marker nor body was touched. `/wr-architect:review-decisions` still owes both.
- **ADR-039's closing amendment is not written.** Its tini amendment still says the handler is "deferred, not dropped". Deferred deliberately: amending an ADR body pulls in an ADR-077 compendium regen whose generator is recorded as destructive to hook-authored entries, so it belongs in a pass where the `docs/decisions/README.md` diff can be reviewed.
- **JTBD-202 still does not exist**, and this change enlarges the gap it must fill by one item: the shutdown contract (drain budget, its relationship to the orchestrator grace window, what expiry does, repeat-signal behaviour), plus `screens:` entries for `src/graceful-shutdown.js` and `src/server2.js`. `ADDRESSR_SHUTDOWN_TIMEOUT_MS` is currently the only `ADDRESSR_*` variable with no owning job. No `@jtbd` annotation was written on the new file, since it would point at a job that does not exist.

### Verification (why this stays Known Error)

Closes when a released build is observed draining on a real `SIGTERM`: either `build-and-smoke` green end to end with a request in flight across the stop, or a production EB deploy observed completing without dropping requests. Neither has happened; the fix is authored, unit-tested, and unreleased.

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
