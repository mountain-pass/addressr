---
'@mountainpass/addressr': patch
---

Loader: skip the index close-update-open dance when settings and mappings already match (every state load after the first), and retry index close on `snapshot_in_progress_exception` when AWS-managed automated snapshots collide with it (P037). Removes the populate failure class where a state-load leg dies mid-run because an hourly snapshot was in progress.
