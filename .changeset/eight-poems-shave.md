---
'@mountainpass/addressr': minor
---

Export the resolved index name from `client/elasticsearch.js`.

`ES_LOCALITY_INDEX_NAME` was already derived from the same value; the base name was module-private, so anything else that needed the resolved name had to re-derive it from the environment. The acceptance suite now reads it directly instead.

No behaviour changes. The value and how it resolves are unchanged.
