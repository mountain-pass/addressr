# P036: audit logs at provisioning time so FGAC internal-user changes (the
# password-clobber pattern that killed the first ADR 029 Phase 1 attempt) are
# traceable — they never surface in CloudTrail. The resource policy is
# account/region-scoped and AWS caps them at 10 per region, so it is named
# per domain (this module is instantiated once per parallel domain by design).
resource "aws_cloudwatch_log_group" "audit" {
  count             = var.enable_audit_logs ? 1 : 0
  name              = "/aws/opensearch/${var.name}/audit-logs"
  retention_in_days = var.audit_log_retention_days
  tags              = var.tags
}

resource "aws_cloudwatch_log_resource_policy" "audit" {
  count       = var.enable_audit_logs ? 1 : 0
  policy_name = "opensearch-audit-${var.name}"
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "es.amazonaws.com" }
        Action = [
          "logs:PutLogEvents",
          "logs:CreateLogStream",
        ]
        Resource = "${aws_cloudwatch_log_group.audit[0].arn}:*"
      }
    ]
  })
}

resource "aws_opensearch_domain" "this" {
  domain_name    = var.name
  engine_version = var.engine_version

  dynamic "log_publishing_options" {
    for_each = var.enable_audit_logs ? [1] : []
    content {
      log_type                 = "AUDIT_LOGS"
      cloudwatch_log_group_arn = aws_cloudwatch_log_group.audit[0].arn
    }
  }

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

  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true

    master_user_options {
      master_user_name     = var.master_user_name
      master_user_password = var.master_user_password
    }
  }

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

  # Mirrors search-addressr3-…'s posture: public endpoint, auth enforced at the
  # application layer via basic auth (ELASTIC_USERNAME/ELASTIC_PASSWORD, plus
  # ADR 024 gateway-header enforcement at the app). Network-level hardening
  # (VPC, IP allowlist) is a candidate for a future ADR, not part of ADR 030.
  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { AWS = "*" }
        Action    = "es:*"
        Resource  = "arn:aws:es:*:*:domain/${var.name}/*"
      }
    ]
  })

  tags = var.tags

  # AWS validates the domain can write to the log group at create time.
  depends_on = [aws_cloudwatch_log_resource_policy.audit]
}
