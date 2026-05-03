---
'@mountainpass/addressr': minor
---

Add `/debug/shadow-config` runtime introspection endpoint for read-shadow
diagnostics (P035 first action; ADR 031 soak-validity-check implementation).

Returns config-presence booleans, attempt/success/failure counters since
boot, and the last error (closed-enum class + ISO timestamp). Reachable
without gateway auth (ADR 024 ALLOWLIST). Response shape is bounded —
no hostnames, secrets, free-text error messages, or stack traces — so
information-disclosure analysis is trivial.

Closes the diagnostic gap that P035 captured: an operator could not tell
whether shadow was firing in production without ad-hoc probing during
diagnosis of an unrelated failure. After this release, monitoring tools
and operators get a definitive answer in <200ms via:

curl https://backend.addressr.io/debug/shadow-config

The release.yml deploy step also runs an automated post-deploy probe
asserting `hostSet: true` and a valid `lastError.class` enum — catches the
silent-no-op P035 failure mode within minutes of every deploy.

Default off for self-hosted: when `ADDRESSR_SHADOW_HOST` is unset, the
endpoint returns all-zeros / all-false JSON shape with no behavioural
change.
