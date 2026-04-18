# Problem 024: `wr-architect:agent` misses per-request performance / load implications on high-traffic endpoints

**Status**: Open
**Reported**: 2026-04-18
**Priority**: 8 (Medium) — Impact: Minor (2) x Likelihood: Likely (4)

## Description

`wr-architect:agent` reviews proposed changes against existing decisions in `docs/decisions/` and flags ADR conflicts. Its review scope today is ADR-driven — it checks whether a change violates an accepted decision, whether a new decision is warranted, and whether the file placement / testing conventions are right. What it does NOT systematically check is the **per-request performance and load implications** of runtime-path changes on high-traffic endpoints.

On 2026-04-18, the architect recommended `cache-control: no-cache` for the root `/` endpoint as the P018 fix, reasoning "load is negligible — the response is `{}` body, and CPU cost per revalidation is microseconds even at RapidAPI's full traffic." The user rejected immediately: every client page load fetches the root for HATEOAS discovery, so `no-cache` would cost an origin round-trip per page-load across the entire paid + free-tier consumer base. The qualitative "load is negligible" claim ignored the request-frequency multiplier.

Without the user's intervention, the fix would have shipped and degraded live-service performance.

## Symptoms

- Architect approves changes with per-request cost implications on consumer-facing paths without flagging them.
- "Load is negligible" is a recurring qualitative claim in architect reviews; no quantitative check against traffic profile.
- User becomes the effective safety net for architect misses on performance trade-offs.
- Pattern is visible in the 2026-04-18 P018 workflow — architect PASS, user rejects with "load increase would be bad, request time every time a client connects would be expensive".

## Workaround

- User manually overrides architect recommendations when they involve runtime-path changes on high-traffic endpoints.
- Author (me) now holds a memory (`feedback_ask_before_ops_tradeoffs.md`) to prompt AskUserQuestion before accepting "load is negligible" claims for revenue-path endpoints. That's a per-session wrapper, not a systemic fix.

## Impact Assessment

- **Who is affected**: Addressr maintainer (the human safety net); indirectly all paid + free-tier RapidAPI consumers if a bad change ships because the architect approved and the user didn't catch it. Persona: Addressr Contributor / Maintainer (J7 — release integrity, trust in governance tooling).
- **Frequency**: Every architect review of a runtime-path change where performance is a non-obvious consideration. The P018 incident is the first confirmed occurrence in addressr; month-wide usage-data report (2026-03-17 → 2026-04-16) also flagged "shipping prematurely" as a recurring Claude pattern.
- **Severity**: Minor — no user-visible defect has shipped as a result yet (the user caught P018 before push). But the pattern means the governance tooling has a known blind spot for per-request cost trade-offs.
- **Analytics**: N/A — evidence from the P018 session transcript.

## Root Cause Analysis

### Preliminary context

`wr-architect:agent` is configured to review against `docs/decisions/`. ADRs encode architectural decisions but rarely encode performance constraints in numeric form (request frequency budgets, origin load targets, latency SLOs). When an architect review reduces to "does this violate any ADR", performance implications that don't have an ADR get no scrutiny.

The 2026-04-18 P018 architect review explicitly said "Load is genuinely negligible" for `no-cache` on root `/`, citing "the root body is `{}` and the Link header is a static per-version string. Even at RapidAPI's full traffic, this is microseconds of CPU per revalidation." That reasoning treats per-request CPU as the only cost; it ignores (a) origin round-trip latency added to every page load, (b) the multiplier effect of requests per session × sessions per consumer × consumers, (c) the business context that this is a revenue-generating endpoint where perceived latency matters to the buyer.

### Candidate fixes

1. **Expand the architect agent's review checklist** to include a performance / load / latency step: "For any change on a runtime-path endpoint, estimate per-request cost delta and request frequency on that endpoint; flag if the product of the two exceeds a threshold (e.g., > 1% origin CPU or > 10ms added p95 per page load)." Requires edits to the architect agent prompt/system message. Owned by the plugin maintainer (user's `wr-architect` plugin).
2. **Add a performance budget ADR** that the architect can read and enforce: e.g., "High-traffic endpoints MUST keep per-request origin cost ≤ X; changes that raise this require explicit PM approval." Then the architect's existing "check against ADRs" flow naturally catches violations.
3. **Add a performance-specialist sub-agent** that the architect delegates to for runtime-path changes; the architect focuses on ADRs and calls in the sub-agent when a change touches a cache directive, throttle, or rate-limit.
4. **Add a memory-level guardrail** (already partly done — `feedback_ask_before_ops_tradeoffs.md`) so that the main agent (me) self-escalates performance questions to the user before accepting architect's "load is negligible". This is the least-systemic fix but the fastest to land.

## Investigation Tasks

- [ ] Read the `wr-architect:agent` prompt (in `~/.claude/plugins/cache/windyroad/wr-architect/…`) to confirm the current review scope and identify the insertion point for a performance / load check.
- [ ] Decide which candidate fix to pursue. Combinations are fine — memory guardrail + agent prompt expansion is the likely sweet spot.
- [ ] If pursuing candidate 1 (agent prompt edit): draft a performance-check section. Flag high-traffic endpoints by path pattern (the root `/`, `/addresses`, `/localities`, `/postcodes`, `/states`). Require the architect to report "per-request cost delta" and "request frequency estimate" alongside the ADR-conflict section.
- [ ] If pursuing candidate 2 (performance budget ADR): propose an ADR for a performance budget on high-traffic endpoints.
- [ ] Add a reproduction case: present a cache-directive change on `/` to the architect and verify whether the performance implication is flagged.
- [ ] Decide whether this is an addressr-specific ticket (fix the local architect config/memory) or an upstream ticket (fix the shared `wr-architect` plugin). Cross-project context: same architect reviews bbstats too per the month-wide usage-data report.

## Related

- [P018: Root `/` cache TTL too long for a version-gated HATEOAS contract](018-root-cache-ttl-too-long-for-versioned-contract.parked.md) — the incident that surfaced this problem. Architect recommended `no-cache`; user rejected for exactly the performance reason this ticket names.
- [P016: External comms missing voice-tone and risk checks](016-external-comms-missing-voice-tone-and-risk-checks.open.md) — adjacent family: governance tooling has blind spots for output-quality and now performance-cost dimensions.
- Memory: `~/.claude/projects/-Users-tomhoward-Projects-addressr/memory/feedback_ask_before_ops_tradeoffs.md` — per-session wrapper guardrail added 2026-04-18.
- Usage-data report 2026-03-17 → 2026-04-16 — noted "shipping prematurely" as a recurring Claude pattern, which aligns with this ticket's concern.
- `wr-architect` plugin definition (upstream) — likely location of the systemic fix.
