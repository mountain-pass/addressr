---
'@mountainpass/addressr-deployment': patch
---

Remove the SMS fault subscription, the variable holding its endpoint, the
publish role and the workflow wiring that carried the variable.

All four were added earlier the same day and the configuration was never
applied, so this removes infrastructure-as-code that never took effect. No
replacement is in place, and the managed channel has no fault notification.

No published interface, endpoint or behaviour changes.
