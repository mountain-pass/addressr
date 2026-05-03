---
'@mountainpass/addressr': patch
---

Fix shadow client URL building to URL-encode credentials (P035-discovered).

Previously `buildClientOptions` interpolated `ADDRESSR_SHADOW_USERNAME`
and `ADDRESSR_SHADOW_PASSWORD` directly into the OpenSearch node URL.
Base64-derived passwords commonly contain `/`, `+`, `=`, `:` — all
URL-reserved characters. Without encoding, the resulting URL
(`https://user:pa/ss@host:443`) made `new Client(...)` throw
synchronously because the URL parser interpreted the `/` in the password
as a path delimiter.

The throw was swallowed by `mirrorRequest`'s try/catch (per ADR 031
isolation contract), so the primary `/addresses` path was unaffected —
but every shadow request silently failed at construction. Production
manifestation surfaced via the brand-new `/debug/shadow-config` endpoint:
`attempts: 0, failures: 7, clientConstructed: false` despite `hostSet:
true` and `credentialsSet: true`. The endpoint did exactly what P035
asked of it: turned a 4-day silent-failure mode into a
diagnose-within-minutes signal.

Fix: `encodeURIComponent` the username and password when building the
node URL. New unit test exercises the failure mode with a realistic
33-char base64-derived password containing `/`, `+`, `=`, `:`, `@`.
