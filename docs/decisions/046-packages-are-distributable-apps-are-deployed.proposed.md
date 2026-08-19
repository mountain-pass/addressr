---
status: 'proposed'
date: 2026-08-10
human-oversight: confirmed
oversight-date: 2026-08-10
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent, wr-risk-scorer:pipeline]
informed: []
reassessment-date: 2026-11-10
---

# Packages are distributable, apps are deployed

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per ADR-032, derived-substance amendment 2026-07-06 / RFC-045). Section content was derived by the capturing agent from the in-session decision context and RATIFIED by the decision-maker on 2026-08-10 at the /wr-architect:review-decisions drain. What the user decided directly, and what was derived, is recorded in the commit that wrote the marker.

## Context and Problem Statement

The deployment tree moved **twice on 2026-08-10**: `deploy/` → `packages/deployment/` (`bf106786`), then `packages/deployment/` → `apps/addressr-deployment/` (`2f729d1b`). The convention that motivated the second move was recorded nowhere, and a second deployable — `apps/website` — is already anticipated.

The question the second move answered was raised by the user directly: _"what happens when we bring apps/website in here? Then packages/deployment will be very confusing."_ That is correct and it is a naming problem with teeth. `deployment` is unambiguous only while there is exactly one deployable; add a second and the directory reads as "the deployment" of something unspecified, with the natural wrong guess being that it deploys the website too, or that there ought to be a second one beside it.

Underneath the naming question sits a real structural one: **is there one infrastructure stack or several?** The answer settled the layout. User, same session: _"the website would not neccesaryly be deployed to the same infra."_ If the website may land on Pages, a different account, or its own Terraform state, then "the infrastructure" is not a single thing and any layout that models it as one needs retrofitting the day that call is made.

This repo also has a genuinely two-sided distribution story that the layout should make legible. `@mountainpass/addressr` is a **published npm package** that a self-hosted operator installs and runs (the `self-hosted-operator` persona; JTBD-202 covers running the published Docker image). Our production service is a **separate concern** — Terraform, Elastic Beanstalk, CloudWatch alarms, a Cloudflare Worker, OpenSearch — that consumes that package at an exact version. Those are different kinds of thing and the repo layout was not saying so.

## Decision Drivers

- **A second deployable is coming, and the layout must already be right for it.** Renaming again after `apps/website` exists costs more than getting it right now, and this tree has already been moved twice in one day.
- **Do not assume shared infrastructure.** The website's deployment target is explicitly undecided, so the layout must not encode an answer.
- **The path should answer "is this published or deployed?"** without opening a file.
- **A directory whose name is wrong gets "fixed" by a future reader.** `apps/addressr-deployment` will read as a typo for `apps/addressr` to someone who does not know why; the reason has to be written down or the rename is temporary.
- **The `workspaces` glob is load-bearing, not cosmetic.** ADR-045 makes a changesets bump of the deployment package the thing that arms a production Terraform apply. A layout change that breaks the glob breaks production deploys silently.

## Considered Options

1. **`packages/*` distributable, `apps/*` deployed, with `apps/addressr-deployment` (chosen)** — split on what the directory _is_, not on tooling; the deployment tree becomes an app with an explicit suffix.
2. **A shared `packages/infra` for all deployment** — one Terraform package serving every deployable. Rejected: it assumes a single root module, which the user's _"would not neccesaryly be deployed to the same infra"_ rules out. It would need retrofitting the moment the website's target is decided.
3. **`apps/api` for the deployment tree** — the conventional Turborepo shape. Rejected: `apps/api` names the API _application_, which is `packages/addressr`. It would give the most confusable name in the repo to the one directory that is not the API.
4. **`apps/addressr`, no suffix** — symmetric with a future `apps/website`. Rejected: it implies the Addressr application lives there, and it does not; what lives there is Terraform pointing at an npm package. It also collides on basename with `packages/addressr`.
5. **Status quo, `packages/deployment`** — do nothing. Rejected: the name is only unambiguous while one deployable exists, which is the condition about to lapse.

## Decision Outcome

Chosen option: **"`packages/*` distributable, `apps/*` deployed"**.

**The rule.**

|              |                                                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/*` | **Distributable** — published to a registry and installed by someone else. `packages/addressr` is `@mountainpass/addressr` (JTBD-202, the `self-hosted-operator` persona). |
| `apps/*`     | **Deployed** — our running instance of something, or source we host. `apps/addressr-deployment` today; `apps/website` anticipated.                                         |

**The `workspaces` glob is `["packages/*", "apps/*"]` and it is load-bearing.** ADR-045 makes a changesets bump of `@mountainpass/addressr-deployment` the thing that arms a production Terraform apply, and changesets can only bump a package a root glob matches. If a glob stops matching — a move that forgets to update it, someone tidying the list, a package landing outside both — then infrastructure changes stop reaching production, **on a green run, in every tier**. Pinned by `test/js/__tests__/deployment-workspace-membership.test.mjs`, which did not exist before this decision because nothing asserted it.

**The `-deployment` suffix, and its deliberate asymmetry.** `apps/addressr-deployment` carries the suffix because what lives there is Terraform pointing at an npm package, **not** the application. `apps/website` will hold the website's own source and takes **no** suffix. That asymmetry is not an inconsistent naming habit — it marks a real difference in what the directories contain, and it exists because Addressr is distributed as a package while the website presumably will not be. **Record this or it gets tidied away**: a future reader will read `apps/addressr-deployment` as a typo for `apps/addressr` and "correct" it.

**Two reinforcing properties, deliberately not the primary reason.** The suffix removes a `packages/addressr` ↔ `apps/addressr` basename collision, so grep, editor tabs and stack traces disambiguate without the parent directory. And the directory name matches the npm package name, giving a `directory ↔ package` invariant that holds for both workspace packages. Both are real benefits; neither would justify the name on its own, and stating them as primary would invite someone to trade the naming rule away for a different collision fix.

## Consequences

### Good

- The path answers "published or deployed?" on sight, with no file to open.
- Per-app deployment needs no assumption about shared infrastructure, so the website's target can be decided later without a retrofit.
- The arming mechanism ADR-045 depends on is now asserted by a test rather than assumed.
- `packages/addressr` — 165 external references — did not move. The whole cost fell on the 30-reference directory.

### Neutral

- `packages/*` currently holds exactly one entry. The category is correct and under-populated, not wrong.
- The npm package name stays `@mountainpass/addressr-deployment`. It is `private: true` so nobody outside the repo sees it, and with the suffixed directory it now matches rather than merely being cheap to leave alone.

### Bad

- **Moving cost 30 path references plus three classes a path grep structurally cannot find**, and all three would have shipped broken: sibling relative-path lookups carrying no directory literal at all (`deploy.sh:22`, `resolve-version.sh:69` resolving `../addressr/package.json`); an escaped-regex path (`terraform-plan-workflow.test.mjs:142`); and `path.join(root, 'packages', 'deployment')` split into array arguments. A future layout change must search for all four shapes.
- **Every move surfaces lint debt.** `lint-staged` lints only changed files, so a rename presents the whole moved tree, often for the first time. This one surfaced pre-existing findings tracked under P084 and required a Worker lint exemption before the commit could land.
- **The asymmetry needs defending.** A rule with a deliberate exception is harder to hold than a uniform one, and this one will look like a mistake to anyone who has not read this record.
- **A second app will test the rule where it is weakest.** `apps/website` holding source while `apps/addressr-deployment` holds none is the first real case; see Reassessment.

## Confirmation

1. `test/js/__tests__/deployment-workspace-membership.test.mjs` asserts a root `workspaces` glob matches the deployment directory, that `.changeset/config.json` does not ignore the package, that it stays `private: true`, and that `packages/addressr` remains the distributable package under its published name.
2. `npx npm@10 ci` succeeds — the workspace resolves under the exact resolver CI uses.
3. `apps/addressr-deployment/package.json` and its directory name agree, and `packages/addressr/package.json` and its directory name agree — the `directory ↔ package` invariant, checkable by inspection and asserted in part by criterion 1.
4. No `packages/*` entry is `private: true` and no `apps/*` entry is publishable. This is the rule itself; it is currently checkable by inspection over two directories and should become an assertion when a third arrives.

## Pros and Cons of the Options

### `packages/*` distributable, `apps/*` deployed

- Good, because the split is on what a directory contains rather than on which tool consumes it, so it stays true as tooling changes.
- Good, because it scales to a second deployable without assuming anything about where that deployable runs.
- Bad, because the `-deployment` suffix is an exception to an otherwise uniform naming rule and needs this record to survive.

### Shared `packages/infra`

- Good, because one Terraform stack is simpler than several while there is genuinely only one.
- Bad, because it encodes an answer to a question the user has explicitly left open, and would need unpicking at exactly the moment a second deployable is being added.

### `apps/api`

- Good, because it matches the conventional Turborepo layout a newcomer expects.
- Bad, because it names the API application, which lives elsewhere, and so misdirects on the most confusable pair in the repo.

### `apps/addressr`, no suffix

- Good, because it is symmetric with a future `apps/website`.
- Bad, because it implies the application lives there when it does not, and collides on basename with `packages/addressr`.

## Reassessment Criteria

- **`apps/website` lands.** The first real test of the suffix asymmetry. If holding "source-bearing apps take no suffix, deploy-only apps do" proves confusing in practice, the rule is wrong and should be replaced rather than patched.
- **A `packages/*` entry stops being distributable, or an `apps/*` entry becomes published.** Either falsifies the rule directly.
- **The `workspaces` glob shape changes** — a nested glob, an explicit path list, or a package moving outside both trees. ADR-045's arming mechanism depends on the glob matching, so any change to its shape reopens this.
- **A third directory category is proposed** (`tools/`, `infra/`, `services/`). Two categories is what makes the rule memorable; a third needs its own justification against this record.

## Related

- **ADR-045** — the changesets-armed release-PR merge. Its arming mechanism depends on the `workspaces` glob decided here; the load-bearing coupling is stated in both records deliberately.
- **ADR-007** — Changesets for version management. Its reassessment criterion _"moving to a monorepo with multiple packages"_ fired at `ad034ea5`, `bf106786` and `2f729d1b`. It is answered here for **layout** and in ADR-045 for **cascade semantics**; ADR-007 itself is narrowed rather than amended, because neither question is about which versioning tool to use.
- **JTBD-202** — obtaining and running the published artefact; the job that makes `packages/*` a real category rather than a modelling device.
- **ADR-048** — moved-path referrers resolved by executable guard. **Navigational cross-reference only, added 2026-08-18** (`DECISION-MANAGEMENT.md` § What May Be Amended At All): it carries no substance and changes nothing this record decides. Read it alongside the Confirmation criteria above; ADR-048 states how the two relate.
- **P084** — the lint debt this move surfaced, including the two Worker exemptions added at `2f729d1b`.
