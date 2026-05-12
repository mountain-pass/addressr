---
'@mountainpass/addressr': patch
---

Retry P036 deploy — EB env-var rollback recovery. Prior deploy
brought the v2 cluster up clean with the rotated password but EB
rolled back when one of two instances timed out during the app
deploy. This changeset fires another deploy attempt to re-push the
EB env vars to match the cluster.
