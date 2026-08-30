# Addressr-managed channel launch readiness

- **As at:** 2026-08-30 20:22 AEST
- **Source revision:** `0a49e82c9897227ecc2b474593a79792b3ad6e24`
- **Release candidate:** PR #534 at
  `f823f415e6703a07c10e937d58db3a674b98ed3b`
- **Activation decision:** Do not activate.

This is a point-in-time evidence ledger, not an activation control or an
approval. Provider settings are mutable and must be read back again immediately
before activation. It deliberately excludes credentials, provider identifiers,
confidential catalogue terms, subscriber data and traffic volumes.

## Evidence classes

- **SATISFIED:** current authoritative evidence proves the stated requirement.
- **PARTIAL:** useful evidence exists, but it does not prove the full production
  requirement.
- **MISSING:** the required evidence or implementation does not yet exist.
- **UNAVAILABLE:** the evidence source could not be accessed; this never means
  the requirement passed.

## Current production posture

| Requirement                                      | Class     | Evidence                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed access stays disabled                    | SATISFIED | `GET https://api.addressr.io/managed/config` returned HTTP 200 with `{"available":false,"plans":[]}`; `GET https://api.addressr.io/managed/account` returned HTTP 503 with `{"error":"managed_channel_not_active"}` from Sydney at 2026-08-30 20:22 AEST. |
| Release candidate is not represented as deployed | SATISFIED | PR #534 is open and mergeable. Its substantive checks and Terraform plan passed, but its release and deployment jobs were correctly skipped on the pull request. No exact-revision production claim is made.                                              |
| RapidAPI remains independently available         | PARTIAL   | Master run 33305602613 passed the live RapidAPI package integrations at the source revision. This proves the exercised integration, not every subscriber's unchanged commercial terms or all production traffic.                                          |

## Decision authority

| Requirement                                        | Class     | Evidence                                                                                                                                             |
| -------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dual-distribution and managed-channel architecture | SATISFIED | ADR-061 through ADR-074 each record `human-oversight: confirmed` dated 2026-08-28.                                                                   |
| Failed-payment access policy                       | SATISFIED | ADR-075, ADR-076, ADR-079, ADR-081, ADR-082 and ADR-083 each record `human-oversight: confirmed` dated 2026-08-28.                                   |
| Numeric gateway performance budgets                | SATISFIED | ADR-077, ADR-078 and ADR-080 each record `human-oversight: confirmed` dated 2026-08-28. The decisions exist; their confirmation measurements do not. |
| Administration and Stripe catalogue ownership      | SATISFIED | ADR-084 and ADR-085 record `human-oversight: confirmed` dated 2026-08-29 and 2026-08-30 respectively.                                                |

## Implementation and validation

| Requirement                                               | Class   | Evidence and remaining proof                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing Cloudflare Worker is the managed gateway         | PARTIAL | The Worker has default-closed managed routing and direct-origin handling. Behavioural tests cover exact activation, no customer-key fallback to the demo path, credential stripping, direct origin routing and fail-closed configuration. Production remains inactive, so the customer path is not production-proven.                                                                                        |
| D1 commercial state and organisation ownership            | PARTIAL | Terraform provisions the managed D1 database and the migration defines organisations, entitlements, API keys, checkout attempts, usage records, Stripe events and reconciliation records. Miniflare proves atomic quota and duplicate-request behaviour under a two-request race. Production schema, migration and organisation lifecycle have not been exercised through an authenticated customer journey. |
| Clerk identity and administrator boundary                 | PARTIAL | The Worker verifies Clerk sessions, requires an active organisation and restricts API-key and billing administration to organisation administrators. Behavioural tests cover absent organisation and member denial. Production sign-in, invitation, role change, member removal and session revocation remain unverified.                                                                                    |
| Organisation-scoped API keys                              | PARTIAL | Behavioural tests prove one-time key return, hash-only storage, organisation scoping, revocation boundaries and focus on the one-time copy instructions. Creation, use, revocation and replay have not been exercised against production D1.                                                                                                                                                                 |
| Stripe Checkout and Billing Portal                        | PARTIAL | Code and tests cover hosted checkout, one customer per organisation, concurrent checkout idempotency, return URLs and accessible success/cancel announcements. Test-mode success, cancellation, abandonment and portal return have not been run end to end with production configuration.                                                                                                                    |
| Signed Stripe webhook projection                          | PARTIAL | Signature, size, ownership, ordering and object-current convergence are behaviourally tested. The production webhook destination and signing secret have not been created, so live delivery, replay and rotation are unproven.                                                                                                                                                                               |
| Entitlement and failed-payment projection                 | PARTIAL | Behavioural tests cover allowed and denied subscription states, payment-failure non-revocation, paused collection, unsupported payment methods and object-current recovery. Stripe Test Clock evidence for recovery, terminal `unpaid`, restoration and out-of-order delivery is missing.                                                                                                                    |
| Quota reservation and accounting                          | PARTIAL | Tests cover quota exhaustion before origin, atomic concurrent reservation, duplicate request IDs, quota release for non-billable outcomes and fail-closed D1 errors. Twice-peak concurrency and production-period rollover remain unverified.                                                                                                                                                                |
| Stripe meter delivery and reconciliation                  | PARTIAL | Tests cover stable event identifiers, retry without identifier replacement, provider reconciliation states and repair of an older unreconciled window. Live Stripe meter ingestion, late delivery, duplicate delivery and provider reconciliation have not been exercised.                                                                                                                                   |
| Abuse throttling is separate from accounting              | PARTIAL | Behavioural tests prove throttling occurs before authentication and commercial accounting and fails closed when the limiter is unavailable. Production thresholds, isolation and overload behaviour are unverified.                                                                                                                                                                                          |
| Customer, demo and monitoring principals are isolated     | PARTIAL | Tests prove a supplied customer key never falls back to demo, demo stays on RapidAPI and monitoring uses its own IP credential and limiter. Separate live customer and monitoring principals and their usage classification are not verified.                                                                                                                                                                |
| Confidential RapidAPI catalogue parity                    | PARTIAL | A confidential parity source exists outside the repository, Terraform validates four governed plan keys, and PR #534's plan passed. The live Stripe catalogue has not been read back after release, and the public repository intentionally cannot prove confidential prices, allowances or grandfathered RapidAPI terms.                                                                                    |
| Stripe payment-recovery settings                          | PARTIAL | Authenticated provider readback on 2026-08-30 showed Addressr-scoped payment recovery using Smart Retries, eight attempts over two weeks and terminal `unpaid`. No automation run or Test Clock recovery has occurred. Re-read is required immediately before activation.                                                                                                                                    |
| Immediate-outcome payment methods and no collection pause | PARTIAL | Terraform and gateway activation preconditions require the chosen payment-method policy, and the gateway denies unsupported or paused states. Live Checkout configuration and a real subscription outcome are not yet verified.                                                                                                                                                                              |
| Accessible account and billing journeys                   | PARTIAL | Exact-revision CI built the site and passed built-output assertions plus scripted Chromium keyboard interactions. Browser tests cover fallback copy, checkout announcements, skip link, 320-pixel reflow and API-key instruction focus. Authenticated production screen-reader, keyboard, zoom/reflow and error-recovery passes remain missing.                                                              |
| Security validation                                       | PARTIAL | Tests cover secret stripping, webhook signature and size rejection, organisation boundaries, fail-closed state and credential-class separation. Production origin-secret enforcement, credential rotation, session revocation, webhook replay and an adversarial launch review remain unverified.                                                                                                            |
| Idempotency and concurrency                               | PARTIAL | Behavioural tests cover concurrent checkout idempotency, webhook ordering, stable meter IDs, D1 quota races and duplicate usage IDs. The required twice-confidential-peak test across Worker, D1 and Stripe has not run.                                                                                                                                                                                     |

## Activation gates still open

| Gate                                   | Class   | Evidence required before activation                                                                                                                                                                                                                                                 |
| -------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-077 customer-visible latency       | MISSING | Paired warm A/B runs from every required Australian/Oceania region, with valid non-empty responses, multiple replicates, p50/p95/p99, sample size, Worker revision and D1 location; added latency no greater than 25 ms p95 and 50 ms p99, total search no greater than 200 ms p95. |
| ADR-078 Worker compute                 | MISSING | Representative and twice-peak concurrency evidence with Worker CPU no greater than 10 ms p95, shared-isolate memory no greater than 64 MiB p99, no provider-limit outcome, and authenticated plan/limit readback.                                                                   |
| ADR-080 D1 envelope                    | MISSING | Accepted, invalid, revoked, exhausted and malformed outcomes at no more than three statements and 4 KiB response data, D1 metadata, indexed `EXPLAIN QUERY PLAN` results, twice-peak concurrency and fail-closed overload proof.                                                    |
| Production webhook                     | MISSING | Created destination, secret stored through the governed secret path, delivery verified, invalid and replayed event behaviour verified, and rotation/rollback rehearsed.                                                                                                             |
| Authenticated customer journeys        | MISSING | Production sign-in, organisation creation/invitation/removal, checkout success/cancel/abandon, portal, API-key create/use/revoke, quota exhaustion and recovery using isolated non-customer principals.                                                                             |
| Monitoring and alerting                | MISSING | Alerts for webhook failure, meter backlog/mismatch, D1 failure, entitlement projection drift, quota/accounting failure, origin failure and performance-budget breach, with an exercised operator response.                                                                          |
| Rollback                               | MISSING | Rehearsed disable-first rollback, prior Worker revision restoration, D1 forward/backward compatibility, secret rollback/rotation and proof RapidAPI remains unaffected.                                                                                                             |
| Exact-revision production verification | MISSING | Merge and release only after all preceding gates pass; record the deployed Worker and website revisions, Terraform apply result, provider readbacks and direct production observations for every activated component.                                                               |

## Current pipeline evidence

- Master source revision `0a49e82c9897227ecc2b474593a79792b3ad6e24`:
  run 33305602613 passed workspace packages, website build and browser checks,
  both OpenSearch matrices, engine-floor checks and the release-PR update. The
  dependency-age check failed in its documented advisory role.
- Release PR #534 at `f823f415e6703a07c10e937d58db3a674b98ed3b`:
  Terraform plan run 33306018463 passed; release checks run 33306018512 passed
  every substantive job, with only the documented advisory dependency-age
  check failing.
- A green plan proves the proposed infrastructure change is accepted by
  Terraform. It does not prove apply, provider state, activation or production
  behaviour.
