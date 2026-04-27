---
name: self-hosted-operator
description: Runs addressr on their own infrastructure for sovereignty, privacy, or cost reasons; may front it with their own API gateway.
---

# Self-Hosted Operator

## Who

Runs addressr on their own infrastructure for data sovereignty, privacy, or cost reasons. Manages OpenSearch and the G-NAF loading pipeline. Some operators additionally front Addressr with a commercial or self-managed API gateway (for key management, rate limiting, billing, or WAF) and need the origin to reject traffic that bypasses their chosen gateway — without being locked into any specific vendor.

## Context Constraints

- Cares about operational simplicity, clear documentation, and predictable resource requirements
- Owns the upstream OpenSearch and the loader cadence; quarterly G-NAF refreshes are routine
- May or may not front the origin with a gateway; behaviour must work in both modes
- Vendor-lock-in is the wrong default — gateway integration must be operator-configurable

## Pain Points

- Heavy infrastructure dependencies (OpenSearch RAM) and complex setup
- Origins that hard-code a specific vendor's auth header (RapidAPI, Cloudflare, etc.)
- Silent misconfiguration that ships an unauthenticated origin to production
