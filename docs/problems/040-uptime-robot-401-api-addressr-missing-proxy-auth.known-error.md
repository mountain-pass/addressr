# Problem 040: Uptime Robot 401 alerts — Cloudflare Worker allowlist CIDR-match bug + UR IP drift

**Status**: Known Error
**Reported**: 2026-05-14
**Priority**: 10 (High) — Impact: Minor (2) x Likelihood: Almost certain (5)
**Effort**: S
**WSJF**: 20.0
**Type**: technical

## Description

Uptime Robot monitor on `https://api.addressr.io/addresses/GANSW718804790` records recurring `401 Unauthorized` "Resolved" incidents — roughly ten on 2026-05-14, each ~5 minutes. The user-visible product is healthy throughout. The original ticket hypothesised that ADR 024 (origin gateway auth header enforcement) was rejecting the probe; **that hypothesis is wrong**. Direct probes show the 401 comes from the Cloudflare Worker described in ADR 018, not from the Express origin's ADR 024 middleware:

| Probe                           | URL                                                                          | HTTP | Body                                                          |
| ------------------------------- | ---------------------------------------------------------------------------- | ---- | ------------------------------------------------------------- |
| Worker route via DNS            | `api.addressr.io/addresses/GANSW718804790`, no Referer                       | 401  | `no-origin not permitted from <ip>`                           |
| Worker route via workers.dev    | `cool-bush-ca66.addressr-key-provider.workers.dev/addresses/...`, no Referer | 401  | `no-origin not permitted from <ip>` (same body — same worker) |
| Worker route + accepted Referer | `api.addressr.io/addresses/...` with `Referer: https://addressr.io/`         | 200  | full HATEOAS address record                                   |
| Origin direct                   | `backend.addressr.io/addresses/...`, no header                               | 401  | `{"message":"Authentication required"}` (ADR 024)             |

Both `api.addressr.io` and `cool-bush-ca66.addressr-key-provider.workers.dev` route through the same worker (per ADR 018 line 30-37), so the workaround proposed in the original ticket — "repoint the monitor at the workers.dev URL" — does not change behaviour. The operator confirmed on 2026-05-14 that the alerts continued after the repoint.

## Root cause

Two compounding causes in the Cloudflare Worker's auth check:

**1. Logic bug — CIDR entries never match.** The worker's `safeIps` array contains four CIDR entries (`69.162.124.224/28`, `216.144.248.16/28`, `216.245.221.80/28`, `2607:ff68:107::0/121`). The auth check uses `safeIps.includes(srcIp)`, a strict string-equality test on an array. `CF-Connecting-IP` is always a single IP, never a CIDR string, so CIDR entries match nothing. Probes from IPs inside those ranges — e.g. `69.162.124.227`, `69.162.124.235`, `69.162.124.238`, `2607:ff68:107::14`, `2607:ff68:107::33-60` — get rejected even though the operator intended them to be allowed.

**2. Drift — UR's published IP list outpaces the worker's hardcoded list.** Diffing UR's current published IPs (`https://uptimerobot.com/inc/files/ips/IPv4.txt` and `.../IPv6.txt`) against the worker's `safeIps` on 2026-05-14:

- **48 IPv4 addresses** UR currently publishes are NOT in `safeIps`
- **80 IPv6 addresses** UR currently publishes are NOT in `safeIps`
- 31 IPv4 + 28 IPv6 entries in `safeIps` are stale (UR no longer publishes them)

The 5-minute "Resolved 401" pattern matches UR rotating probe locations — some probes hit IPs covered by the worker's exact-match entries (200), others hit IPs in the CIDR-only-and-thus-uncovered ranges or in the new-since-last-sync drift (401).

ADR 018 line 49 explicitly flagged "Uptime Robot IP allowlist must be manually maintained when Uptime Robot adds new IPs" as a known consequence; P040 is the realisation of that consequence plus the latent `.includes()` bug.

## Symptoms

- Uptime Robot dashboard shows recurring `401 Unauthorized` "Resolved" incidents on the `api.addressr.io/addresses/GANSW718804790` monitor, each ~5 minutes duration, multiple per day on 2026-05-14.
- The same pattern appears on the `cool-bush-ca66.addressr-key-provider.workers.dev/addresses/...` monitor — both URLs route through the same worker.
- Manual probing of the `addressr.io` search form during alert windows returns correct results — the user-visible product is healthy.
- 401 response body shape is `no-origin not permitted from <ip>` — distinct from the ADR 024 origin enforcement body `{"message":"Authentication required"}`.

## Workaround

**Configure the Uptime Robot monitor to send `Referer: https://addressr.io/` as a custom HTTP header.** The worker's `safeHosts` allowlist accepts that hostname (`addressr.io` is on the safelist per ADR 018 line 33), so the request bypasses the IP allowlist path entirely and is forwarded to RapidAPI → origin without consulting `safeIps`. Verified 200 in probe.

Caveats:

- Requires an Uptime Robot plan that supports custom HTTP request headers. Free-tier monitors may not. If your plan does not support custom headers, the only path is to fix the worker (option 2 in the fix plan below).
- This is a workaround, not a fix — the worker's logic bug + IP drift remain latent for any future use case that needs IP-based authorisation (e.g. a different gateway probe or a CI smoke test from an Uptime Robot IP).

## Impact Assessment

- **Who is affected**: Addressr Contributor/Maintainer (operator) persona — alert fatigue from a misconfigured monitor masks real outages, contradicting JTBD-400's "infra-boundary release steps are checkable artefacts, not memory" outcome. Customer-visible service is unaffected (JTBD-200 boundary is intact; the worker's over-rejection is the wrong-direction failure mode — too strict, not too permissive).
- **Frequency**: Multiple incidents per day (~10 visible on 2026-05-14).
- **Severity**: Impact 2 (Minor) — operator/maintainer tooling only, no end-user impact. Likelihood 5 (Almost certain) — currently happening continuously. Severity = 10 (High band).
- **Analytics**: Uptime Robot incident log (screenshot captured at /wr-itil:capture-problem time on 2026-05-14).

## Fix Strategy

Two-layer fix; operator chooses which layers to deploy:

**Option 2 — Worker code patch (immediate, requires Cloudflare dashboard edit).** Replace `safeIps.includes(srcIp)` with a CIDR-aware matcher that handles both IPv4 and IPv6 ranges plus single-IP exact matches. Re-sync the `safeIps` array from UR's currently published IPv4 + IPv6 files. The worker source is not in the repo (ADR 018 line 50 known limitation); the patch is produced as chat output from the P040 work session and pasted into the Cloudflare dashboard. The Referer-header workaround above remains useful as defence in depth.

**Option 4 — Version-control the worker via Terraform (follow-up — see P042).** Resolves ADR 018's known limitation (worker exists only in Cloudflare's platform) and ADR 018 Reassessment Criterion at line 63. The corrected worker source moves into the repo, the RapidAPI key moves into Cloudflare secrets via the Cloudflare Terraform provider, the deploy step joins the existing 1Password Voder → GH Actions → Terraform secret flow (per `reference_addressr_secrets`), and a proper CIDR-matcher unit test lands alongside (the TDD red/green that P040 itself could not host because the source was not yet in the repo). Tracked in **P042**.

This ticket transitions to Known Error on option 2 being scheduled and to Verification Pending after the operator pastes the patched worker and the alerts stop. P042 covers the structural follow-up.

## Investigation Tasks

- [x] Identify the actual rejection layer (worker vs origin) — confirmed worker per response body shape diff.
- [x] Diff UR's currently published IPs against the worker's `safeIps`.
- [x] Reproduce the rejection deterministically with curl.
- [x] Identify a working workaround (Referer header).
- [x] Produce the CIDR-aware worker patch.
- [ ] Operator pastes the patched worker into the Cloudflare dashboard.
- [ ] Confirm Uptime Robot alerts cease over a 24-hour observation window.
- [ ] Capture P042 — version-control the worker via Terraform (option 4).

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P042 (Terraform-managed worker — structural follow-up resolving ADR 018 line 50/63)

## Related

- **ADR 018** — Cloudflare Worker as API Key Proxy. The worker source described in this ADR is where the bug lives; ADR 018 line 49 anticipated the drift consequence, line 50 anticipated the "not version-controlled" consequence, and line 63 names "Version-controlling the worker script" as a Reassessment Criterion that P042 will close.
- **ADR 016** — Uptime Robot for External Availability Monitoring. The monitor target URL prescribed there is unchanged (still through the worker route — both URLs are equivalent), but the Confirmation section needs to require the Referer header until the worker is patched. Amendment landed alongside this ticket transition.
- **ADR 024** — Origin Gateway Auth Header Enforcement. NOT the cause of these 401s — included here to record the misattribution and prevent recurrence. ADR 024 rejects at `backend.addressr.io`, not at `api.addressr.io`. Response body shapes are diagnostic: `{"message":"Authentication required"}` is ADR 024; `no-origin not permitted from <ip>` is ADR 018.
- **JTBD-200** (Protect the chosen gateway boundary) — the worker IS the gateway boundary for the Mountain Pass deployment; the logic bug is a JTBD-200 defect of the "too strict, rejects intended traffic" kind (the opposite of the "too permissive, accepts bypass" failure mode that JTBD-200 primarily guards against, but a defect of the same job nonetheless).
- **JTBD-400** (Ship releases reliably from trunk) — alert fatigue is the realised cost of operator-memory infrastructure; P042 closes this for the worker.
- **BRIEFING.md** line 65 — was misattributing P040 to ADR 024; rewrite landed alongside this ticket transition.
- Uptime Robot IP publications: `https://uptimerobot.com/inc/files/ips/IPv4.txt`, `https://uptimerobot.com/inc/files/ips/IPv6.txt`, `https://uptimerobot.com/inc/files/ips/IPv4andIPv6.txt`.
