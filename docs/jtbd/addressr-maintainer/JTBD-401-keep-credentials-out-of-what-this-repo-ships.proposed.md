---
human-oversight: confirmed
oversight-date: 2026-08-23
status: proposed
job-id: keep-credentials-out-of-what-this-repo-ships
persona: addressr-maintainer
date-created: 2026-08-23
screens:
  - 'test/js/__tests__/website-carries-no-webhook-credential.test.mjs — the source-tree guard. Cheap, needs no build, so it runs on every commit. Membership is by `@jtbd JTBD-401` annotation, following the JTBD-400 convention.'
  - "apps/website/test/rendered-output.test.mjs — the build-output scanner, which EXISTS as of 2026-08-23 and is PARTIAL. Added with the ADR-053 import; this entry previously read DOES NOT EXIST and was falsified by that same commit. It scans every emitted asset for the Slack webhook host and for `AIza`-shaped Google API keys, allowlisting the one known Maps browser key by prefix so a SECOND key reds the build. Partial in three ways that matter: one tree, two patterns, and it cannot speak to whether the known key is restricted. The 2019 exposure lived in build output, which is why this is the half that counts. SCOPE-LIMITED 2026-08-24: TWO assertions of that file, `emits no Slack webhook URL in any built asset` and `emits no NEW Google API key beyond the one already known`. The file also carries head-element assertions — `<title>` and `<html lang>` — which are JTBD-004's and are NOT this job. Stated because the entry previously described the whole file, and a reader would otherwise count accessibility assertions as credential coverage and inflate a job whose own reassessment criteria warn against being left as a record of an intention."
  - "test/js/__tests__/deploy-sh-plan-only.test.mjs — ONE assertion of that file, `leaves nothing un-ignored in the deployment directory`. The deployment tree is the OTHER place this repo can leak a credential, and the one not covered by the two website entries above: `tfplan.json` carries the AWS secret key, the ADR-024 proxy-auth secret and the Cloudflare token in cleartext, and the repo is public. It runs deploy.sh in an isolated tracked-only copy and asks `git check-ignore` whether the repo's rules would cover each artefact produced. The rest of that file is JTBD-400 and is not this job; membership is by `@jtbd JTBD-401` annotation, and the file carries both markers deliberately. **This entry is NOT progress against the confirmation line below.** An ignore-coverage guard greps no credential patterns at all, so it cannot generalise past one known string — it prevents a class of file from being offered for commit, which is a different control from scanning content."
---

# JTBD-401: Keep credentials out of what this repository ships

> Created 2026-08-23 during the `apps/website` import ([ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md)). The `wr-jtbd:agent` gate was asked whether a credential-absence guard traced to JTBD-200 (protect the chosen gateway boundary) and **rejected the trace**: a Slack incoming-webhook authenticates to Slack, not to Addressr, the harmed party is the project rather than the `self-hosted-operator` persona, and every one of JTBD-200's desired outcomes is about header configurability and fail-loud partial config. It rejected JTBD-400 too — secret hygiene is not "releases stay deterministic" — and did so by taking up that job's own invitation to test the generalisation its screens list warns against. The honest conclusion was that the control class had no job. This is that job.

## Job Statement

When I import, write, or accept code into a public repository that ships an npm package, a Docker image and a website, I want a credential that reaches source or build output to red the build, so that a bearer token cannot sit exposed for seven years before anyone notices.

## Desired Outcomes

- A credential committed to source fails a check that runs on every commit, naming the file.
- A credential that reaches **build output** fails a check, whether or not it is visible in source. This is the half that matters and the half that does not exist: the 2019 exposure was a browser `fetch` whose URL was inlined into a client bundle and served to every visitor of addressr.io.
- Importing a repository does not silently import its exposure. The survey that found these two webhooks happened because a human read the tree during a move, which is not a control.
- A guard that finds nothing says so, rather than passing quietly. A credential scan with an empty corpus reporting green is worse than no scan, because the green is read as coverage.

## Persona Constraints

- **Addressr Maintainer** (primary): the repository is public and ships three distinct artefacts. The maintainer is the only reviewer, so a control that depends on someone noticing is not a control — the same reasoning that put the licence audit into CI rather than leaving it in a local hook.

## Current Solutions

- **Reading the tree during a move.** How both webhooks were actually found, on 2026-08-23, roughly seven years after the first was committed. Not repeatable and not a control.
- **GitHub secret scanning.** Covers provider-registered patterns; Slack incoming-webhook URLs are within its published coverage, so either it is not enabled on these repositories or its alerts have no reader. Worth establishing which before building anything, because the answer changes what is worth building.
- **Trusting review.** Both credentials survived every review since 2019.

## Known credential in the served bundle — RESOLVED 2026-08-23: verified restricted

`apps/website/src/components/Search.js` inlines a Google Maps browser API key (`AIzaSyBJ9PUm…`), and it reaches
the client bundle. Same shape as the 2019 Slack exposure this job exists for, and it is the first thing a
build-output scanner will hit — so it needs a recorded status before that scanner exists, or whoever builds
it will either blanket-suppress `AIzaSy*` or raise a false incident.

**RESOLVED 2026-08-23.** The maintainer verified the key in the Google Cloud console and confirmed it is restricted. Provenance matters and is recorded deliberately: this is the maintainer's console reading, not an independent probe — the section below explains why no probe available from outside could have settled it, and that remains true. The key stays in the served bundle by design, because a browser key must reach the browser; what makes it safe is the restriction, which lives in configuration this repository cannot see.

The history below is retained rather than deleted, because the _reason_ it could not be settled from outside is the load-bearing part for the build-output scanner: a scanner will hit this key, and its allowlist entry rests on a fact no scan can verify.

**Why it was recorded as unverified rather than benign, on the evidence at the time.** A review asserted it was correctly
HTTP-referrer restricted, citing 200 with `Referer: https://addressr.io/` and 403 `not authorized` from an
arbitrary referer. **That does not reproduce.** Probing `https://maps.googleapis.com/maps/api/js?key=…` on
2026-08-23 returned **HTTP 200 with an identical payload for both referers** — the JS loader endpoint does
not enforce referrer restrictions, so it cannot distinguish a restricted key from an unrestricted one in
either direction. The probe was the wrong instrument, not the key exonerated.

A second probe was tried and also fails to discriminate, recorded so nobody reaches for it next: `AuthenticationService.Authenticate` — the endpoint the Maps loader itself uses to validate the referrer — returns the same `NotLoadingAPIFromGoogleMapsError` payload for both origins, because it refuses to answer outside a real loader context.

**This is unresolvable from outside.** A browser key's referrer allowlist is only authoritatively readable in
the Google Cloud console, and the REST endpoints that would fail loudly reject browser-restricted keys
anyway, so a `REQUEST_DENIED` there would prove nothing either. Whoever holds the console needs to confirm:
that the key is restricted to the addressr.io origins, and that its API surface is limited to what Search.js
actually uses.

Two things follow for this job. It is the first true test of the build-output criterion, which does not
exist. And it is a worked example of why the criterion has to be about **build output** rather than source —
this key is legitimately in source, because a browser key has to reach the browser; what makes it safe or
not is configuration held somewhere this repository cannot see. A scanner that only greps source would
either miss it or cry wolf.

## Confirmation

- **Source-tree guard exists and is mutation-proved.** `website-carries-no-webhook-credential.test.mjs` asserts no Slack webhook host string under `apps/website`, with a floor that fails when the corpus is empty rather than passing vacuously. **Met at the import commit.**
- **Build output is scanned.** **PARTIALLY MET as of 2026-08-23** — previously NOT MET, and the change came with the ADR-053 import. `apps/website/test/rendered-output.test.mjs` scans emitted assets for the Slack webhook host and for `AIza`-shaped keys, with an encoded floor so an empty match set fails rather than passing. Still not met in full: it covers ONE tree (`apps/website`, not the npm tarball or the Docker image) and TWO patterns, so a credential of any other shape, or in any other artefact, passes untouched.
- **The guard generalises past one known string.** **NOT MET.** The current check greps one host for one directory. A credential arriving through a dependency, an env-substituted template, or any provider other than Slack passes untouched.

## Reassessment Criteria

- **The Maps key's restriction changes, or the key is rotated without the allowlist entry following.** The build-output scanner allowlists it by prefix; a rotation silently turns the allowlist into a rule that matches nothing and the new key reads as an unrecognised one, which reds the build. That is the safe direction, but the entry needs updating with the key rather than after it.
- **A second credential is found in any tree, by any route.** That converts the "importing a repo imports its exposure" observation from an anecdote into a pattern, and makes the build-output criterion urgent rather than aspirational.
- **GitHub secret scanning turns out to be enabled and alerting.** Then the gap is a reader problem, not a detection problem, and the job's shape changes accordingly.
- **The website ports off Gatsby, or gains a second bundler.** Bundle-inlining behaviour is what made the original exposure reach browsers; a different toolchain changes what build-output scanning has to look at.
- **This job still has one screen at its next review.** A job whose only member is the guard written on the day it was created has not been adopted, and should be either invested in or retired rather than left as a record of an intention.
