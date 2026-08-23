---
human-oversight: confirmed
oversight-date: 2026-08-23
status: proposed
job-id: evaluate-and-reach-first-working-call
persona: web-app-developer
date-created: 2026-08-23
secondary-personas:
  - self-hosted-operator
screens:
  - 'apps/website/src/pages/index.jsx — the landing page; the first surface anyone evaluating Addressr sees'
  - "apps/website/src/components/Search.js — the live demo. The only place a prospect can judge result quality and latency without writing code, and the production client of the worker's safeHosts allowlist (JTBD-200)"
  - 'apps/website/src/pages/quick-start.js — the path from convinced to a first call'
  - 'apps/website/src/pages/pricing.js — the tier-choice moment. Its Enterprise call-to-action is a mailto after ADR-053, so the buyer leaves the product surface here'
  - 'apps/website/src/pages/download.js — the self-hosting fork in the road; also a JTBD-202 screen, where it duplicates README.md'
  - 'apps/website/src/pages/api-docs.js — a 301 to the RapidAPI listing (ADR-017), so the API reference is off-surface by design'
---

# JTBD-004: Evaluate Addressr and reach a first working API call

> Created 2026-08-23 as a prerequisite of the `apps/website` import ([ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md), tracked by P120). The job is not new — this path has been served since 2019. It was invisible to this corpus only because the surfaces lived in another repository, which is exactly the drift the import exists to end.

## Job Statement

When I have an address-input problem and land on addressr.io, I want to satisfy myself that the data and the latency are good enough before I write any integration code, so I do not spend a day wiring up something I will then rip out.

When I have decided it works, I want the shortest path from that decision to a call returning real addresses, so the evaluation ends in a result rather than in a signup form.

## Desired Outcomes

- A prospect can judge result quality on their own addresses without an account, an API key, or any code.
- The quick-start's example call **works against the API this repository actually ships**. Co-location makes that testable for the first time; before the import, nothing could compare the two.
- The self-hosting route is discoverable from the same journey, rather than being a separate world a prospect has to already know about.
- Choosing a tier does not require contacting anyone, except at Enterprise where it deliberately does.

## Persona Constraints

- **Web/App Developer** (primary): arrives evaluating, not integrating. Integration cost matters and is being estimated during this job, not after it. Latency and result quality are judged on the live demo, against Google-Maps-set expectations. The tier-choice moment belongs here — see the 2026-08-23 amendment in [the persona](persona.md).
- **Self-Hosted Operator** (secondary): the same landing page is their entry point too, and the download page forks them out of the hosted journey into JTBD-202. They are secondary rather than primary because the evaluation question they are answering is "can I run this myself", which JTBD-202 owns once they leave.

## Current Solutions

- Google Maps Autocomplete — every prospect has already tried it; the demo is implicitly measured against it.
- Reading the OpenAPI spec cold — possible, but it answers "what endpoints exist", not "is the data good for my addresses".
- Signing up on RapidAPI first and evaluating after — inverts the order, and is the friction this job exists to remove.

## Confirmation

- The quick-start's example request and the API's actual contract are asserted against each other by something that runs, not compared by eye. **Nothing does this yet** — the import makes it possible; it does not deliver it.
- The live Search demo returns results on the addresses a prospect is likely to try. Currently unmeasured.
- `/api-docs` continues to redirect to the RapidAPI listing rather than 404ing. P122 records that the site's redirect machinery does not reach the built output, so this is served by Netlify UI configuration and is not reproducible from the repository.

## Reassessment Criteria

- **The Enterprise mailto proves to be a dead end for buyers.** ADR-053 accepts a conversion cost here; if enquiries drop measurably, a server-side form belongs in phase 2 and this job's pricing screen changes shape.
- **A procurement actor who never integrates turns out to be real.** Then the tier-choice moment is not a stage of `web-app-developer` and both this job and the persona need splitting.
- **The site ports off Gatsby.** Every screen path above changes; the job does not.
