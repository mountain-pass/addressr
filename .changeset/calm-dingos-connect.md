---
'@mountainpass/addressr-deployment': patch
---

Prepare the dormant managed API for production billing configuration by wiring its Stripe runtime inputs through the same reviewed plan and release path. Terraform now supplies the catalogue price and meter identifiers it already owns, while customer access remains disabled.

Verified subscription events from other integrations sharing the Stripe account are acknowledged without changing Addressr entitlements.
