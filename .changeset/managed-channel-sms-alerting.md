---
'@mountainpass/addressr-deployment': patch
---

Add the filtered SMS subscription for managed-channel fault notifications.

The endpoint is a protected variable with no default, so no number enters the
repository. A message-attribute filter bounds the SMS channel to
managed-channel faults only. The shared notification topic gains
prevent_destroy, because replacement would drop a confirmed email subscription
that carries a live trip-wire.

Deliverability was proven before the configuration was written, since a
subscription that can never deliver still applies green.
