resource "aws_elastic_beanstalk_application" "elasticapp" {
  name = terraform.workspace == "addressr-prod" || terraform.workspace == "prod" ? var.elasticapp : "${terraform.workspace}-${var.elasticapp}"
}

resource "aws_s3_bucket" "elasticapp" {
  bucket = aws_elastic_beanstalk_application.elasticapp.name
}

resource "aws_s3_object" "elasticapp" {
  bucket = aws_s3_bucket.elasticapp.id
  key    = "${var.elasticapp}-deployment-${var.elasticapp_version}.zip"
  source = "${var.elasticapp}-deployment-${var.elasticapp_version}.zip"
}

resource "aws_elastic_beanstalk_application_version" "elasticapp" {
  name        = "${aws_elastic_beanstalk_application.elasticapp.name}-v${var.elasticapp_version}"
  application = aws_elastic_beanstalk_application.elasticapp.name
  bucket      = aws_s3_bucket.elasticapp.id
  key         = aws_s3_object.elasticapp.id
}
# Create elastic beanstalk Environment

resource "aws_elastic_beanstalk_environment" "beanstalkappenv" {
  name                = aws_elastic_beanstalk_application.elasticapp.name
  application         = aws_elastic_beanstalk_application.elasticapp.name
  solution_stack_name = var.solution_stack_name
  tier                = var.tier
  version_label       = aws_elastic_beanstalk_application_version.elasticapp.name

  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = (var.proxy_auth_header == "") == (var.proxy_auth_value == "")
      error_message = "proxy_auth_header and proxy_auth_value must both be set or both be empty (ADR 024 fail-loud)."
    }
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN"
    value     = "*"
    // These empty 'resource' values prevent updating the environment on every apply.
    // See https://github.com/terraform-providers/terraform-provider-aws/issues/1471#issuecomment-522977469
    resource = ""
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS"
    value     = "*"
    resource  = ""
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS"
    value     = "*"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ADDRESSR_ENABLE_GEO"
    value     = "1"
    resource  = ""
  }
  dynamic "setting" {
    # terraform >= 1.5 (pinned 1.9.8 for ADR 032 import blocks) rejects a
    # for_each derived from a sensitive value, AND requires a set/map (not a
    # list-of-number). var.proxy_auth_header is sensitive, so wrap the boolean
    # in nonsensitive() — this reveals only WHETHER the var is set, never its
    # value (the for_each keys are static). Content uses var.proxy_auth_header
    # directly, so the iterator value is irrelevant; this just emits the block
    # once when the var is set.
    for_each = nonsensitive(var.proxy_auth_header != "") ? toset(["enabled"]) : toset([])
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = "ADDRESSR_PROXY_AUTH_HEADER"
      value     = var.proxy_auth_header
      resource  = ""
    }
  }
  dynamic "setting" {
    for_each = nonsensitive(var.proxy_auth_value != "") ? toset(["enabled"]) : toset([])
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = "ADDRESSR_PROXY_AUTH_VALUE"
      value     = var.proxy_auth_value
      resource  = ""
    }
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "DEBUG"
    value     = "error,api,express:*,swagger-tools*,test,es"
    resource  = ""
  }

  # ADR 035 Phase 2 CUTOVER 2026-07-14: the EB primary now points at the v3
  # domain (addressr5, OpenSearch 3.5) over IAM/SigV4 (ADR 033). ELASTIC_HOST is
  # sourced from module.opensearch_v3.endpoint. Gated on the ADR 031 read-shadow
  # soak: ~1 day of real production traffic mirrored to v3 with full read coverage
  # and 0 failures, plus full doc parity (16.9M) + behavioural CI on 3.5 +
  # warm-latency parity+. Username/password stay EMPTIED so buildClientNode
  # (src/client-node-url.js) builds a credential-less node URL — the exact shape
  # the SigV4 signer wraps. The EB instance role (aws-elasticbeanstalk-ec2-role)
  # holds es:ESHttp* on the v3 ARN (eb_opensearch_v3). Rollback = git-revert this
  # commit + apply → back to warm v2 (addressr4 untouched + still populated;
  # zero-outage via the rolling deploy + the deepened /health auto-rollback).
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ELASTIC_HOST"
    value     = module.opensearch_v3.endpoint
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ELASTIC_PASSWORD"
    value     = ""
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ELASTIC_PORT"
    value     = "443"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ELASTIC_PROTOCOL"
    value     = "https"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ELASTIC_USERNAME"
    value     = ""
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ELASTIC_AUTH_MODE"
    value     = "sigv4"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ELASTIC_REGION"
    value     = "ap-southeast-2"
    resource  = ""
  }

  # ADR 035 Phase 2 read-shadow REMOVED at cutover 2026-07-14: v3 (addressr5) is
  # now PRIMARY (ELASTIC_HOST above), so mirroring reads to v3 would be a redundant
  # v3→v3 shadow. The soak served its purpose (~1 day, full read coverage, 0
  # failures) and is retired. No ADDRESSR_SHADOW_* settings → src/read-shadow.js stays dormant
  # (validateReadShadowConfig short-circuits on unset ADDRESSR_SHADOW_HOST).

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "NODE_ENV"
    value     = "production"
    resource  = ""
  }

  setting {
    namespace = "aws:elasticbeanstalk:monitoring"
    name      = "Automatically Terminate Unhealthy Instances"
    value     = "true"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:asg"
    name      = "Availability Zones"
    value     = "Any 2"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:command"
    name      = "BatchSize"
    value     = "100"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:command"
    name      = "BatchSizeType"
    value     = "Percentage"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:trigger"
    name      = "BreachDuration"
    value     = "5"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:policies"
    name      = "ConnectionDrainingEnabled"
    value     = "true"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:policies"
    name      = "ConnectionDrainingTimeout"
    value     = "10"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:policies"
    name      = "ConnectionSettingIdleTimeout"
    value     = "60"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:asg"
    name      = "Cooldown"
    value     = "360"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:loadbalancer"
    name      = "CrossZone"
    value     = "true"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:asg"
    name      = "Custom Availability Zones"
    value     = "ap-southeast-2b,ap-southeast-2a,ap-southeast-2c"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:control"
    name      = "DefaultSSHPort"
    value     = "22"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "DeleteOnTerminate"
    value     = "false"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs:health"
    name      = "DeleteOnTerminate"
    value     = "false"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:command"
    name      = "DeploymentPolicy"
    value     = "Rolling"
    resource  = ""
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "ELBScheme"
    value     = "public"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:asg"
    name      = "EnableCapacityRebalancing"
    value     = "true"
    resource  = ""
  }
  setting {
    namespace = "aws:ec2:instances"
    name      = "EnableSpot"
    value     = "true"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:healthreporting:system"
    name      = "EnhancedHealthAuthEnabled"
    value     = "false"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "EnvironmentType"
    value     = "LoadBalanced"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:trigger"
    name      = "EvaluationPeriods"
    value     = "1"
    resource  = ""
  }

  setting {
    namespace = "aws:elasticbeanstalk:healthreporting:system"
    name      = "HealthCheckSuccessThreshold"
    value     = "Ok"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs:health"
    name      = "HealthStreamingEnabled"
    value     = "true"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:healthcheck"
    name      = "HealthyThreshold"
    value     = "2"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "IamInstanceProfile"
    value     = "aws-elasticbeanstalk-ec2-role"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:command"
    name      = "IgnoreHealthCheck"
    value     = "false"
    resource  = ""
  }
  setting {
    namespace = "aws:cloudformation:template:parameter"
    name      = "InstancePort"
    value     = "80"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:listener:80"
    name      = "InstancePort"
    value     = "80"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:listener:80"
    name      = "InstanceProtocol"
    value     = "HTTP"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:managedactions:platformupdate"
    name      = "InstanceRefreshEnabled"
    value     = "false"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "InstanceType"
    value     = "t2.nano"
    resource  = ""
  }
  setting {
    namespace = "aws:cloudformation:template:parameter"
    name      = "InstanceTypeFamily"
    value     = "t2"
    resource  = ""
  }
  setting {
    namespace = "aws:ec2:instances"
    name      = "InstanceTypes"
    value     = "t2.nano, t3.nano"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:healthcheck"
    name      = "Interval"
    value     = "10"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:control"
    name      = "LaunchTimeout"
    value     = "0"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:control"
    name      = "LaunchType"
    value     = "Migration"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:listener:80"
    name      = "ListenerEnabled"
    value     = "true"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:listener:80"
    name      = "ListenerProtocol"
    value     = "HTTP"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:loadbalancer"
    name      = "LoadBalancerHTTPPort"
    value     = "OFF"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:loadbalancer"
    name      = "LoadBalancerHTTPSPort"
    value     = "OFF"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:loadbalancer"
    name      = "LoadBalancerPortProtocol"
    value     = "HTTP"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:loadbalancer"
    name      = "LoadBalancerSSLPortProtocol"
    value     = "HTTPS"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "LoadBalancerType"
    value     = "classic"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:hostmanager"
    name      = "LogPublicationControl"
    value     = "false"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:trigger"
    name      = "LowerBreachScaleIncrement"
    value     = "-1"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:trigger"
    name      = "LowerThreshold"
    value     = "2000000"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:updatepolicy:rollingupdate"
    name      = "MaxBatchSize"
    value     = "1"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:asg"
    name      = "MaxSize"
    value     = "4"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:trigger"
    name      = "MeasureName"
    value     = "NetworkOut"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:updatepolicy:rollingupdate"
    name      = "MinInstancesInService"
    value     = "2"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:asg"
    name      = "MinSize"
    value     = "2"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "MonitoringInterval"
    value     = "5 minute"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:trigger"
    name      = "Period"
    value     = "5"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:managedactions"
    name      = "PreferredStartTime"
    value     = "Thu:08:00"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:environment:proxy"
    name      = "ProxyServer"
    value     = "nginx"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "RetentionInDays"
    value     = "7"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs:health"
    name      = "RetentionInDays"
    value     = "7"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:control"
    name      = "RollbackLaunchOnFailure"
    value     = "true"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:updatepolicy:rollingupdate"
    name      = "RollingUpdateEnabled"
    value     = "true"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:updatepolicy:rollingupdate"
    name      = "RollingUpdateType"
    value     = "Health"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "SSHSourceRestriction"
    value     = "tcp,22,22,0.0.0.0/0"
    resource  = ""
  }
  setting {
    namespace = "aws:ec2:instances"
    name      = "SpotFleetOnDemandAboveBasePercentage"
    value     = "0"
    resource  = ""
  }
  setting {
    namespace = "aws:ec2:instances"
    name      = "SpotFleetOnDemandBase"
    value     = "0"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:trigger"
    name      = "Statistic"
    value     = "Average"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "StreamLogs"
    value     = "false"
    resource  = ""
  }
  setting {
    namespace = "aws:ec2:instances"
    name      = "SupportedArchitectures"
    value     = "x86_64"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:healthreporting:system"
    name      = "SystemType"
    value     = "enhanced"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:healthcheck"
    name      = "Target"
    value     = "HTTP:80/health"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:updatepolicy:rollingupdate"
    name      = "Timeout"
    value     = "PT30M"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:command"
    name      = "Timeout"
    value     = "600"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:healthcheck"
    name      = "Timeout"
    value     = "5"
    resource  = ""
  }
  setting {
    namespace = "aws:elb:healthcheck"
    name      = "UnhealthyThreshold"
    value     = "5"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:trigger"
    name      = "Unit"
    value     = "Bytes"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:managedactions:platformupdate"
    name      = "UpdateLevel"
    value     = "minor"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:trigger"
    name      = "UpperBreachScaleIncrement"
    value     = "1"
    resource  = ""
  }
  setting {
    namespace = "aws:autoscaling:trigger"
    name      = "UpperThreshold"
    value     = "6000000"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:xray"
    name      = "XRayEnabled"
    value     = "false"
    resource  = ""
  }
}

# ADR 032 / P042 — Cloudflare Worker as API key proxy, brought under Terraform.
# Worker source lives in deploy/cloudflare-worker/. Cutover via `terraform import`
# of the existing dashboard-managed worker (script + route) — see ADR 032
# Decision Outcome / Cutover mechanism for the import commands.
module "cloudflare_worker" {
  source = "./modules/cloudflare-worker"

  account_id   = var.cloudflare_account_id
  zone_id      = var.cloudflare_zone_id
  rapidapi_key = var.cloudflare_rapidapi_key
}

# ADR 029 Phase 1 re-attempt (Stage 1) + ADR 033 (IAM/SigV4 auth): parallel v2
# OpenSearch domain, provisioned QUIET — no ADDRESSR_SHADOW_* EB settings until
# populate completes and validates (ADR 031 amendment 2026-07-06). Sizing is
# t3.small.search × 2 + 20 GB (EBS bumped from 12 per the ADR 029 amendment
# 2026-07-08 — 2.19 needs more disk). The never-resize discipline (ADR 030)
# applies to the INSTANCE CLASS (blue/green resize under load is the stuck-
# class that tripped P036); an online EBS volume resize on an empty domain is
# a different, safe operation. Domain name addressr4 → endpoint reads
# search-addressr4-….
#
# ADR 033: FGAC is OFF. Auth is IAM/SigV4 — the access policy is scoped to the
# EB instance role (app) + the local loader identity, the sole gate (no
# clobberable internal password; the 2026-07-07 addressr4 failure reproduced
# P036+P035 under FGAC). The elastic_v2_username/password vars are now unused
# (deferred cleanup; sync-tfc-vars.yml's TFC copies are harmless-but-orphaned).
# ELASTIC_HOST was cut over to this v2 domain 2026-07-10 (ADR 029 Stage 5) — the
# EB primary settings above now reference module.opensearch_v2.endpoint / SigV4.
module "opensearch_v2" {
  source = "./modules/opensearch"

  name           = var.elastic_v2_name
  engine_version = var.elastic_v2_engine_version

  # ADR 029 steady-state sizing for 2.19 = m6g.large.search x 2 (user-confirmed
  # via AskUserQuestion 2026-07-09; ADR 029 point 2 amended). CLOSED decision:
  # t3.small serves 1.3.20 fine but CANNOT serve 2.19 at parity — under real load
  # it DIVERGED from v1 (p90 climbed 1156→2753ms and rising over 4h vs v1 ~200ms;
  # p99 ~5-8s). That is a memory/capacity ceiling (2GB can't hold the ~1.7x-larger
  # 2.19 hot-set), NOT a warming lag — more soak time does not fix it. m6g.large
  # (8GB) proved parity and slightly ahead of v1 (warm p90 45ms / p99 115ms vs v1
  # p90 64ms / p99 187ms). In-place resize proved safe (3 clean resizes this cycle;
  # ADR 033 removed the FGAC clobber that stalled the first attempt), so resize is
  # an acceptable mechanism alongside destroy+recreate. Cutover to prod is still a
  # separate later event (ELASTIC_HOST flips at Stage 5 after the formal k6 gate).
  instance_type  = "m6g.large.search"
  instance_count = 2
  # ADR 029 amendment 2026-07-08: 20 GB (was 12). OpenSearch 2.19 uses ~1.7x
  # the disk-per-doc of v1's 1.3.20 (v2 hit ~80% of 12 GB at 14M docs where v1
  # holds the full 16.8M at ~56%), so the full dataset with a replica needs
  # more than 12 GB. The from-scratch 16.8M geo-load is also what overwhelms
  # the t3.small (v1 grew incrementally and never bulk-loaded from scratch);
  # the load runs with replicas=0 (index template) to halve disk + write
  # pressure, then the replica is added post-load. P035 index-deletion
  # correlated with the t3.small overload and is FGAC-independent (ADR 033
  # honesty caveat confirmed) — this sizing removes the overload driver.
  ebs_volume_size = 20

  # ADR 033 scoped principals: the EB app's default instance role +
  # the local operator identity that runs the loader (SigV4).
  # ADR 034: + the GitHub Actions OIDC loader role for the re-automated
  # quarterly delta loads (see deploy/oidc.tf).
  allowed_principal_arns = [
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-elasticbeanstalk-ec2-role",
    var.loader_principal_arn,
    aws_iam_role.gha_v2_loader.arn,
  ]

  tags = {
    ManagedBy = "terraform"
    Component = "search"
    Adr       = "029-030-033"
  }
}

# ADR 033: let the EB app (aws-elasticbeanstalk-ec2-role, AWS-managed, not TF-
# owned) call the v2 domain over SigV4 once it points at v2 (shadow / cutover).
# Belt-and-suspenders with the domain access policy; scoped to the domain ARN.
resource "aws_iam_role_policy" "eb_opensearch_v2" {
  name = "addressr-opensearch-v2-eshttp"
  role = "aws-elasticbeanstalk-ec2-role"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "es:ESHttp*"
        Resource = "${module.opensearch_v2.arn}/*"
      }
    ]
  })
}

# ADR 033 / P035 trip-wire: audit logs are gone with FGAC, so the silent
# index-deletion symptom (10M→7 docs on 2026-07-07) is watched by a
# SearchableDocuments-drop alarm — the metric that actually detected it.
# Fires when searchable docs on v2 fall below a floor while it should hold the
# full dataset. Treated as breaching on missing data so a wipe-to-zero trips it.
resource "aws_cloudwatch_metric_alarm" "v2_searchable_documents_drop" {
  alarm_name  = "addressr-v2-searchable-documents-drop"
  namespace   = "AWS/ES"
  metric_name = "SearchableDocuments"
  dimensions = {
    DomainName = var.elastic_v2_name
    ClientId   = data.aws_caller_identity.current.account_id
  }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  # ~16.8M at full load; alarm well below that to allow indexing/refresh jitter
  # but catch a catastrophic drop (the 2026-07-07 wipe went to 7).
  threshold          = var.v2_searchable_documents_floor
  treat_missing_data = "breaching"
  alarm_description  = "ADR 033: v2 OpenSearch searchable-document count dropped below floor — possible P035-class silent index deletion. Investigate before it self-heals."
}

# ADR 035 Phase 2: the v3 OpenSearch 3.5 domain, provisioned in parallel with v2
# (the same blue/green pattern that took v1→v2). Mirrors module.opensearch_v2:
# same m6g.large.search x 2 / 20 GB proven steady-state class (Lucene 10 may
# reduce the footprint but we don't assume it — right-size later if measured,
# via from-scratch/blue-green, never an ad-hoc resize under load per ADR 030).
# Not in the serving path yet — ELASTIC_HOST flips to this domain at cutover.
module "opensearch_v3" {
  source = "./modules/opensearch"

  name            = var.elastic_v3_name
  engine_version  = var.elastic_v3_engine_version
  instance_type   = "m6g.large.search"
  instance_count  = 2
  ebs_volume_size = 20

  # ADR 033/035 scoped principals: EB app instance role + local operator loader
  # + the GitHub Actions OIDC v3 loader role (see deploy/oidc.tf).
  allowed_principal_arns = [
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-elasticbeanstalk-ec2-role",
    var.loader_principal_arn,
    aws_iam_role.gha_v3_loader.arn,
  ]

  tags = {
    ManagedBy = "terraform"
    Component = "search"
    Adr       = "035"
  }
}

# ADR 033/035: let the EB app SigV4-call the v3 domain (belt-and-suspenders with
# the domain access policy). Granted pre-cutover — permission only; EB does not
# query v3 until ELASTIC_HOST flips at cutover.
resource "aws_iam_role_policy" "eb_opensearch_v3" {
  name = "addressr-opensearch-v3-eshttp"
  role = "aws-elasticbeanstalk-ec2-role"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "es:ESHttp*"
        Resource = "${module.opensearch_v3.arn}/*"
      }
    ]
  })
}

# ADR 035 / P035 trip-wire: v3 SearchableDocuments-drop alarm, mirroring v2.
# Floor raised to 15M (var default) at cutover 2026-07-14 now that v3 is populated
# (16.9M, exact G-NAF parity) and serving as primary — it started at 1M during
# provision+populate so a fresh empty domain would clear once populate crossed ~1M.
resource "aws_cloudwatch_metric_alarm" "v3_searchable_documents_drop" {
  alarm_name  = "addressr-v3-searchable-documents-drop"
  namespace   = "AWS/ES"
  metric_name = "SearchableDocuments"
  dimensions = {
    DomainName = var.elastic_v3_name
    ClientId   = data.aws_caller_identity.current.account_id
  }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  threshold           = var.v3_searchable_documents_floor
  treat_missing_data  = "breaching"
  alarm_description   = "ADR 035: v3 OpenSearch searchable-document count dropped below floor — possible P035-class silent index deletion. Investigate before it self-heals."
}

# ADR 029 Stage 0d: search-parity dashboard. Originally stood up against v1
# before any v2 spend to prove the parity signal at real traffic volume;
# post-cutover (v1 decommissioned 2026-07-11) it is v2-only ongoing monitoring
# of the addressr4 domain (SearchLatency / SearchRate / CPUUtilization).
data "aws_caller_identity" "current" {}

locals {
  # ADR 035 Phase 2: during the 2.19→3.5 overlap the dashboard plots v2 vs v3
  # so the parity signal is proven at real traffic volume before cutover; it
  # reverts to v3-only once v2 (addressr4) is decommissioned post-cutover.
  search_parity_domains = [var.elastic_v2_name, var.elastic_v3_name]
  # One line per domain per stat. p95 may be sparse at low q/s — the Average
  # lines are the fallback comparison per the ADR 029 re-attempt amendment;
  # the statistic/period choice is validated on v1 during Stage 0d.
  search_parity_widgets = [
    for idx, metric in ["SearchLatency", "SearchRate", "CPUUtilization"] : {
      type   = "metric"
      x      = 0
      y      = idx * 8
      width  = 24
      height = 8
      properties = {
        title  = "${metric} — v2 vs v3"
        region = "ap-southeast-2"
        stat   = metric == "SearchLatency" ? "p95" : "Average"
        period = 3600
        view   = "timeSeries"
        metrics = concat(
          [
            for domain in local.search_parity_domains :
            ["AWS/ES", metric, "DomainName", domain, "ClientId", data.aws_caller_identity.current.account_id]
          ],
          metric == "SearchLatency" ? [
            for domain in local.search_parity_domains :
            ["AWS/ES", metric, "DomainName", domain, "ClientId", data.aws_caller_identity.current.account_id, { stat = "Average", label = "${domain} avg" }]
          ] : []
        )
      }
    }
  ]
}

resource "aws_cloudwatch_dashboard" "search_parity" {
  dashboard_name = "addressr-search-parity"
  dashboard_body = jsonencode({ widgets = local.search_parity_widgets })
}
