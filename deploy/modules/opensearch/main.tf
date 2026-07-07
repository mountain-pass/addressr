# ADR 033: FGAC disabled. Authentication is IAM/SigV4 — the domain's
# resource-based access policy is the sole gate, scoped to named principals.
# There is no internal user database and no .opendistro_security index, so the
# P036 FGAC master-user clobber has no surface here. (AUDIT_LOGS log publishing
# requires FGAC and is therefore removed with it — see ADR 033; the P035
# index-deletion trip-wire moves to a SearchableDocuments-drop CloudWatch alarm
# in the caller.)
resource "aws_opensearch_domain" "this" {
  domain_name    = var.name
  engine_version = var.engine_version

  cluster_config {
    instance_type          = var.instance_type
    instance_count         = var.instance_count
    zone_awareness_enabled = var.instance_count > 1
  }

  ebs_options {
    ebs_enabled = true
    volume_type = var.ebs_volume_type
    volume_size = var.ebs_volume_size
  }

  # ADR 033: no advanced_security_options block → FGAC off.

  node_to_node_encryption {
    enabled = true
  }

  encrypt_at_rest {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  # ADR 033 non-negotiable invariant: with FGAC off, this scoped policy is the
  # SOLE gate. Principal is exactly the named ARNs (app EB instance role +
  # local loader identity) — NOT "*". Every request must carry a SigV4
  # signature from one of these principals or AWS rejects it with 403 at the
  # front door. Action es:ESHttp* covers the HTTP data-plane the app + loader
  # use. `access_policies = "*"` here would be genuinely open — do not weaken.
  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { AWS = var.allowed_principal_arns }
        Action    = "es:ESHttp*"
        Resource  = "arn:aws:es:*:*:domain/${var.name}/*"
      }
    ]
  })

  tags = var.tags
}
