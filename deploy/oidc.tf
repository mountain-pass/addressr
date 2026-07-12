# ADR 034: re-automate the quarterly G-NAF refresh on GitHub Actions against the
# v2 domain over SigV4. GitHub Actions gets a short-lived, least-privilege
# identity via OIDC — no long-lived access key in a GHA secret. Amends ADR 033
# (which removed GitHub from the data path) for the small quarterly DELTA loads
# only; the initial bulk load stays local. The role is added as a third
# principal on the v2 access policy (see module.opensearch_v2 in main.tf).

# GitHub's OIDC issuer. Since mid-2023 AWS validates the OIDC token against a
# library of trusted root CAs, so thumbprint_list is legacy-required-but-unused
# for token validation; the two well-known GitHub Actions thumbprints are pinned
# to satisfy the API.
resource "aws_iam_openid_connect_provider" "github_actions" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fce",
  ]

  tags = {
    ManagedBy = "terraform"
    Component = "search"
    Adr       = "034"
  }
}

# The loader role GitHub Actions assumes to write quarterly deltas to v2.
# Trust is scoped to the master ref only (ADR 034 ratification tightening
# 2026-07-11): the 9 scheduled update-{state}.yml crons and the canary
# workflow_dispatch all run from master — no branch/PR/tag workflow may assume
# this prod-write role.
resource "aws_iam_role" "gha_v2_loader" {
  name = "gha-v2-loader"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Federated = aws_iam_openid_connect_provider.github_actions.arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = "repo:mountain-pass/addressr:ref:refs/heads/master"
          }
        }
      }
    ]
  })

  tags = {
    ManagedBy = "terraform"
    Component = "search"
    Adr       = "034"
  }
}

# Least-privilege data-plane access on the v2 domain ONLY (ADR 034 ratification
# tightening 2026-07-11): Get/Put/Post/Head — no ESHttpDelete (delta upserts
# never index-delete; ESHttpDelete is the DELETE /<index> shape behind the
# 2026-07-07 P035 wipe), no es:Delete*/config actions, no other services.
resource "aws_iam_role_policy" "gha_v2_loader_eshttp" {
  name = "addressr-gha-v2-loader-eshttp"
  role = aws_iam_role.gha_v2_loader.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "es:ESHttpGet",
          "es:ESHttpPut",
          "es:ESHttpPost",
          "es:ESHttpHead",
        ]
        Resource = "${module.opensearch_v2.arn}/*"
      }
    ]
  })
}

# Consumed by reusable-update.yml's configure-aws-credentials role-to-assume.
output "gha_v2_loader_role_arn" {
  value       = aws_iam_role.gha_v2_loader.arn
  description = "ADR 034: IAM role GitHub Actions assumes via OIDC to load quarterly G-NAF deltas into the v2 domain over SigV4."
}

# ADR 035 Phase 2: the loader role GitHub Actions assumes to populate + refresh
# the v3 (OpenSearch 3.5) domain over SigV4. Mirrors gha_v2_loader exactly —
# same shared OIDC provider (AWS allows one provider per URL per account, so it
# is reused, not redeclared), same master-ref trust, same least-privilege
# Get/Put/Post/Head (no ESHttpDelete) — but scoped to the v3 ARN only.
resource "aws_iam_role" "gha_v3_loader" {
  name = "gha-v3-loader"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Federated = aws_iam_openid_connect_provider.github_actions.arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = "repo:mountain-pass/addressr:ref:refs/heads/master"
          }
        }
      }
    ]
  })

  tags = {
    ManagedBy = "terraform"
    Component = "search"
    Adr       = "035"
  }
}

resource "aws_iam_role_policy" "gha_v3_loader_eshttp" {
  name = "addressr-gha-v3-loader-eshttp"
  role = aws_iam_role.gha_v3_loader.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "es:ESHttpGet",
          "es:ESHttpPut",
          "es:ESHttpPost",
          "es:ESHttpHead",
        ]
        Resource = "${module.opensearch_v3.arn}/*"
      }
    ]
  })
}

output "gha_v3_loader_role_arn" {
  value       = aws_iam_role.gha_v3_loader.arn
  description = "ADR 035: IAM role GitHub Actions assumes via OIDC to populate + refresh the v3 (OpenSearch 3.5) domain over SigV4."
}
