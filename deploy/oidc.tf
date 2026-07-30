# ADR 034/035: re-automate the quarterly G-NAF refresh on GitHub Actions against
# the production search domain over SigV4. GitHub Actions gets a short-lived,
# least-privilege identity via OIDC — no long-lived access key in a GHA secret.
# Amends ADR 033 (which removed GitHub from the data path) for the small quarterly
# DELTA loads only; the initial bulk load stays local. The role is a scoped
# principal on the domain access policy (see module.opensearch_v3 in main.tf).
# The v2 (gha-v2-loader) role was removed 2026-07-14 with the v2 decommission.

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

# ADR 035 Phase 2: the loader role GitHub Actions assumes to populate + refresh
# the v3 (OpenSearch 3.5) domain over SigV4. Trust scoped to the master ref only
# (the 9 update-{state}.yml crons + populate/canary workflow_dispatch all run from
# master); shared OIDC provider (AWS allows one provider per URL per account, so it
# is reused, not redeclared); least-privilege Get/Put/Post/Head (no ESHttpDelete —
# delta upserts never index-delete), scoped to the v3 ARN only.
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

# ADR 041 / P069: generation-4 loader role. SAME engine (OpenSearch 3.5) as
# generation 3 — this generation exists to carry the ADR-041 analyzer change,
# which forces a full ~15M-doc reindex. It is NOT an engine upgrade.
#
# A separate role rather than widening gha-v3-loader: ADR 034 records the role as
# least-privilege "scoped to the v3 ARN only", and a role named v3 authorising
# generation 4 is both a scoping erosion and a naming trap. Mirrors the v2 to v3
# precedent, and makes the v3 teardown a clean resource deletion rather than a
# policy edit under time pressure.
#
# Not load-critical for the initial bulk load, which runs locally as
# var.loader_principal_arn per ADR 033. Required before the 9 update-{state}.yml
# crons retarget to v4.
resource "aws_iam_role" "gha_v4_loader" {
  name = "gha-v4-loader"

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
    Adr       = "041"
  }
}

resource "aws_iam_role_policy" "gha_v4_loader_eshttp" {
  name = "addressr-gha-v4-loader-eshttp"
  role = aws_iam_role.gha_v4_loader.id
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
        Resource = "${module.opensearch_v4.arn}/*"
      }
    ]
  })
}

output "gha_v4_loader_role_arn" {
  value       = aws_iam_role.gha_v4_loader.arn
  description = "ADR 041: IAM role GitHub Actions assumes via OIDC to refresh the v4 (ADR-041 analyzer) domain over SigV4."
}
