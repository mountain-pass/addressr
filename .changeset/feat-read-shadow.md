---
'@mountainpass/addressr': minor
---

Add read-shadow capability for search-backend migrations (ADR 031).

Setting `ADDRESSR_SHADOW_HOST` (plus optional `ADDRESSR_SHADOW_USERNAME` /
`_PASSWORD` / `_PORT` / `_PROTOCOL` / `_TIMEOUT_MS`) routes each /addresses
search and /addresses/{id} get to a configurable secondary OpenSearch
backend in fire-and-forget mode. The shadow request is detached
(`.catch(swallowError)`) and AbortController-bounded so failures cannot
impact the primary response. Goal: warm a candidate cluster's caches with
realistic production query distribution before cutover.

Default OFF — when `ADDRESSR_SHADOW_HOST` is unset, the mirror is a no-op
and self-hosted users (`@mountainpass/addressr` npm, Docker) are
unaffected. Partial credential pair (`USERNAME` xor `PASSWORD`) fails the
process at startup with a clear error, mirroring ADR 024's pattern.
