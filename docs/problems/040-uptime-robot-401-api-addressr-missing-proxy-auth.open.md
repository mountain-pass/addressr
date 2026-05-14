# Problem 040: Uptime Robot Monitor 401 on api.addressr.io — Missing Proxy-Auth Header

**Status**: Open
**Reported**: 2026-05-14
**Priority**: 3 (Medium) — Impact: 3 x Likelihood: 1 (deferred — re-rate at next /wr-itil:review-problems)
**Effort**: M (deferred — re-rate at next /wr-itil:review-problems)
**Type**: technical

## Description

The Uptime Robot health monitor was pointed at `https://api.addressr.io/addresses/GANSW718804790` and was reporting **recurring 401 Unauthorized incidents** — roughly ten resolved-401 events across 2026-05-14, each ~5 minutes long (see the "Latest incidents" screenshot in the capture: every row is a `401 Unauthorized` root cause). Every time the operator was paged, manual probing of the public `addressr.io` search form during the same window returned correct results — the user-visible service was healthy and the user could not see what was wrong.

**Likely root cause** (hypothesis, needs confirmation): the monitor was hitting the addressr origin directly without the ADR 024 proxy-auth header. ADR 024 mandates that direct requests to the origin (bypassing the RapidAPI gateway and the Cloudflare Worker that injects the auth header) receive `401 Unauthorized`. So the 401 responses were ADR 024 enforcement working correctly against a misconfigured probe, not a service defect. The website search form goes through the gateway / worker path that injects the header, which is why the user-visible product looked healthy.

**Immediate mitigation taken**: the operator has switched the Uptime Robot target back to `https://cool-bush-ca66.addressr-key-provider.workers.dev/addresses/GANSW718804790` — the Cloudflare Worker that injects the proxy-auth header before forwarding to the origin. Pending confirmation that the alerts stop.

## Symptoms

- Uptime Robot dashboard shows recurring `401 Unauthorized` "Resolved" incidents on the `api.addressr.io/addresses/GANSW718804790` monitor, each ~5 minutes duration, multiple per day on 2026-05-14.
- When the operator manually checks `addressr.io` during an alert window, the address search form works correctly — the user-visible product is healthy.
- The 401 pattern is consistent (every incident is 401) — not intermittent connection failure.

## Workaround

Repointed the Uptime Robot probe at the `cool-bush-ca66.addressr-key-provider.workers.dev/addresses/...` URL (the Cloudflare Worker that injects the ADR 024 proxy-auth header). Awaiting confirmation that this clears the alerts.

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer persona — alert fatigue from a misconfigured monitor masks real outages. Customer-visible service was unaffected throughout.
- **Frequency**: Multiple incidents per day at the original config (~10 over 2026-05-14 visible).
- **Severity**: (deferred to investigation — pending confirmation of the workers.dev fix and whether the operator wants monitor-coverage of the origin path too)
- **Analytics**: Uptime Robot incident log (screenshot captured at /wr-itil:capture-problem time)

## Root Cause Analysis

### Investigation Tasks

- [ ] Re-rate Priority and Effort at next /wr-itil:review-problems
- [ ] Confirm the workers.dev URL stops the 401 alerts (wait 24h, check dashboard)
- [ ] Decide whether the correct monitor posture is **Worker URL only** (treats the Worker as part of the served system, what customers actually see) or **origin + injected auth header** (treats the origin's behaviour as the SLO and exercises ADR 024 enforcement separately). The two answer different questions; both have legitimate use cases.
- [ ] Document the Uptime Robot target URL choice somewhere persistent (runbook / ADR amendment to ADR 024) so it does not get reverted in a future config change.
- [ ] If origin-direct monitoring is wanted, configure the Uptime Robot probe to send the `X-Proxy-Auth` (or whatever ADR 024 names the header) so it can hit `api.addressr.io` directly without 401.
- [ ] Decide whether the absence of an alert-on-the-Worker-path is itself a coverage gap — when the workers.dev path was _not_ probed, an outage at the Worker layer would have gone undetected.
- [ ] Create reproduction test — a curl against the origin without the proxy-auth header MUST return 401 (ADR 024 invariant); a curl through the Worker URL MUST return 200 for a known good ID.

## Dependencies

- **Blocks**: (none — alert noise, not a customer-facing defect)
- **Blocked by**: (none)
- **Composes with**: ADR 024 (origin gateway auth-header enforcement); the ADR's enforcement was working correctly here, the bug was in the probe configuration.

## Related

- **ADR 024** — origin gateway auth header enforcement. The 401s observed by Uptime Robot are exactly the behaviour ADR 024 mandates for unauthenticated origin requests.
- **P017** — RapidAPI root missing rels (closed). Different concern but same layer-attribution pattern: distinguish origin vs gateway vs worker vs CDN edge when diagnosing.
- **P023** — Cross-origin root not browser-cached. Related layer (Cloudflare Worker / CORS gateway pattern).
- Uptime Robot dashboard screenshot captured at /wr-itil:capture-problem time (2026-05-14) — all 10 visible incidents on the `api.addressr.io` monitor have root cause `401 Unauthorized`.

(captured via /wr-itil:capture-problem; expand at next investigation)
