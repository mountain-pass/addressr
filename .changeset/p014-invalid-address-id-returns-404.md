---
'@mountainpass/addressr': patch
---

fix(address-service): invalid address ID returns 404 not 500

`GET /addresses/<invalid-id>` now returns `404 Not Found` as documented, instead of `500 Internal Server Error`. The `getAddress` catch block in `service/address-service.js` previously dereferenced `error_.body.found` and `error_.body.error.type` without guarding `error_.body` — on non-OpenSearch errors (network timeouts, connection refused) `error_.body` is `undefined`, so the catch block itself threw a `TypeError` and the request fell through to a generic 500.

**Consumer-visible impact**: API consumers can now reliably distinguish a missing address (404) from a backend fault (500) or a missing index (503). Request timeouts now map to `504 Gateway Timeout`, matching the sibling `getAddresses` search endpoint. Response bodies unchanged; only HTTP status codes are affected.

Fixes [#95](https://github.com/mountain-pass/addressr/issues/95) and [#81](https://github.com/mountain-pass/addressr/issues/81). See P014.
