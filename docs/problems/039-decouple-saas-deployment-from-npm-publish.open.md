# Problem 039: Decouple SaaS Deployment From npm Publish in Release Pipeline

**Status**: Open
**Reported**: 2026-05-14
**Priority**: 3 (Medium) — Impact: 3 x Likelihood: 1 (deferred — re-rate at next /wr-itil:review-problems)
**Effort**: M (deferred — re-rate at next /wr-itil:review-problems)

## Description

The current release/deploy pipeline couples two distinct concerns into a single flow:

1. **Publishing the npm artifact** (consumed by downstream library users on the public registry).
2. **Deploying the SaaS** to AWS Elastic Beanstalk (consumed by RapidAPI customers).

This coupling causes two problems:

- **Deployment-only changes require a new npm publish.** When the only change is an environment value in prod — e.g. turning `SHADOW` soaking on/off, rotating an env-driven flag, adjusting a runtime toggle that lives in EB env vars — there is no way to roll the change to the SaaS without cutting a new npm release. The published artifact is identical to the prior version, but the registry, changelog, and consumers all see version churn.
- **Changelog conflates two audiences.** The changelog is becoming littered with entries that describe SaaS-only deployment work (env flips, ADR-029 phase transitions, shadow-soak toggles) alongside entries that describe genuine code changes to the published artifact. npm-registry consumers see deployment-internal notes that are irrelevant to them; SaaS-operations history is mixed in with library release notes.

The decoupling needs to preserve the case where a **new software publish** does apply to BOTH surfaces — i.e. when the production deploy happens against a freshly-published artifact, the publish-relevant changelog entries are still correctly attributed to that release. The asymmetry is one-way: every npm publish is followed by a SaaS deploy of that version, but not every SaaS deploy needs a new npm publish.

The best decoupling shape is not yet decided. Options sketched (non-exhaustive, for discussion):

- Separate changelog streams: `CHANGELOG.md` for the published artifact, `DEPLOY-LOG.md` (or similar) for SaaS-only deployment events.
- Changeset typing: extend the `.changeset/` workflow so changesets can be tagged `npm`, `saas`, or `both`; the release pipeline routes them to the appropriate audience.
- Separate version axes: keep the npm semver for the published artifact; introduce a separate deploy-revision counter for SaaS-only events.
- Decouple at the trigger level: a "deploy current latest" workflow that re-runs Terraform / EB env updates without bumping the package version.

Discussion needed to pick a shape; investigation should examine how the current changesets + changelog generation flow interacts with the EB deploy step and what the minimum-change path looks like.

## Symptoms

(deferred to investigation)

## Workaround

(deferred to investigation)

## Impact Assessment

- **Who is affected**: (deferred to investigation)
- **Frequency**: (deferred to investigation)
- **Severity**: (deferred to investigation)
- **Analytics**: (deferred to investigation)

## Root Cause Analysis

### Investigation Tasks

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems
- [ ] Investigate root cause — audit current release.yml / deploy.yml workflows and how changesets drive npm + EB deploys
- [ ] Discuss decoupling shape with user (changelog stream split vs changeset typing vs separate deploy trigger)
- [ ] Create reproduction test / acceptance criteria for "deploy-only" path

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: (none)

## Related

(captured via /wr-itil:capture-problem; expand at next investigation)
