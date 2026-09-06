---
'@mountainpass/addressr-deployment': patch
---

Store a closed-set route in usage records instead of the request path.

Nothing was disclosed, and this is why. The reserve statement persisted the
request pathname verbatim, and the API declares a single-address lookup whose
path carries a G-NAF identifier — so ON ACTIVATION the commercial database would
have begun accumulating which addresses each organisation resolved, against their
API key, with no redaction and no expiry. The channel is not activated and the
readback of 2026-09-03 records zero rows in all seven commercial tables, so the
exposure was entirely prospective. Fixed at the last moment it is cheap. Nothing between
authorisation and reservation validates the path either, so a caller holding a
valid key could put anything in any segment, including the first.

The stored value now comes from a closed set — `root`, `addresses`,
`addresses/:id`, `other` — so caller input cannot reach the column by
construction rather than by an argument about what well-behaved clients send.

Nothing reads the column. In the Worker and the health script, `request_path` is
written in exactly one statement — the reserve insert — and read in none:
nothing there selects, filters, groups or orders by it. The only statement that reads
it anywhere is the test proving it holds no identifier. Billing is per request. Per-endpoint accounting survives at
collection granularity, and a new endpoint accounts as `other` until an entry is
added — fail-safe for privacy, blind for accounting.

No migration: the column definition is unchanged and the tables are empty. No
customer-visible behaviour changes, and the RapidAPI proxy path does not reach
this code at all.

The decision behind it is recorded and NOT ratified: four options were live, one
is derived as chosen and three rejected, and the maintainer has confirmed none of
it. The code changed anyway because the defect is
live and the fix is reversible while the tables are empty.
