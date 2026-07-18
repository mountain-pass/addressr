---
'@mountainpass/addressr': major
---

Remove the v1 Swagger API — Addressr now serves only the v2 WayCharter HATEOAS API (ADR-036, superseding ADR-003).

**Breaking:** the `addressr-server` binary and the v1 REST contract (`api/swagger.yaml`: `GET /addresses?q=&p=` returning a JSON array with link/link-template headers, `GET /addresses/{addressId}`) are removed. Self-hosted operators running the v1 `addressr-server` binary must migrate to `addressr-server-2` (the v2 HATEOAS API) or pin the last v1-bearing major. RapidAPI consumers are unaffected — production has served v2 exclusively since the v1 decommission.

This removes the abandoned `swagger-tools` dependency (~8 years unmaintained) and the production-tree vulnerabilities it rooted (`validator`, `z-schema`, and the swagger-tools-chained `body-parser`/`path-to-regexp`). The v1-embedded test tier is replaced by a fast in-process v2 tier that drives the real WayCharter app via `@mountainpass/waychaser`'s pluggable `fetch` + `light-my-request` injection (no socket, real HATEOAS behaviour).
