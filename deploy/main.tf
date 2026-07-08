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

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ELASTIC_HOST"
    value     = var.elastic_host
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ELASTIC_PASSWORD"
    value     = var.elastic_password
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
    value     = var.elastic_username
    resource  = ""
  }

  # ADR 029 Stage 3 (read-shadow warming) 2026-07-08: mirror production
  # /addresses search + /addresses/{id} to the v2 domain (addressr4) so its
  # filesystem + field-data caches warm to steady state with real query
  # distribution before cutover (ADR 031). Fire-and-forget in
  # src/read-shadow.js → primary path (still basic-auth to v1) unaffected.
  # ADR 033: v2 is FGAC-off/IAM, so the shadow client SigV4-signs
  # (ADDRESSR_SHADOW_AUTH_MODE=sigv4) as the EB instance role, which holds
  # es:ESHttp* on the v2 domain ARN. No USERNAME/PASSWORD — there is no
  # internal credential on v2. Soak-validity gate (ADR 031 / P028): after
  # deploy, /debug/shadow-config must show successes>0, failures=0 (2xx
  # confirmed) before the >=48h soak clock starts.
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ADDRESSR_SHADOW_HOST"
    value     = module.opensearch_v2.endpoint
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ADDRESSR_SHADOW_PORT"
    value     = "443"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ADDRESSR_SHADOW_PROTOCOL"
    value     = "https"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ADDRESSR_SHADOW_AUTH_MODE"
    value     = "sigv4"
    resource  = ""
  }
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ADDRESSR_SHADOW_REGION"
    value     = "ap-southeast-2"
    resource  = ""
  }

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
# ELASTIC_HOST stays pointed at v1 until ADR 029 step 7 cutover.
module "opensearch_v2" {
  source = "./modules/opensearch"

  name           = var.elastic_v2_name
  engine_version = var.elastic_v2_engine_version

  # ADR 029 parity TEST 2026-07-08 (user-approved deviation from never-resize):
  # t3.small proved too small for 2.19 SERVING — warm p50 ~186ms vs v1 ~50ms,
  # p90 in the seconds. CloudWatch showed LOW CPU/JVM on v2 at v1's query rate,
  # so it is I/O-bound (page-cache misses on a 2GB box holding a ~1.7x-larger
  # 2.19 index), not compute-bound. m6g.large (8GB, Graviton) gives the RAM to
  # hold the hot set. Resize is now safe: ADR 033 removed FGAC so the P036
  # clobber that stalled the first resize cannot recur, and v2 takes zero prod
  # traffic (ELASTIC_HOST=v1). Measuring m6g.large-vs-v1 warm parity; end state
  # (keep+cutover vs revert) decided on the number, not pre-committed.
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
  allowed_principal_arns = [
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-elasticbeanstalk-ec2-role",
    var.loader_principal_arn,
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
  alarm_name          = "addressr-v2-searchable-documents-drop"
  namespace           = "AWS/ES"
  metric_name         = "SearchableDocuments"
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

# ADR 029 re-attempt 2026-07-06, Stage 0d: search-parity dashboard, stood up
# against v1 BEFORE any v2 spend so the parity signal is proven at our real
# traffic volume first. v1 (search-addressr3) stays out of Terraform scope per
# ADR 030 — its metrics are referenced by DomainName only. The v2 widgets show
# no data until the Stage 1 module caller provisions search-addressr4.
data "aws_caller_identity" "current" {}

locals {
  search_parity_domains = [var.elastic_v1_domain_name, var.elastic_v2_name]
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
        title  = "${metric} — v1 vs v2"
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
