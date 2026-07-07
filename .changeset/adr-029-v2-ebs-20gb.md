---
'@mountainpass/addressr': patch
---

Increase the v2 OpenSearch domain EBS volume to 20 GB. OpenSearch 2.19 uses more disk per document than the prior 1.3 engine, so the full address dataset with a replica needs more than the previous 12 GB.
