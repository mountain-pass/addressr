---
status: 'proposed'
date: 2026-08-27
human-oversight: unconfirmed
decision-makers: [Tom Howard]
consulted: [wr-architect:agent]
informed: []
reassessment-date: 2026-11-27
---

# Cloudflare Pages direct upload from changeset releases

> Captured via /wr-architect:capture-adr (foreground-lightweight aside-invocation per the governance-skill invocation rule, derived-substance amendment 2026-07-06 / the full-substance capture implementation design). Section content was derived by the capturing agent from the in-session decision context; human-oversight: unconfirmed until ratified at the /wr-architect:review-decisions drain.

## Context and Problem Statement

[ADR-053](053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) separated the website import from its hosting cutover and pinned the phase-two outcome: no website change reaches `addressr.io` without a committed changeset, deployment runs from `release.yml`, and Cloudflare Pages git integration is disabled. It deliberately left three implementation decisions open: which Terraform state owns the Pages and root-domain resources, which tool uploads the built site, and which credential may perform those operations. Netlify currently deploys website changes on ordinary pushes to `master`, so the requested release-PR boundary is not yet true.

## Decision Drivers

- `addressr.io` and `api.addressr.io` share one Cloudflare zone, so their infrastructure must not be split across competing Terraform states.
- A source push must never be a production website deployment; only a release-PR merge that consumes a website changeset may deploy.
- Cloudflare's Terraform provider can manage a Pages project and domain but cannot upload Gatsby's built output.
- Pages direct upload is the native Cloudflare mechanism for CI-owned builds and requires no git integration.
- The website deployment credential should not be able to rewrite the API worker or its secrets.
- Production verification must identify the exact merged revision rather than merely observing an HTTP 200 response.

## Considered Options

1. **Existing production Terraform state plus Wrangler direct upload and a Pages-scoped token (chosen)** — the current `apps/addressr-deployment` state owns the Pages project, custom domain, and imported root DNS record; `release.yml` uploads built output only after a website version bump caused by consumed changesets.
2. **Keep Netlify and gate its git build on the website package version** — smaller operational change, but contradicts ADR-053's ratified Cloudflare Pages phase-two destination and leaves deployment control in a second provider integration.
3. **Create a separate Pages Terraform state** — isolates website code but creates split-brain ownership inside the same Cloudflare zone and makes root DNS ownership ambiguous.
4. **Use Cloudflare Pages git integration** — provides easy builds but restores the unarmed push-to-production path the changeset gate exists to remove.

## Decision Outcome

Chosen option: **"Existing production Terraform state plus Wrangler direct upload and a Pages-scoped token"**, because it gives the shared zone one infrastructure owner while keeping the static upload independently gated and least-privileged.

The existing `apps/addressr-deployment` Terraform state owns a direct-upload Pages project named `addressr`, its `addressr.io` custom domain, and the root DNS record after that record's current remote object has been identified and imported. A dedicated aliased Cloudflare provider receives a new secret token limited to Pages Write and DNS Write for the Addressr account and zone; it cannot edit Workers scripts, routes, or secrets. The same token is exposed to Wrangler only in the conditional website deploy step.

The release workflow detects the `@mountainpass/website` version value changing between the pushed parent and merged release commit, with consumed changesets as the second conjunct. Only that predicate builds the Gatsby site and runs `wrangler pages deploy apps/website/public --project-name=addressr --branch=master`. No `source` block is configured on the Pages project, so no Cloudflare git integration exists. The existing Netlify production git integration is disabled before the first post-cutover website source push.

The workflow writes the merged `github.sha` into the built output before upload and verifies that `https://addressr.io/revision.txt` returns that exact value after the custom domain becomes active. A Pages deployment URL alone is staging evidence, not production proof.

## Consequences

### Good

- Website production changes share the same changeset release-PR entry point as packages and infrastructure.
- One Terraform state owns every repository-managed resource in the shared Cloudflare zone.
- Direct upload prevents provider-side git automation from bypassing repository controls.
- The Pages token cannot mutate the production API worker.
- Exact-revision smoke evidence distinguishes a successful upload from a successful production cutover.

### Neutral

- Gatsby remains the website build system; the hosting cutover does not also become a framework migration.
- Wrangler is a deployment client only. Terraform remains authoritative for persistent Pages, domain, and DNS resources.

### Bad

- The first cutover requires identifying and importing the existing root DNS record before Terraform may change it.
- One release temporarily coordinates Netlify disablement, Pages provisioning, DNS cutover, and first upload; rollback evidence must be captured before mutation.
- A second Cloudflare credential and GitHub secret must be created, stored, and rotated.
- Direct Upload projects cannot later switch to git integration; doing so would require a replacement project, which is acceptable because git integration is explicitly outside the release model.

## Confirmation

1. Terraform plan shows the Pages project and domain as additions, the imported root DNS record as an in-place target change, and no change to the API worker route or secret.
2. The Pages project has no source-control `source` block and Cloudflare reports it as Direct Upload.
3. The dedicated token has Pages Write and zone DNS Write only; it lacks Workers Scripts, Workers Routes, and Workers Secrets permissions.
4. Executable tests prove an ordinary website source push does not arm deployment, a release merge without a website version bump does not arm it, and a release merge that consumes a website changeset does arm it.
5. Workflow-structure tests prove build, upload, revision smoke, and any custom-domain activation step share the single website predicate and fail closed when its output is absent.
6. Netlify's production git integration is disabled and a subsequent non-release website commit produces no Netlify or Pages production deployment.
7. The first release records a successful Wrangler production deployment and `https://addressr.io/revision.txt` equals the merged release SHA.
8. `https://addressr.io`, its documented routes, and `https://api.addressr.io` all pass post-cutover smoke checks.

## Pros and Cons of the Options

### Existing production Terraform state plus Wrangler direct upload and a Pages-scoped token

- Good, because it combines one persistent infrastructure owner with a purpose-built CI upload path.
- Good, because a narrowly scoped token limits the impact of a website workflow compromise.
- Bad, because the initial DNS import and coordinated cutover require careful provider evidence.

### Keep Netlify and gate its git build on the website package version

- Good, because it needs no provider migration or new credential.
- Bad, because it reverses the already-ratified Pages direction and retains production control outside the release workflow.

### Create a separate Pages Terraform state

- Good, because website infrastructure could plan independently.
- Bad, because two states would co-own one zone and could race on root-domain resources.

### Use Cloudflare Pages git integration

- Good, because Cloudflare would own build triggers and previews.
- Bad, because a push could reach production without a consumed changeset or release-PR merge.

## Reassessment Criteria

Reassess if Cloudflare adds a Terraform-managed static asset upload resource, if Pages Direct Upload loses production-branch or exact-revision support, if the website moves to a different zone/account, or if two false positives or false negatives occur in the website arming predicate. Reassess the separate credential if Cloudflare offers repository-scoped OIDC for Pages deployments.
