---
status: proposed
job-id: create-and-access-managed-hosted-api-account
persona: web-app-developer
date-created: 2026-08-29
human-oversight: confirmed
oversight-date: 2026-08-29
screens:
  - "docs/decisions/090-usage-records-store-a-closed-set-route-not-the-request-path.proposed.md — what a usage record may retain about a customer's requests. Added 2026-09-06 and NOT yet ratified. Pointed at from here because this job owns the migration defining that column, and because the decision names a gap this job does not fill: no documented job carried a customer expectation about what the service records about them. CORRECTED 2026-09-19, a factual repoint and not a change to this job: that job now exists as JTBD-006 (See what my API key was used for), which is UNRATIFIED. Start there rather than here."
  - 'test/js/__tests__/managed-app-url-validation-pinned.test.mjs — pins both Terraform validations that guard the browser-origin allowlist named in the gateway entry below. TWO, not one — and they differ by CALLER, not by consequence. An earlier version of this entry split them by consequence, giving the Stripe return URLs to the root site alone. That is false: the module renders BOTH bindings from the one variable, the allowlist and the URL the Stripe return links are built from, so each site guards the same two consequences. What differs is reach. The root site catches the value as entered, covering any other root consumer; the module site catches any caller that renders the bindings, including a second or direct one. It asserts both, because the duplication is load-bearing — a mismatch between them shows up as one refusing a value the other accepted, and a test scoped to one site would let the other be deleted green. CREATED IN THE SAME CHANGE AS THIS ENTRY. An intermediate draft wrote this in the future tense, because the file did not exist when the entry was first added and a present-tense pointer to an absent artefact sends a reader to nothing. That tense would have gone stale the instant the commit landed, and stale in the misleading direction: a reader would take the guard to be unprotected and could write the test a second time. Nothing in this repository asserts that a screens path resolves, so the tense is the only signal available and it has to be right at rest rather than right in transit. Listed here although the release job owns the tier, because a reader arriving from THIS job to change the allowlist would otherwise be unable to find the test protecting both of its guards — the one-file-two-jobs shape that left the gateway file named by neither. It carries both annotations. It is a TEXT assertion, deliberately: the behavioural instrument would be a Terraform test file, one was written and withdrawn because nothing in this repository runs `terraform test`, and a test that does not run is worse than a text assertion that does because it also claims to be the stronger thing.'
  - 'apps/website/src/pages/account.jsx — sign-in, organisation selection, billing and API-key management'
  - "apps/addressr-deployment/cloudflare-worker/managed-account.mjs — session, role and organisation authorization, AND the browser-origin allowlist, which this entry did not name until 2026-09-19 and which is not any of the three. Amended in place as a factual correction, inheriting this job's ratification; no outcome changes. The allowlist gates FIVE things, and only the last is the one a browser-enforcement argument covers: the pre-authentication 403 on EVERY managed route except the Stripe webhook — not only the mutating ones, which an earlier version of this entry said and which understated its reach — the configuration-availability report, a 503 `identity_not_configured` on a live authenticated request, Clerk's `authorizedParties`, and the CORS response header. The webhook is the one managed route it does NOT gate, named because an enumeration of what a thing gates is incomplete without it. The deployed list is not hand-maintained — it is `jsonencode([var.managed_app_url])`, so one Terraform variable is its sole source. That variable carries a `^https://` validation at TWO sites, differing by CALLER rather than by consequence: the module boundary, which renders BOTH the allowlist and the URL the Stripe return links are built from, and the root caller, which catches the value as entered. Each guards the same two consequences. An earlier version of this sentence said it was the only guard, singular, which the same change that added the second site made false. Recorded here because a reader arriving from this job to change authorization would not otherwise learn that the same function decides boundary admission. The sibling gateway job routes Worker auth behaviour away from itself to the self-hosted-operator boundary job, which lists a DIFFERENT allowlist in a different file for a different persona — so this file sat between two jobs and was named by neither."
  - 'apps/addressr-deployment/cloudflare-worker/stripe-channel.mjs — Checkout, Portal and webhook projection'
  - "apps/addressr-deployment/cloudflare-worker/migrations/** — organisation-owned commercial state. Broadened from 0001 alone on 2026-09-06, inheriting this job's ratification: 0002 added the quota policy and 0003 moved the point at which a request is charged, and until now neither was mapped to any job, so the file deciding when a customer's allowance is consumed was owned by nobody. This job governs WHO OWNS a usage row. Two things it does NOT govern, named here rather than forward-referenced: what a usage row may CONTAIN about the request it bills, which the closed-set-route decision owns and which recorded that no job carried a customer expectation about what the service retains about them, a gap JTBD-006 now fills though it is not yet ratified; and what happens when the allowance RUNS OUT — no documented job covers a customer capping spend, or being refused for commercial reasons, even though a hard limit is a shipped, customer-visible property. An earlier version of this entry said both gaps were named below and no section below named them. EVERY FILE IN THIS DIRECTORY CARRIES AN OBLIGATION recorded 2026-09-06: releases deploy the Worker BEFORE applying migrations, so a migration must be forward-compatible with the Worker already live, and a change coupling schema to code takes two releases with the schema first. Stated here because a migration author arrives from this job, not from the release job."
  - 'apps/addressr-deployment/main.tf — Clerk production DNS and managed-channel deployment configuration'
---

# JTBD-005: Create and access a managed hosted API account

## Job Statement

When I have selected Addressr's managed hosted API, I want to create and access an organisation-owned account, subscribe and obtain an API key, so I can make authenticated production calls without involving support.

## Desired Outcomes

- Email and Google sign-in, verification, recovery and session expiry are accessible at `app.addressr.io`.
- A customer selects or creates an active organisation before billing or API-key actions.
- One organisation owns its membership, Stripe customer and subscription, entitlement, API keys and usage.
- `org:admin` alone manages membership, Checkout, the Customer Portal and API keys; `org:member` can view and use authorised organisation resources without mutating commercial state.
- Checkout returns to the same organisation and remains pending until a verified Stripe webhook projects entitlement.
- After entitlement exists, an authorised administrator can create an API key whose plaintext is shown once.
- Session expiry, recovery and member removal do not delete organisation-owned commercial resources.

## Persona Constraints

- The Web/App Developer has already evaluated Addressr and selected a tier; account setup must lead to usable credentials without a support hand-off.
- Integration cost matters, so identity, billing and key status must be explicit and recoverable.
- A developer may belong to multiple organisations without leaking keys, usage or billing state between them.

## Current Solutions

- Subscribe through RapidAPI, which remains an independent supported channel.
- Contact Addressr for manually provisioned access.
- Self-host Addressr and operate a separate identity, billing and gateway stack.

## Confirmation

1. Keyboard and screen-reader browser journeys cover sign-in, verification, recovery, organisation selection, Checkout return and API-key creation.
2. An active organisation is required before any commercial action.
3. Members receive HTTP 403 for membership, billing and API-key mutations; administrators can complete them for their organisation.
4. Checkout completion alone grants no access before a valid signed webhook projects entitlement.
5. API-key plaintext appears in exactly one successful creation response and only its hash persists.
6. Cross-organisation membership, billing, key and usage access fails for both roles.
7. Removing a member or expiring a session preserves organisation-owned resources.

## Reassessment Criteria

- Customers need delegated API-key administration without billing or membership authority.
- A procurement actor who never integrates becomes a distinct primary buyer.
- Clerk cannot meet the required accessibility, recovery, organisation or portability outcomes.
