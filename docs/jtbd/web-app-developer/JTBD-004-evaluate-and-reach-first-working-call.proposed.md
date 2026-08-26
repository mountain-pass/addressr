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
  - 'apps/website/src/pages/index.jsx — the landing page and live React autocomplete demo. It exposes address, locality, postcode and state examples and is the first surface anyone evaluating Addressr sees.'
  - 'apps/website/src/pages/quick-start.js — the path from convinced to a first call'
  - 'apps/website/src/pages/pricing.js — the tier-choice moment. Its Enterprise call-to-action is a mailto after ADR-053, so the buyer leaves the product surface here'
  - 'apps/website/src/pages/download.js — the self-hosting fork in the road; also a JTBD-202 screen, where it duplicates README.md'
  - "apps/website/src/pages/api-docs.js — the API reference, and it is very much ON-surface. CORRECTED 2026-08-23: this entry originally said it was a 301 to the RapidAPI listing, read off the root _redirects file, which is one of the three mechanisms P122 records as never reaching the built output. Production returns 200 and serves a Gatsby Swagger UI page rendering the bundled src/swagger.yaml, on this job's critical path."
  - 'apps/website/src/swagger.yaml — a THIRD copy of the API contract, beside lib/api/swagger.yaml and lib/api/swagger-2.yaml, with nothing reconciling them. Already drifted: address.number.last.number is type string here and type integer in lib/api/swagger-2.yaml, so a developer modelling that field from the published reference gets the wrong type. That is Desired Outcome 2 verbatim, except the outcome names the quick-start prose and misses the spec, which is the larger fork. Same class as the JTBD-202 download-page duplication, bigger blast radius.'
  - "apps/website/test/rendered-output.test.mjs — the built-output tier, and the only surface that can see this job's head-element criteria at all. ADDED 2026-08-24, correcting an asymmetry that arrived with the ADR-053 import: the file has carried an `@jtbd JTBD-004` annotation since it was written, and JTBD-401's screens list records it, but this job's did not. It asserts what Gatsby EMITS, which is the only place a missing `<title>` is visible — five of six pages declare one in source and none of them reaches the document. Membership is by annotation. Scoped: the credential-scanning assertions in the same file are JTBD-401's and are not this job."
  - "apps/website/src/pages/404.tsx — the failure surface of this journey, not a job of its own. ADDED 2026-08-23 on the ADR-053 import, which deliberately routes traffic here: /enterprise-price-request/ served 200 from 2019 until this commit and was the target of the pricing page's Enterprise call-to-action, so a buyer on a stale link, bookmark or search result now lands here instead of on the form. ADR-053 accepted that over a redirect because all three of the site's redirect mechanisms fail to reach the built output (P122), and repairing them mid-import would change live redirect behaviour during a move whose premise is changing none. The page offers no route back into the journey, which makes it a dead end for exactly the visitor this job converts. /callback/ also becomes a 404 but belongs to no job and is not a reason for this entry."
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
- `/api-docs/` continues to serve the API reference. CORRECTED 2026-08-23: this criterion originally asserted a redirect to RapidAPI; production returns 200 and renders the bundled Swagger UI. The page's own runtime is worth one look — `api-docs.js:5` has its `swagger-ui` import commented out while `:10` calls `window.SwaggerUI`.
- **The three copies of the API contract agree.** NOT MET, and newly visible: `apps/website/src/swagger.yaml` already disagrees with `lib/api/swagger-2.yaml` on at least one field type.
- **Every page has a `<title>`, and no two pages share one.** **NOT MET** — verified on production 2026-08-23. **Count corrected 2026-08-24: SIX pages, not five.** The original figure omitted `404.tsx`, which is a screen of this job and the one the argument below actually rests on. Every one of the six ships with no `<title>` element at all (P125, WCAG 2.4.2, Level A). Recorded here rather than left to the ticket because it lands on this job specifically: the `404.tsx` entry above rests on a visitor arriving "on a stale link, bookmark or search result", and an untitled page degrades exactly those two re-entry routes. A reader checking whether the evaluation journey is served would not find that connection from the ticket alone. Presence alone does not discharge this — 2.4.2 asks the title to describe topic or purpose, so six identical titles would satisfy a presence check and fail the criterion. Distinctness is the half that carries it.
- **Every page declares a language on `<html>`.** **NOT MET** — WCAG 3.1.1 Language of Page, also Level A, also every page. Added 2026-08-24. It sat undocumented while its sibling criterion above was recorded, which is the asymmetry worth avoiding: `lang` was never set by anything, so unlike the `<title>` case there is no half-built mechanism to find. A screen reader with a non-English default mispronounces the whole page.

## Reassessment Criteria

- **The Enterprise mailto proves to be a dead end for buyers.** ADR-053 accepts a conversion cost here; if enquiries drop measurably, a server-side form belongs in phase 2 and this job's pricing screen changes shape.
- **A procurement actor who never integrates turns out to be real.** Then the tier-choice moment is not a stage of `web-app-developer` and both this job and the persona need splitting.
- **The site ports off Gatsby.** Every screen path above changes; the job does not.
