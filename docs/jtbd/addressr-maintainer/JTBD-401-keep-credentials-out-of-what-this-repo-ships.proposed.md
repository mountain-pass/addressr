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

## Known credential in the served bundle — RESOLVED, and independently probed 2026-08-24

> **2026-08-24 — the "unresolvable from outside" conclusion below is WRONG, and correcting it is the point of
> this block.** It was drawn from probing `maps/api/js`, the loader endpoint, which returns identical 200s
> for any referrer. But that is not the endpoint this site uses. `Search.js:400` calls
> `maps/embed/v1/view`, and **that endpoint discriminates cleanly**:
>
> | `Referer`                                | Result                 |
> | ---------------------------------------- | ---------------------- |
> | `https://addressr.io/`                   | **200**                |
> | `https://addressr.mountain-pass.com.au/` | **200**                |
> | `http://localhost:8000/`                 | **200**                |
> | `https://unrelated-example.net/`         | **403 not authorized** |
> | `https://addressr.io.evil.example/`      | **403 not authorized** |
>
> Reproducible from any machine, no console access needed:
>
> ```
> curl -so /dev/null -w '%{http_code}\n' -H 'Referer: https://example.net/' \
>   "https://www.google.com/maps/embed/v1/view?key=<key>&center=0,0&zoom=1"
> ```
>
> The last row is the one worth keeping: a naive prefix match would let `addressr.io.evil.example` through.
> It does not, so the allowlist matches hosts rather than substrings.
>
> **The key's live restrictions, read from the API rather than a screenshot:** referrers `addressr.io`,
> `addressr.mountain-pass.com.au`, `localhost`; `apiTargets` scoped to `maps-embed-backend.googleapis.com`
> alone. So a leaked key buys satellite tiles on our quota and nothing else. Project `addressr-338521`, key
> uid `16aa6df6-5500-49eb-8dfe-4061c8e97dc0`, created 2022-01-17.
>
> **Two of those referrers were added on 2026-08-24 because they were missing and the map was broken.** The
> allowlist held only `addressr.io`, while `addressr.mountain-pass.com.au` serves the same site as a live
> domain alias — so its embeds 403'd — and `localhost` was absent, so `gatsby develop` showed no map. Found
> by running the probe above, which is precisely the check the paragraph below said could not exist.
>
> **A stale entry the comparison surfaced**, recorded here because it is the kind of thing someone "fixes"
> by widening a key: ADR-018's worker safelist carries a FOURTH origin,
> `addressr.mountainpass.com.au` (no hyphen). That hostname is **NXDOMAIN** — it does not resolve. It must
> NOT be added to the Maps key for parity; the worker entry is what is wrong.
>
> The history below is retained rather than rewritten, because the reasoning that produced a wrong
> conclusion from a correct observation is the useful part.

## Known credential in the served bundle — RESOLVED 2026-08-23: verified restricted

`apps/website/src/components/Search.js` inlines a Google Maps browser API key (`AIzaSyBJ9PUm…`), and it reaches
the client bundle. Same shape as the 2019 Slack exposure this job exists for, and it is the first thing a
build-output scanner will hit — so it needs a recorded status before that scanner exists, or whoever builds
it will either blanket-suppress `AIzaSy*` or raise a false incident.

**RESOLVED 2026-08-23.** The maintainer verified the key in the Google Cloud console and confirmed it is restricted. Provenance matters and is recorded deliberately: this is the maintainer's console reading, not an independent probe — and the section below argued no probe available from outside could have settled it. **That argument was wrong, and is marked FALSIFIED where it appears; an earlier version of this sentence ended "and that remains true", which is the claim being retracted.** An independent probe now exists and runs in CI. The key stays in the served bundle by design, because a browser key must reach the browser; what makes it safe is the restriction, which lives in configuration this repository cannot see.

The history below is retained rather than deleted, because the reasoning that produced a wrong conclusion from correct observations is the useful part. What it originally claimed to be load-bearing — that "a scanner will hit this key, and its allowlist entry rests on a fact no scan can verify" — is exactly what stopped being true on 2026-08-24: the allowlist entry in `rendered-output.test.mjs` now rests on a fact `test/credentials/maps-key-is-restricted.test.mjs` verifies on every push.

**Why it was recorded as unverified rather than benign, on the evidence at the time.** A review asserted it was correctly
HTTP-referrer restricted, citing 200 with `Referer: https://addressr.io/` and 403 `not authorized` from an
arbitrary referer. **That does not reproduce.** Probing `https://maps.googleapis.com/maps/api/js?key=…` on
2026-08-23 returned **HTTP 200 with an identical payload for both referers** — the JS loader endpoint does
not enforce referrer restrictions, so it cannot distinguish a restricted key from an unrestricted one in
either direction. The probe was the wrong instrument, not the key exonerated.

A second probe was tried and also fails to discriminate, recorded so nobody reaches for it next: `AuthenticationService.Authenticate` — the endpoint the Maps loader itself uses to validate the referrer — returns the same `NotLoadingAPIFromGoogleMapsError` payload for both origins, because it refuses to answer outside a real loader context.

**This is unresolvable from outside.** — **FALSIFIED 2026-08-24. See the block at the top of this section.**
Retained because the reasoning is instructive, not because it holds. A browser key's referrer allowlist is
only authoritatively readable in the Google Cloud console, and the REST endpoints that would fail loudly
reject browser-restricted keys anyway, so a `REQUEST_DENIED` there would prove nothing either. Whoever holds
the console needs to confirm: that the key is restricted to the addressr.io origins, and that its API
surface is limited to what Search.js actually uses.

**Where that went wrong**, because the error is more useful than the conclusion: two endpoints were probed
and both failed to discriminate, and the inference drawn was that NO endpoint could. That does not follow.
The endpoint the site actually calls — `maps/embed/v1/view` — was never tried, and it discriminates. The
generalisation from "the two I tried cannot" to "none can" is the whole defect, and it converted a gap in
the probe set into a recorded impossibility that told the next reader not to look.

Two things follow for this job. It is the first true test of the build-output criterion, which does not
exist. And it is a worked example of why the criterion has to be about **build output** rather than source —
this key is legitimately in source, because a browser key has to reach the browser; what makes it safe or
not is configuration held somewhere this repository cannot see. A scanner that only greps source would
either miss it or cry wolf.

## Confirmation

- **Source-tree guard exists and is mutation-proved.** `website-carries-no-webhook-credential.test.mjs` asserts no Slack webhook host string under `apps/website`, with a floor that fails when the corpus is empty rather than passing vacuously. **Met at the import commit.**
- **Build output is scanned.** **PARTIALLY MET as of 2026-08-23** — previously NOT MET, and the change came with the ADR-053 import. `apps/website/test/rendered-output.test.mjs` scans emitted assets for the Slack webhook host and for `AIza`-shaped keys, with an encoded floor so an empty match set fails rather than passing. Still not met in full: it covers ONE tree (`apps/website`, not the npm tarball or the Docker image) and TWO patterns, so a credential of any other shape, or in any other artefact, passes untouched.
- **The guard generalises past one known string.** **NOT MET.** The current check greps one host for one directory. A credential arriving through a dependency, an env-substituted template, or any provider other than Slack passes untouched.
- **The one credential that legitimately ships is provably constrained.** **MET 2026-08-24**, and it is the only criterion here met by a probe rather than by a test. The Maps browser key must reach the browser, so absence is not the goal; the goal is that holding it buys almost nothing. Both halves are now established from outside the console: the referrer allowlist discriminates (`403 not authorized` for an unrelated origin AND for the lookalike `addressr.io.evil.example`, proving host matching rather than prefix matching), and `apiTargets` is scoped to `maps-embed-backend.googleapis.com` alone, so a leaked key buys satellite tiles on our quota and nothing else. **This criterion is deliberately about CONSTRAINT, not absence** — the other three ask whether a credential is present where it should not be; this one asks whether the one that belongs there is bounded. **Superseded within the day:** this line originally continued "met by an external observation, not by anything that runs in CI, so it can silently stop being true". That was true for about four hours. `test/credentials/maps-key-is-restricted.test.mjs` now probes it on every push, so the criterion is met by something that runs. Retained because the gap it named is why the guard exists.

## Reassessment Criteria

- **The Maps key's restriction changes, or the key is rotated without the allowlist entry following.** The build-output scanner allowlists it by prefix; a rotation silently turns the allowlist into a rule that matches nothing and the new key reads as an unrecognised one, which reds the build. That is the safe direction, but the entry needs updating with the key rather than after it. **Sharpened 2026-08-24, then discharged the same day.** The paragraph here first said the restriction was "checkable rather than merely watchable — but nothing checks it", and closed "if this job ever gains an executable guard, that probe is the cheapest one available". That guard was then written: `test/credentials/maps-key-is-restricted.test.mjs`, four assertions, running in the `website-build` CI job. A referrer allowlist widened to `*` now reds it. What remains uncovered is the API-surface half — `apiTargets` is readable only through gcloud with project credentials CI does not have — so a rotation that preserved the referrers and widened the API scope would still pass.
- **A domain the site serves is added or retired.** Learned the hard way on 2026-08-24: the site answers on `addressr.mountain-pass.com.au` as well as `addressr.io`, and the Maps key allowed only the latter, so the map 403'd on the alias and in local development. Three allowlists now have to agree — the Maps key, ADR-018's worker `safeHosts`, and whatever DNS actually resolves — and nothing reconciles them. ADR-018's list already carries `addressr.mountainpass.com.au` (no hyphen), which is **NXDOMAIN**; it must not be copied to the Maps key for parity, because the worker entry is the wrong one.
- **A second credential is found in any tree, by any route.** That converts the "importing a repo imports its exposure" observation from an anecdote into a pattern, and makes the build-output criterion urgent rather than aspirational.
- **GitHub secret scanning turns out to be enabled and alerting.** Then the gap is a reader problem, not a detection problem, and the job's shape changes accordingly.
- **The website ports off Gatsby, or gains a second bundler.** Bundle-inlining behaviour is what made the original exposure reach browsers; a different toolchain changes what build-output scanning has to look at.
- **This job still has one screen at its next review.** A job whose only member is the guard written on the day it was created has not been adopted, and should be either invested in or retired rather than left as a record of an intention.
