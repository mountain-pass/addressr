---
'@mountainpass/addressr': patch
---

Refuse to fall back to the production index name under a test profile.

`ES_INDEX_NAME` is set across several npm script strings in the packaged test
chains. When one of them dropped it, the index name resolved silently to the
production index, `addressr`, and the run went green having pointed at the
wrong index. It now throws when `ES_INDEX_NAME` is unset and `TEST_PROFILE` is
set. The production path, where `TEST_PROFILE` is absent, is unchanged.
