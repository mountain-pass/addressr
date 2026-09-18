---
'@mountainpass/addressr-deployment': patch
---

Add the columns that will let a request served past a hard cap go uncharged.

This release changes no behaviour. It adds two columns, and nothing writes to either
one yet: a marker on each usage record saying whether it may be metered, and a count
on each reconciliation window of how many records were deliberately left out of it.
Both default to nothing-excluded, so applying this on its own cannot stop anything
being billed.

They ship a release ahead of the code that uses them, because the gateway deploys
before its migrations apply. A gateway naming a column the database does not yet carry
would fail while settling requests the origin had already served, losing the record of
work that should have been charged. So the columns have to exist first.

What they are for: a customer who sets a hard cap is buying a ceiling, so requests
served past it should not be charged. Simultaneous requests can exceed a cap by roughly
the number in flight, and today every one of those is delivered to the usage meter like
any other. Whether it then reaches an invoice depends on how the plan's price is
configured, which is the wrong thing for the guarantee to rest on. The next release
makes it hold regardless.

No customer can have been affected. The managed channel has never been activated, and
with its flag off the gateway refuses managed requests before any account is authorised.
