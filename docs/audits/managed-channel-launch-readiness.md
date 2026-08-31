# Addressr-managed channel launch readiness

- **As at:** 2026-08-31, after PR #538 reconciliation deployment
- **Worker source revision:** `ff2d26725d8d35b7261ef9a67e60d3b728a1ed10`
- **Migration and website revision:** `076a1c63094203761494460c53e325522b24e8d5`
- **Release:** PR #538 merged; run 33381558787 succeeded.
- **Activation decision:** Do not activate.

This is a point-in-time evidence ledger, not an activation control or an
approval. Provider settings are mutable and must be read back again immediately
before activation. It deliberately excludes credentials, provider account
identifiers, confidential provider resource identifiers, confidential catalogue
terms, subscriber data and traffic volumes.

## Evidence classes

- **SATISFIED:** current authoritative evidence proves the stated requirement.
- **PARTIAL:** useful evidence exists, but it does not prove the full production
  requirement.
- **MISSING:** the required evidence or implementation does not yet exist.
- **UNAVAILABLE:** the evidence source could not be accessed; this never means
  the requirement passed.

## Current production posture

| Requirement                                                | Class     | Evidence                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed access stays disabled                              | SATISFIED | `GET https://api.addressr.io/managed/config` returned HTTP 200 with `{"available":false,"plans":[]}`; `GET https://api.addressr.io/managed/account` returned HTTP 503 with `{"error":"managed_channel_not_active"}` from Sydney after the 2026-08-31 release. A supplied customer key also remained closed despite a valid demo Referer; an ordinary demo request returned non-empty results. |
| Disabled deployment is verified separately from activation | SATISFIED | Release run 33381558787 updated only the Worker and passed production smoke checks. No database migration was pending; the prior website revision remains live. Customer access remains disabled, and seven direct probes passed. This is not completed customer-channel verification.                                                                                                        |
| RapidAPI remains independently available                   | PARTIAL   | Master run 33305602613 passed the live RapidAPI package integrations at the source revision. This proves the exercised integration, not every subscriber's unchanged commercial terms or all production traffic.                                                                                                                                                                              |

## Decision authority

| Requirement                                        | Class     | Evidence                                                                                                                                             |
| -------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dual-distribution and managed-channel architecture | SATISFIED | ADR-061 through ADR-074 each record `human-oversight: confirmed` dated 2026-08-28.                                                                   |
| Failed-payment access policy                       | SATISFIED | ADR-075, ADR-076, ADR-079, ADR-081, ADR-082 and ADR-083 each record `human-oversight: confirmed` dated 2026-08-28.                                   |
| Numeric gateway performance budgets                | SATISFIED | ADR-077, ADR-078 and ADR-080 each record `human-oversight: confirmed` dated 2026-08-28. The decisions exist; their confirmation measurements do not. |
| Administration and Stripe catalogue ownership      | SATISFIED | ADR-084 and ADR-085 record `human-oversight: confirmed` dated 2026-08-29 and 2026-08-30 respectively.                                                |

## Implementation and validation

| Requirement                                               | Class   | Evidence and remaining proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing Cloudflare Worker is the managed gateway         | PARTIAL | The Worker has default-closed managed routing and direct-origin handling. Behavioural tests cover exact activation, no customer-key fallback to the demo path, credential stripping, direct origin routing and fail-closed configuration. Production remains inactive, so the customer path is not production-proven.                                                                                                                                                                                                                                                                                                                                                |
| Launch measurement apparatus                              | PARTIAL | Revision `088a7ebd7d0f7fcdc9c9220514c8f6ec357043f2` added an explicit-target paired latency and Worker compute probe. It requires at least 100 samples and two replicates, correlates every candidate request with transient real-time-tail evidence and fails closed on incomplete evidence. No qualifying paired production run has been completed.                                                                                                                                                                                                                                                                                                                |
| D1 commercial state and organisation ownership            | PARTIAL | Terraform provisions the managed D1 database and the migration defines organisations, entitlements, API keys, checkout attempts, usage records, Stripe events and reconciliation records. Migrated Miniflare tests prove atomic quota and duplicate-request behaviour under a two-request race, required statement counts and indexed query plans. Authenticated Cloudflare readback confirms the production binding, applied migration, Oceania location and disabled read replication. The authenticated customer journey remains unverified.                                                                                                                      |
| Clerk identity and administrator boundary                 | PARTIAL | The Worker verifies Clerk sessions, requires an active organisation and restricts API-key and billing administration to organisation administrators. Behavioural tests cover absent organisation and member denial. Production sign-in, invitation, role change, member removal and session revocation remain unverified.                                                                                                                                                                                                                                                                                                                                            |
| Organisation-scoped API keys                              | PARTIAL | Behavioural tests prove one-time key return, hash-only storage, organisation scoping, revocation boundaries and focus on the one-time copy instructions. Creation, use, revocation and replay have not been exercised against production D1.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Stripe Checkout and Billing Portal                        | PARTIAL | Code and tests cover hosted checkout, one customer per organisation, concurrent checkout idempotency, return URLs and accessible success/cancel announcements. Test-mode success, cancellation, abandonment and portal return have not been run end to end with production configuration.                                                                                                                                                                                                                                                                                                                                                                            |
| Signed Stripe webhook projection                          | PARTIAL | Signature, size, ownership, ordering and object-current convergence are behaviourally tested. The Terraform-owned live destination and signing secret are deployed. A restricted runtime credential permits subscription reads only. Unsigned production delivery returned 400 invalid_webhook_signature. The same correctly signed foreign-integration event delivered at 15:02:59 and 15:08:58 AEST returned 200 with received=true and ignored=true; D1 checks before and after showed no organisation, entitlement, key, usage or event records. This proves signature handling and foreign-event isolation, not Addressr projection, deduplication or rotation. |
| Entitlement and failed-payment projection                 | PARTIAL | Behavioural tests cover allowed and denied subscription states, payment-failure non-revocation, paused collection, unsupported payment methods and object-current recovery. Migrated D1 tests additionally prove repeated and concurrent reconciliation repairs policy without resetting same-period usage or crossing ownership boundaries. Stripe Test Clock evidence for recovery, terminal `unpaid`, restoration and out-of-order delivery is missing.                                                                                                                                                                                                           |
| Quota reservation and accounting                          | PARTIAL | Tests cover quota exhaustion before origin, atomic concurrent reservation, duplicate request IDs, quota release for non-billable outcomes and fail-closed D1 errors. Twice-peak concurrency and production-period rollover remain unverified.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Stripe meter delivery and reconciliation                  | PARTIAL | Tests cover stable event identifiers, retry without identifier replacement, provider reconciliation states and repair of an older unreconciled window. Live Stripe meter ingestion, late delivery, duplicate delivery and provider reconciliation have not been exercised.                                                                                                                                                                                                                                                                                                                                                                                           |
| Abuse throttling is separate from accounting              | PARTIAL | Behavioural tests prove throttling occurs before authentication and commercial accounting and fails closed when the limiter is unavailable. Production thresholds, isolation and overload behaviour are unverified.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Customer, demo and monitoring principals are isolated     | PARTIAL | Tests prove a supplied customer key never falls back to demo, demo stays on RapidAPI and monitoring uses its own IP credential and limiter. Separate live customer and monitoring principals and their usage classification are not verified.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Confidential RapidAPI catalogue parity                    | PARTIAL | A partial authenticated RapidAPI readback is saved privately in 1Password. All four archived Stripe price details were read; base and request charges match the current public-plan figures, including paid allowances and overage. Explicit hard/soft quota policy is deployed. Historical plan versions, currency agreement, reset timing and billable-outcome parity remain unverified. No product was activated or charge authorized.                                                                                                                                                                                                                            |
| Stripe payment-recovery settings                          | PARTIAL | Authenticated provider readback on 2026-08-30 showed Addressr-scoped payment recovery using Smart Retries, eight attempts over two weeks and terminal `unpaid`. No automation run or Test Clock recovery has occurred. Re-read is required immediately before activation.                                                                                                                                                                                                                                                                                                                                                                                            |
| Immediate-outcome payment methods and no collection pause | PARTIAL | Terraform and gateway activation preconditions require the chosen payment-method policy, and the gateway denies unsupported or paused states. Live Checkout configuration and a real subscription outcome are not yet verified.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Accessible account and billing journeys                   | PARTIAL | Exact-revision CI built the site and passed built-output assertions plus scripted Chromium keyboard interactions. Browser tests cover fallback copy, checkout announcements, skip link, 320-pixel reflow and API-key instruction focus. Authenticated production screen-reader, keyboard, zoom/reflow and error-recovery passes remain missing.                                                                                                                                                                                                                                                                                                                      |
| Security validation                                       | PARTIAL | Tests cover secret stripping, webhook signature and size rejection, organisation boundaries, fail-closed state and credential-class separation. Production origin-secret enforcement, credential rotation, session revocation, webhook replay and an adversarial launch review remain unverified.                                                                                                                                                                                                                                                                                                                                                                    |
| Idempotency and concurrency                               | PARTIAL | Behavioural tests cover concurrent checkout idempotency, webhook ordering, stable meter IDs, D1 quota races and duplicate usage IDs. The required twice-confidential-peak test across Worker, D1 and Stripe has not run.                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Activation gates still open

| Gate                                   | Class   | Evidence required before activation                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-077 customer-visible latency       | PARTIAL | The paired probe apparatus exists. A single inactive synthetic `/managed/config` control-path request confirmed the transient evidence source, but is not managed-request performance evidence. Paired warm A/B runs from every required Australian/Oceania region, with valid non-empty responses, multiple replicates and all numeric budgets, remain missing. |
| ADR-078 Worker compute                 | PARTIAL | For that single inactive control-path request, Cloudflare reported CPU 0 ms, wall time 1 ms, outcome `ok`, colo `SYD` and Worker version `d5c3d12d-f7f3-4760-a609-8661183695b5`. Persistent logs and traces were disabled. Representative and twice-peak concurrency, memory p99, overload evidence and authenticated plan/CPU-limit readback remain missing.    |
| ADR-080 D1 envelope                    | PARTIAL | Migrated Miniflare tests cover required outcome statement counts and indexed query plans. Provider D1 metadata, response bytes, twice-peak concurrency and fail-closed overload proof remain missing.                                                                                                                                                            |
| Production webhook                     | PARTIAL | Destination, signing secret and restricted runtime credential are deployed; invalid-signature rejection and repeated signed foreign-event isolation are verified. Addressr-owned projection/replay and rotation/rollback still need production evidence.                                                                                                         |
| Authenticated customer journeys        | MISSING | Production sign-in, organisation creation/invitation/removal, checkout success/cancel/abandon, portal, API-key create/use/revoke, quota exhaustion and recovery using isolated non-customer principals.                                                                                                                                                          |
| Monitoring and alerting                | MISSING | Alerts for webhook failure, meter backlog/mismatch, D1 failure, entitlement projection drift, quota/accounting failure, origin failure and performance-budget breach, with an exercised operator response.                                                                                                                                                       |
| Rollback                               | MISSING | Rehearsed disable-first rollback, prior Worker revision restoration, D1 forward/backward compatibility, secret rollback/rotation and proof RapidAPI remains unaffected.                                                                                                                                                                                          |
| Exact-revision production verification | MISSING | Merge and release only after all preceding gates pass; record the deployed Worker and website revisions, Terraform apply result, provider readbacks and direct production observations for every activated component.                                                                                                                                            |

## Restricted verification preparation

The default-closed organisation restriction is deployed. It admits only
explicit Clerk organisation identifiers from protected deployment configuration,
after session or API-key verification. Empty or invalid configuration denies all.
Account rejection occurs before organisation insertion; customer rejection occurs
before reservation and origin forwarding. Existing entitlement and quota checks
remain mandatory, and signed webhook handling is unchanged.

This change does not enable managed access, activate a product or authorize a
charge. Restricted operator verification and public availability are separate
stages. Positive production billing tests still require genuine approved terms,
financial authorization and the normal release risk assessment. Simulated billing
state belongs outside production; no direct entitlement inserts are permitted.
Public opening requires its own explicit review, not an empty allowlist.

## Current pipeline evidence

- Reconciliation revision `ff2d26725d8d35b7261ef9a67e60d3b728a1ed10`:
  release run 33381558787 completed successfully. Terraform reported zero
  additions, one Worker change and zero destructions at 2026-08-31 10:25:11 UTC;
  no database migration was pending. Refreshed Cloudflare readback identified
  Worker version `29d17c09`, with managed access disabled and no managed origins.
  The website was not redeployed and its live `revision.txt` still returned
  `076a1c63094203761494460c53e325522b24e8d5`.
  Seven direct production probes passed: unavailable managed configuration,
  closed account access, customer-key rejection despite a demo Referer,
  invalid-signature rejection, non-empty demo retrieval, direct-origin denial
  and the unchanged website revision. Authenticated D1 readback confirmed both
  migration ledger entries remain applied. These checks do not prove live
  customer reconciliation or billing.

  The commit's normal test gate passed all 736 tests. Focused Stripe and migrated
  D1 tests passed all 21 cases, including concurrent repeated reconciliation,
  policy repair without resetting current-period usage, ownership rejection
  and a single ledger row for the repeated reconciliation identifier. Signed
  webhook replay handling remains unchanged.

  The public UptimeRobot page reported the existing monitor operational after
  deployment. Its public view does not expose the configured target or prove
  principal routing, managed-channel alert coverage or operator response.

- Recovery revision `076a1c63094203761494460c53e325522b24e8d5`:
  release run 33368539742 completed successfully. Terraform reported no resource
  changes; D1 applied `0002-quota-policy.sql` at 2026-08-31 07:35:22 UTC.
  Authenticated schema readback confirmed `hard_limit`, the expected reservation
  and refund triggers, and no intermediate `entitlements_next` table. The live
  website's `revision.txt` returned this exact revision after deployment.
  Direct production probes confirmed closed managed paths, invalid-signature
  rejection, working demo retrieval and rejection of unauthenticated
  direct-origin requests. These observations do not prove authenticated quota
  or billing behaviour.

- Worker source revision `166892c1baff45cf411c4e83b8e76ac8f5a2d855`:
  release run 33365620209 updated the Worker before its migration failed; website
  deployment was skipped. Refreshed Cloudflare readback after recovery shows
  Worker version `014f677e` serving all traffic. The recovery changed the SQL
  comment that prevented remote parsing, applied the pending migration and
  delivered the website; it did not deploy another Worker version.

- Deployed restriction revision `0627aad0c1ae918f4b9e7f75f65e364f66fbdb82`:
  release run 33361540686 applied one Worker update with no additions or
  destructions at 2026-08-31 05:52 UTC. No database migration was pending.
  All substantive jobs and production smoke checks passed. Cloudflare readback
  confirmed the new Terraform deployment serving all traffic. Direct probes
  confirmed unavailable managed configuration, closed account/customer paths,
  invalid-signature rejection, a non-empty demo response and direct-origin denial.
  The website was not changed by this deployment-only release.

- Deployed revision `047d2c43d8e87cb9da59087814b28aa26fabbf8f`: plan run
  33357885621 reported only the existing Worker update. Release run 33348202545
  attempt 3 completed with zero additions, one change and zero removals; database
  migration and API/website smoke checks passed. The earlier candidate evidence
  below remains historical.

- Master source revision `572d6f2485b6268b261526393e441efb85ed0b96`:
  run 33311149136 passed workspace packages, website build and browser checks,
  both OpenSearch matrices, engine-floor checks and the release-PR update. The
  dependency-age check failed in its documented advisory role.
- Release PR #534 at `edf964a982218caee56a274813e85d3e8d98ca65`:
  run 33311448675 passed every substantive release check, with release and
  deployment correctly skipped on the pull request; run 33311448567 passed the
  Terraform plan-only gate. The dependency-age check failed in its documented
  advisory role.
- A green plan proves the proposed infrastructure change is accepted by
  Terraform. It does not prove apply, provider state, activation or production
  behaviour.

## Deployed quota policy; customer behaviour still under verification

Authenticated RapidAPI readback found that included allowances and hard access
limits are not interchangeable: the catalogue contains hard-cap, pay-per-use
and included-plus-overage policies. A partial readback is saved privately in
1Password; historical versions, exact reset anchors, currency and deployed Stripe
price parity still require verification. No commercial figures are stored here.

The deployed implementation adds explicit quota policy to the existing
entitlement and reservation path. The migration is applied in production and
preserves existing rows as hard-limited. Behavioural tests cover counting and
metering beyond soft allowances and rejecting missing policy. The live schema
readback does not prove authenticated accounting, period rollover or paid usage.
Rollback must disable managed access first and retain the migrated schema and
usage history; do not reverse the migration to restore a prior Worker.

An executable local compatibility probe exercised reconstructed prior and
current Worker code against migrated synthetic D1 state. It covered hard-limit
reservation, settlement and refund, preservation of soft-policy usage while
customer routing is disabled, and current reconciliation repairing the prior
projection without resetting that usage. This is local compatibility evidence,
not a deployed-artifact rollback or production data-preservation rehearsal.
Disabling customer routing does not stop signed webhooks or scheduled
reconciliation. A live rollback must account for those writers and use the
governed release pipeline; production rollback and secret rotation remain open.
