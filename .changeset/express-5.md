---
'@mountainpass/addressr': patch
---

Upgraded the web framework from Express 4 to Express 5.

Express 5 is the actively developed line, so this moves the HTTP layer off maintenance-only. Nothing about the API changes: same endpoints, same responses, same headers, same authentication behaviour.

The upgrade was verified by differential test rather than by reading a changelog. The full behavioural suite ran against both versions on the same machine and the same search backend, and the results are identical: 37 scenarios and 232 steps on the in-process tier, 38 scenarios and 234 steps over real HTTP, all passing on each.

Along the way this fills a gap in the test suite. The preflight caching behaviour added for cross-origin browser callers was documented as being covered by a behavioural test that did not exist, so the only thing guarding it was a check that reads the source file as text and compares the position of two lines. That cannot detect a runtime routing failure: it would have reported success through a completely broken preflight. There is now a real test covering it. A preflight is answered with the cache directives. It works on any path rather than only the root. Nothing is emitted when the feature is switched off. And a preflight is exempt from gateway authentication while a data request without credentials is still rejected.

Self-hosted operators need do nothing. There is no configuration change and no behaviour change to adopt.
