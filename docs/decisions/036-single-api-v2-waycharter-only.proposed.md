---
status: 'proposed'
date: 2026-07-17
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: []
informed: []
reassessment-date: 2026-10-17
supersedes: [003-dual-api-v1-swagger-v2-hateoas]
---

# ADR 036: Single-API architecture — v2 WayCharter only, v1 Swagger dropped

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context (user AskUserQuestion decision + wr-architect:agent options analysis + wr-jtbd:agent review); human-oversight: unconfirmed until ratified at the /wr-architect:review-decisions drain. **Supersedes [ADR 003](003-dual-api-v1-swagger-v2-hateoas.superseded.md).**

## Context and Problem Statement

[ADR 003](003-dual-api-v1-swagger-v2-hateoas.superseded.md) established a dual-API architecture: a v1 Swagger/OpenAPI REST API and a v2 WayCharter HATEOAS API sharing one service layer and OpenSearch backend. The v1 API is built on `swagger-tools@^0.10.4` — a direct dependency whose last substantive development was roughly eight years ago and which is, for practical purposes, abandoned.

That abandonment has become a security liability. `swagger-tools` is the root of all nine remaining production-tree npm-audit findings: it drags in vulnerable `body-parser`, `path-to-regexp`, and `z-schema` → `validator` (DoS / ReDoS / URL-validation-bypass class). The non-breaking `npm audit fix` performed under [P030](../problems/known-error/030-dependabot-46-vulnerabilities-on-master.md) cleared 21 of 48 findings but could not touch these; `npm audit fix --force` proposed _downgrading_ `swagger-tools` to 0.9.8, a breaking change. The residue keeps the CI `check-deps` gate red, which blocks the release pipeline.

The decisive fact is that **production no longer runs v1 at all**. `deploy/deploy.sh` hard-codes `addressr-server-2` → `src/waycharter-server.js` (`@mountainpass/waycharter`), which imports no `swagger-tools`; the `Dockerfile` `CMD` is already `addressr-server-2`. `swagger-tools` is imported _only_ by the legacy v1 binary (`bin/addressr-server` → `server.js` → `swagger.js` → `initializeMiddleware`), which the deployed service never starts. So the vulnerable code ships dormant inside the npm package and Docker image but is never loaded in the live RapidAPI service — the exposure is a supply-chain concern for self-hosted operators who run the v1 binary, not a live attack surface on the paid API.

The JTBD review (wr-jtbd:agent, 2026-07-17/18) established that v1 is not merely unused but structurally incapable of serving several documented jobs: `api/swagger.yaml` declares only `/`, `/addresses`, `/addresses/{addressId}` — it has never had `/localities`, `/postcodes`, or `/states`, so **JTBD-002 (locality/postcode/state lookup) has always been v2-exclusive**; and the v1 server wires **no gateway auth enforcement at all** (zero `proxy-auth` references), so it ships an origin that cannot satisfy **JTBD-200 (protect the gateway boundary)**. All jobs and personas this decision argues from were ratified (`human-oversight: confirmed`, 2026-07-18) before this ADR landed.

ADR 003 anticipated exactly this: it named "swagger-tools becoming a security liability" and "Decision to deprecate v1 entirely" as reassessment triggers (now met), listed "Replace v1 with v2" as a considered option, and already lamented the standing cost that "two server binaries must be maintained" while "CI tests v1 API paths but not v2".

## Decision Drivers

- **Abandoned dependency at the root of every remaining production-tree vulnerability** — no upstream will ever patch `swagger-tools`; containment only defers.
- **The release pipeline is blocked** — `check-deps` stays red while these findings persist, gating shipping of unrelated fixes.
- **Production is already v2-only** — dropping v1 has zero live-service and zero revenue impact; the risk of the change is far lower than it appears.
- **v1 cannot serve documented jobs** — JTBD-002 is structurally v2-exclusive, and the v1 origin cannot satisfy JTBD-200's gateway-enforcement need.
- **Dual-binary maintenance burden** — ADR 003 itself flags two server binaries and asymmetric CI coverage as standing costs.
- **Lowest residual security posture** — removal eliminates the liability outright rather than suppressing or forking it.
- **ADR 003's own reassessment criteria are met** — this is its documented Considered Option 2, not a novel direction.

## Considered Options

1. **Drop the v1 Swagger API entirely — serve only v2 (chosen)** — delete the v1 surface and `swagger-tools`; single-API architecture.
2. **Accept-and-contain + allowlist the advisories in `check-deps`** — keep `swagger-tools`, record a time-boxed risk acceptance leaning on the ADR 024 gateway; unblocks releases immediately but ships the vulnerable code on.
3. **Patch-fork `swagger-tools`** — fork it and bump its vulnerable transitive lines under our own scope.
4. **Replace the v1 middleware framework** — re-platform `swagger.js` onto a maintained stack (`express-openapi-validator`), keeping the v1 contract alive.
5. **Repackage v1 as opt-in** — keep v1 available but stop shipping it (and `swagger-tools`) in the default install and Docker image.

## Decision Outcome

Chosen option: **"Drop the v1 Swagger API entirely — serve only v2"**, because it removes the abandoned-dependency liability and all nine production-tree findings at the root, retires a dual-binary maintenance burden ADR 003 already regretted, and does so with zero impact on the live revenue-generating service — production has run v2 exclusively since the v1 decommission, so the only thing v1 still costs us is risk and maintenance. Every alternative either keeps the vulnerable code in the shipped artefact (accept-and-contain, repackage), trades a dormant liability for a perpetual maintenance one (patch-fork), or spends L–XL effort re-platforming a binary production does not run (replace-framework).

**This ADR records the decision and its supersession bookkeeping only. The actual v1 code removal is a separate, major-version follow-up gated by the Confirmation criteria below** — it is deferred because it is a breaking change (a removed `bin` entry and package export) that warrants its own focused change and consumer notice, and because ADR-036 should be ratified at the `/wr-architect:review-decisions` drain before the destructive removal proceeds.

The accepted cost is a hard break for any self-hosted operator running the v1 binary. This is a deliberate, semver-honest break: it ships as a **major version** with consumer notice.

### Scope of the removal (for the follow-up implementer)

Delete: `swagger.js`, `server.js`, `controllers/` (`Default.js`, `Addresses.js`), `bin/addressr-server.js`, `api/swagger.yaml` (keep `api/swagger-2.yaml`), the `addressr-server` entry in `package.json` `bin`, the `swagger-tools` dependency, `test/js/__tests__/swagger.test.mjs` (it runs in the pre-commit `test:js`), the v1 feature files `test/resources/features/addresses.feature` + `addresses-structured.feature`, the v1 test legs (`test:rest:nogeo`, `test:cli:nogeo`, `test:rest:geo`, `test:cli:geo`) and their `test`/`test:geo`/`test:nogeo` orchestrator references, the 10 genuine v1 `start:server*` launcher scripts + `watch:start:server*` (NOT `start:server:docker` / `prestart:server:docker`, which run the published v2 image), `cover:rest:*` / `cover:cli:*` / `dotest:cli:*` / `pretest:cli:*` / `watch:test:rest:nogeo`, the `rest` and `cli` cucumber profiles in `cucumber.js` (keep `rest2`/`cli2`), and the `addressr-server` references in `scripts/run.sh` (lines 9, 17) + `scripts/run-in-docker.sh` + `scripts/run-in-docker-from-npm.sh`. Also drop `swagger.js` from the `screens:` list of `docs/jtbd/self-hosted-operator/JTBD-201-*.md` and sweep the now-dead `@not-cli` / `@not-rest` cucumber tags. No `Dockerfile` change (already `CMD addressr-server-2`).

## Consequences

### Good

- All nine `swagger-tools`-chained findings (`body-parser`, `path-to-regexp`, `z-schema` → `validator`) disappear from the production dependency tree; `check-deps` unblocks and the release pipeline flows again.
- The abandoned-dependency liability is eliminated permanently rather than suppressed by an allowlist that would rot.
- **Strengthens JTBD-200**: the v1 binary is a live instance of the self-hosted-operator's own documented pain point ("silent misconfiguration that ships an unauthenticated origin to production") — it wires no gateway enforcement. Deleting it removes that footgun.
- One server binary instead of two — removes the maintenance burden and the asymmetric-CI-coverage gap ADR 003 named.
- Smaller npm package and Docker image; simpler CI (the v1 `rest`/`cli` legs retire).
- Self-hosted operators stop receiving vulnerable dormant code in the artefact.

### Neutral

- RapidAPI paying consumers see no change whatsoever — they are already served by v2 through the ADR 024 / ADR 032 Cloudflare Worker gateway.
- The shared service layer (`service/address-service.js`) is framework-agnostic and needs no change; only the v1 delivery surface is removed.
- `/api-docs` is served by `src/waycharter-server.js` (`buildOpenApiSpec`), not by `swagger-tools` (the `swaggerUi` options in `swagger.js` are commented out), so ADR-023's RapidAPI-spec sync is untouched.
- **ADR-031 (Read-Shadow) is amended in this commit**: its Confirmation clause and "Where the code lives" table both reference `swagger.js`'s `validateReadShadowConfig()` call. Post-removal only `src/waycharter-server.js` validates read-shadow config at startup (it retains its own call at ~line 558), so the read-shadow "partial credential configuration fails at startup" outcome survives. The amendment is append-only, no status change (ADR-031 is `status: proposed` / `human-oversight: confirmed`).
- JTBD-201's `screens:` list must drop `swagger.js` at removal time — a mapping correction only; the outcome survives via `src/waycharter-server.js`.

### Bad

- **Hard break for self-hosted operators running the v1 `addressr-server` binary** against the `api/swagger.yaml` contract (`GET /addresses?q=&p=` returning a JSON array with `link`/`link-template` headers; `GET /addresses/{addressId}`). They must migrate to the v2 HATEOAS contract or pin the last v1-bearing major.
- Requires a major semver bump and consumer communication — more release ceremony than a patch.
- v1-binary usage among self-hosted consumers is unmeasured; the break is taken on the judgement (confirmed by the maintainer) that it is negligible.
- The v1 OpenAPI/Swagger contract documentation (`api/swagger.yaml`) is retired; any consumer depending on it as a spec artefact loses it.
- Until ADR-036 is ratified and the removal ships, ADR-003 shows as `superseded` by a `proposed` decision — the "pending ratification" note on ADR-003 advertises this provisional window; if ADR-036 is rejected at ratification, the ADR-003 bookkeeping must be reverted.

## Confirmation

Verified at removal time (file-existence + import-graph checks, chosen over substring greps that would false-positive on retained v2 files such as `src/waycharter-server.js` and the `rest2`/`cli2` profiles):

- `git ls-files` no longer lists `swagger.js`, `server.js`, `controllers/Default.js`, `controllers/Addresses.js`, `bin/addressr-server.js`, `api/swagger.yaml`, `test/js/__tests__/swagger.test.mjs`, `test/resources/features/addresses.feature`, or `test/resources/features/addresses-structured.feature`; `api/swagger-2.yaml` remains.
- `npm ls swagger-tools` reports nothing; `swagger-tools` is absent from `package.json` and `package-lock.json`.
- No retained module imports the removed v1 layer: `git grep -nE "require\(['\"]\./(server|swagger)['\"]\)|from ['\"]\./(server|swagger|controllers)" -- '*.js' '*.mjs'` returns nothing.
- `package.json` `bin` lists only `addressr-server-2`; the v1 `start:server*` launcher scripts, the `rest`/`cli` cucumber profiles in `cucumber.js`, and the `addressr-server` references in `scripts/run.sh` + `run-in-docker*.sh` are gone.
- `docs/jtbd/self-hosted-operator/JTBD-201-*.md` `screens:` no longer lists `swagger.js`; no cucumber scenario carries an orphaned `@not-cli` / `@not-rest` tag.
- `npm run pre-commit` and the full v2 suite (`test:rest2:*`, `test:cli2:*`, `test:nodejs:*`, `test:js`) pass; `deploy/deploy.sh` continues to start `addressr-server-2`.
- The CI `check-deps` job is green; a major version is published to npm and the live smoke test passes post-deploy.

For _this_ recording commit specifically: ADR-036 exists as `proposed`; ADR-003 is renamed to `.superseded.md` with `status: superseded`; ADR-031's swagger.js references are amended; `docs/decisions/README.md` regenerated to show ADR-036 and ADR-003-as-superseded.

## Pros and Cons of the Options

### Drop the v1 Swagger API entirely (chosen)

- Good, because it removes all nine production-tree vulnerabilities and the abandoned dependency at the root, permanently.
- Good, because production already runs v2 only — zero live-service or revenue blast radius.
- Good, because it retires the two-binary maintenance burden and the CI-coverage asymmetry ADR 003 documented, and deletes an origin that cannot satisfy JTBD-200.
- Good, because it is ADR 003's own anticipated Option 2, triggered by its own stated reassessment criterion.
- Bad, because it breaks the v1 contract for any self-hosted operator still running that binary.
- Bad, because it demands a major version bump and consumer notice.

### Accept-and-contain + allowlist advisories

- Good, because it is S effort and unblocks the release pipeline immediately.
- Good, because it is defensible on the facts: the live service never loads the code and ADR 024 fronts the origin.
- Bad, because vulnerable code keeps shipping to self-hosted v1 users and in the Docker image.
- Bad, because allowlists rot — they suppress future CVEs on the same lines too.
- Bad, because it defers rather than resolves; the abandoned dependency remains forever.

### Patch-fork swagger-tools

- Good, because it preserves the exact v1 wire contract with no consumer break.
- Bad, because we would own the security and compatibility surface of an eight-year-abandoned middleware indefinitely.
- Bad, because it is high ongoing burden for a binary production does not run.

### Replace the v1 middleware framework

- Good, because it removes all the vulnerabilities while keeping the v1 API alive and contract-compatible.
- Good, because it puts v1 on a maintained, actively-developed validation stack.
- Bad, because it is L–XL effort spent on a binary production does not run.
- Bad, because `controllers/` reads `request.swagger.params[...]` and `swagger.js` defines a `failedValidation` error shape — both must be reproduced exactly or the v1 contract drifts silently.

### Repackage v1 as opt-in

- Good, because the default install and Docker image stop carrying the vulnerable lines.
- Good, because v1 remains available to operators who explicitly want it.
- Bad, because `swagger-tools` still exists and still rots for opt-in users.
- Bad, because it adds packaging complexity across the distribution surface (ADR 013 / ADR 017).

## Reassessment Criteria

- A self-hosted operator materially depends on the v1 `addressr-server` binary and the break proves costlier than assumed — reopen via the repackage-as-opt-in option (5) rather than restoring `swagger-tools`.
- A maintained, drop-in successor to `swagger-tools` appears and a concrete need for an OpenAPI-described REST surface returns — reconsider option (4) on a maintained stack, not a v1 restoration.
- Demand emerges for a non-HATEOAS REST surface alongside v2 (e.g. a consumer segment that cannot navigate links) — that is a new decision about a _new_ v3 surface, not a revival of this one.
- ADR-036 is rejected at the ratification drain — revert the ADR-003 supersession bookkeeping and reopen the P030 residual with an alternative option (accept-and-contain / repackage).
- Reassess on 2026-10-17 regardless, to confirm the decision held and the removal follow-up either shipped or remains tracked.
