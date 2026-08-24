# Problem 135: `root.feature` pins a rel namespace the server stopped emitting

**Status**: Open
**Reported**: 2026-08-24
**Priority**: 8 (Medium) — Impact: Minor (2) × Likelihood: Certain (4). Impact 2: if the feature does not execute, a documented API-contract assertion is providing no coverage — the [P098](098-five-test-files-reached-by-no-runner-assertions-never-execute.md) class. If it does execute and passes, something is normalising the URI and the fixture is merely stale. Either way no user is harmed today, which is why this is 2 and not higher. Likelihood 4: the disagreement is on disk right now and is not a probability.
**Origin**: internal
**Effort**: S — running the feature answers it. The fix is a one-line fixture change or a deleted dead test.
**WSJF**: 8.0 — (8 × 1.0) / 1
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

Two files disagree about the API's link-relation namespace:

| Source                                           | Emits / expects                                             |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `packages/addressr/src/waycharter-server.js:757` | `https://addressr.io/rels/address-search`                   |
| `test/resources/features/root.feature:13-14`     | `https://addressr.mountain-pass.com.au/rels/address-search` |

The server uses `addressr.io` consistently — lines 757, 847, 906, 959 and 1032 all do, for address, locality, postcode and state search plus api-docs. The cucumber fixture uses the old `addressr.mountain-pass.com.au` host, and uses it twice: once in the link-template table and once in the `var-base` assertion that follows.

**Only one of three things can be true, and they need different fixes:**

1. **The feature does not execute.** Then this is [P098](098-five-test-files-reached-by-no-runner-assertions-never-execute.md)'s class — an assertion that looks like coverage and provides none — and the fix is to make it run or delete it.
2. **It executes and passes**, because something normalises or rewrites the rel URI between the server and the assertion. Then the fixture is stale but harmless, and what needs recording is _where_ the normalisation happens, because that is surprising.
3. **It executes and fails**, and the failure is tolerated or unnoticed somewhere.

Establishing which is the whole of the first task. Guessing between them is what this ticket exists to prevent.

## Why it surfaced now

Found during an audit of what depends on the `addressr.mountain-pass.com.au` domain, prompted by the Google Maps key allowlist missing that origin. The domain turns out to have **five** dependents, two of which are invisible from this repository:

- the Cloudflare worker `safeHosts` list (`apps/addressr-deployment/cloudflare-worker/safe-ips.mjs:19`, per ADR-018)
- the Maps key's referrer allowlist (Google Cloud console — **not in this repo**)
- `apps/website/_redirects`, which P122 records as never reaching the built site
- the live Netlify redirect or alias configuration (**not in this repo**, see [P134](134-nothing-in-the-repo-can-see-what-netlify-is-actually-doing.md))
- **this rel namespace**

The rel URI is the one that is not merely a dependency but an active disagreement, which is why it is split out rather than listed.

## A live API check could not settle it

`https://api.addressr.io/` returns **401** without the ADR-024 proxy-auth header, so the served rel URIs could not be read from outside. Whoever has the header can settle question 2 in one request.

## Investigation Tasks

- [ ] Run the cucumber suite and establish which of the three cases above is true. Nothing else in this ticket can be decided first.
- [ ] If the feature runs and passes, find and record what reconciles the two hosts. An assertion that passes against a value the server does not emit is worth understanding before it is "fixed".
- [ ] Update the fixture to `addressr.io`, or delete the assertion if it is dead. Do not simply change the string until case 1 versus case 2 is settled — in case 2 the change is cosmetic, in case 1 it papers over a dead test.
- [ ] Check whether other feature files pin the old host. This one was found by a domain audit, not by a sweep.
- [ ] **Decide whether the rel namespace is a published contract.** If any consumer dereferences these URIs, changing the host is a breaking change to a public interface, not a tidy-up. `addressr.io/rels/*` currently 404s on the live site, so nothing is served at either namespace — which is its own finding, and possibly the more interesting one.

## Related

- [P134](134-nothing-in-the-repo-can-see-what-netlify-is-actually-doing.md) — the other half of the domain audit; both were found in the same pass.
- [P098](098-five-test-files-reached-by-no-runner-assertions-never-execute.md) — the class this falls into if the feature does not run.
- [ADR-018](../../decisions/018-cloudflare-worker-api-proxy.accepted.md) — the worker safelist, another surface carrying the old domain. Its list also contains `addressr.mountainpass.com.au` (no hyphen), which is **NXDOMAIN** and should be removed rather than propagated.
