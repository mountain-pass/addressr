---
'@mountainpass/addressr': patch
---

Fix loader URL-encode for OpenSearch client credentials (P036).

The loader at `client/elasticsearch.js` constructed the OpenSearch
client `node` URL by interpolating ELASTIC_USERNAME/ELASTIC_PASSWORD
directly. Base64-derived passwords commonly contain `/`, `+`, `=`,
`:`, `!` — all URL-reserved characters — which made
`new Client({ node })` throw `TypeError: Invalid URL` and the loader
retry once per second forever. v2.5.4 fixed the identical bug in
`src/read-shadow.js`'s shadow-client path but the loader path was
overlooked.

Discovered via P036 populate-search-domain run after rotating to a
new base64-derived v2 master password. ACT job hung for 1h45m
without indexing any documents.

Fix: extract the URL construction into a shared helper
`src/client-node-url.js` exporting `buildClientNode(...)` with
`encodeURIComponent` applied to username and password. Both
`client/elasticsearch.js` and `src/read-shadow.js` import the same
helper, so the fix cannot drift between paths again. Existing
read-shadow URL-encode regression test still passes; new helper
test covers the loader path directly.
