---
'@mountainpass/addressr-deployment': patch
---

Charge a customer's quota when a request is known billable, not before it is attempted.

The gateway charged before calling the origin and refunded only when the reservation
row was deleted. A reservation whose settle never completed — a transient database
error, or a worker stopped between the two steps — would have left the charge standing
forever, so a customer would have silently lost one request of their paid allowance,
permanently, per occurrence, with nothing detecting it and nothing repairing it.

The charge now happens on the outcome being known billable. A reservation that never
settles costs nothing, so the defect cannot occur rather than being collected after the
fact. Exhaustion is also now reported as exhaustion rather than as the usage store
being unavailable, which it was not.

Two accepted costs, both recorded rather than fixed. Simultaneous requests each read the
count before it moves, so a hard limit can be exceeded by roughly the number in flight;
sequential requests are still refused at the limit. And a request reserved just before a
billing period rolls over is counted against the new period rather than the one it was
made in. What an overshoot means at the plan boundary has not been measured yet; it is
tracked as an open launch gate in the managed-channel readiness ledger, not claimed here.

No customer was affected. The managed channel has never been activated, and with its
flag off the gateway refuses managed requests before any account is authorised — so
there was no path by which the old behaviour could reach a customer, and the commercial
tables were empty at the 2026-09-03 readback. Migration 0003 preserves any count already
taken, so a count already in progress is not reset by applying it.
