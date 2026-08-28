---
'@mountainpass/addressr-deployment': patch
---

Keep the Addressr-managed API and account journeys closed behind one explicit production activation switch. Terraform now rejects activation unless the origin, Clerk, Stripe catalogue, payment-method and metering configuration is complete, while signed Stripe webhooks remain available to prepare entitlement projections before launch.
