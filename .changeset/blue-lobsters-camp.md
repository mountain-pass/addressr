---
'@mountainpass/addressr': minor
---

To enable Cross-Origin Resource Sharing (CORS), you can use the `ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS` environment variable to control the `Access-Control-Allow-Headers` header. If `ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS` is not set, the header will not be returned. If it is set, the header will be returned with the value of the `ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS` environment variable.
