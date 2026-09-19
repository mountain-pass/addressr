---
'@mountainpass/addressr-deployment': patch
---

Stop the managed gateway refusing a page served from this machine, which was the first of two things blocking a local rehearsal of the customer journeys.

The gateway accepted browser requests only from https addresses. Managed calls from anywhere else were refused before reaching routing, identity or the database, with one exception: the Stripe webhook, which is answered before the check.

It now also accepts an address on this machine: the host must be exactly `127.0.0.1`, `localhost` or `[::1]`, and a port is required. Hosts that merely contain one of those names are refused, and each of the three has a test for that case.

The list of accepted addresses is built from a single deployment setting, and that setting now refuses any non-https value, so a deployment carrying an http address fails to plan rather than shipping. It forecloses http addresses, not local ones: `https://localhost` satisfied both the setting and the gateway's unchanged https rule before this change, and still does. The same setting builds the Stripe checkout and portal return links, so it guards both.

This corrects the sibling note in this release, which said this release changes no behaviour. That holds for the database columns it describes and no longer holds for the release, which now also changes the gateway.

This buys the browser half of a local rehearsal. The switch half was already reachable under the local emulator, so the two together make one possible. No rehearsal has run. In production nothing changes: the channel's own switch is untouched, and it is off.

No customer can reach the new path. An address on this machine is unreachable from any other, and the managed channel has never been activated.
