# Problem 134: Nothing in the repo can see what Netlify is actually doing

**Status**: Open
**Reported**: 2026-08-24
**Priority**: 6 (Medium) — Impact: Moderate (3) × Likelihood: Unlikely (2). Impact 3: the unknown is whether a **second deployable copy of the production website** still exists. [ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) asserts as a Good consequence that "the duplicate source disappears immediately: one repository, one deploying copy, from the first commit", and that claim is currently undemonstrated. Likelihood 2: the existing site was repointed rather than replaced, so an orphan probably does not exist — but "probably" is the whole ticket.
**Origin**: internal
**Effort**: S — one visit to the Netlify dashboard settles both halves. The work is looking, not building.
**WSJF**: 6.0 — (6 × 1.0) / 1
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Two questions about the production website cannot be answered from this repository, and they are the same question wearing different hats: **what is Netlify actually configured to do?**

### 1. Is a Netlify site still attached to the archived repo?

`github.com/mountain-pass/addressr.mountain-pass.com.au` was archived 2026-08-24 (verified `isArchived: true` against the GitHub API). **Archiving does not touch Netlify.** It makes the repo read-only so push-triggered builds cannot fire, but a site connected to it keeps serving its last build indefinitely, and a manual "Retry deploy" in the Netlify UI still republishes it.

So if such a site exists, there is a second deployable copy of the website that no file in this repo can show you — and ADR-053's "one deploying copy" consequence is not demonstrated.

**What is known:** the existing site was repointed to the monorepo rather than a new one being created, and both `addressr.io` and `addressr.mountain-pass.com.au` serve the monorepo build (verified by content, three samples each). That makes an orphan unlikely. It does not make it checked.

### 2. ADR-053 criterion 9 has never been observed

Criterion 9 requires the `netlify.toml` ignore rule to be demonstrated working — a build that runs, a build correctly skipped, and a build that runs again, ordered so the negative sits between two positives. It needs deploy ids and timestamps. **Nothing in this repo records a deploy id**, and there is no evidence the observation was ever made.

It is filed here rather than left on the ADR because it is the same trip: whoever opens the Netlify dashboard for question 1 can read the deploy log for question 2 in the same visit.

## A third thing the same blindness hides

`apps/website/_redirects` carries the `addressr.mountain-pass.com.au` → `addressr.io` rules, and [P122](122-three-redirect-mechanisms-in-the-website-and-none-reach-the-built-site.md) records that this file **never reaches the built site**. Yet the domain does serve. So its actual redirect behaviour — or absence of it; it currently returns 200, not a 301 — is configured in the Netlify UI, invisible from here. Same class, same dashboard, worth checking while there.

## Investigation Tasks

- [ ] List Netlify sites and identify any whose repository is `addressr.mountain-pass.com.au`. If one exists, decide: delete it, or record why it is kept.
- [ ] While in the deploy log, capture the three observations ADR-053 criterion 9 needs, with deploy ids and timestamps, and annotate that criterion.
- [ ] Note what the old domain is actually configured to do — alias, or redirect. It returns 200 today, which means alias, and that contradicts the assumption in ADR-053 that it 301s.
- [ ] Record the findings somewhere durable. The recurring problem is that Netlify configuration is load-bearing and lives nowhere this repo can read; even a dated note in the ADR beats memory.

## Notes

Raised during the P125 work, initially as a vague hedge — "there might be an orphan site" — with no reasoning behind it. An architect review supplied the reasoning that makes it a real question: the specific ADR-053 consequence it puts in doubt, and the fact that archiving does not stop a Netlify site. Recording that provenance because the hedge was not worth a ticket and the argument is.

## Related

- [ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) — criterion 9 (unobserved), criterion 10 (met, with this as a named non-coverage), and the "one deploying copy" consequence this puts in doubt.
- [P122](122-three-redirect-mechanisms-in-the-website-and-none-reach-the-built-site.md) — the redirect mechanisms that never reach the build; the live behaviour must therefore be UI config.
