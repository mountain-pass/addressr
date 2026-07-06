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

  # ADR 029 Phase 1 rolled back 2026-05-14: v2 OpenSearch domain
  # (search-addressr4) decommissioned after the resize-to-m6g.large blue/green
  # got stuck (3rd observation of the AWS-managed FGAC clobber pattern in P036).
  # ADDRESSR_SHADOW_* env vars removed → src/read-shadow.js default-off kicks
  # in → mirrorRequest no-ops → primary /addresses responses unaffected (always
  # were; v1 served production throughout). Read-shadow capability remains
  # shipped in code; ADR 031 default-off posture documented. Phase 1 may be
  # re-attempted later; the module ./modules/opensearch is retained
  # intentionally (ADR 030 amendment 2026-05-14).

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

# ADR 029 Phase 1 re-attempt 2026-07-07 (Stage 1): parallel v2 OpenSearch
# domain, provisioned QUIET — no ADDRESSR_SHADOW_* EB settings until the
# populate completes and validates (ADR 031 amendment 2026-07-06). Sizing is
# steady-state from day one (t3.small.search × 2 + 12 GB, matching v1) and is
# NEVER resized in place; escalation is destroy + recreate per the ADR 030
# never-resize consequence. Domain name addressr4 → endpoint reads
# search-addressr4-… (attempt 1's literal search-addressr4 name produced a
# double-prefixed endpoint). Audit logs on by module default (P036 — FGAC
# clobbers are invisible to CloudTrail). Creds are the fresh 2026-07-06 pair,
# synced GHA → TFC by .github/workflows/sync-tfc-vars.yml run 28821609857.
# ELASTIC_HOST stays pointed at v1 until ADR 029 step 7 cutover.
module "opensearch_v2" {
  source = "./modules/opensearch"

  name                 = var.elastic_v2_name
  engine_version       = var.elastic_v2_engine_version
  master_user_name     = var.elastic_v2_username
  master_user_password = var.elastic_v2_password

  instance_type   = "t3.small.search"
  instance_count  = 2
  ebs_volume_size = 12

  tags = {
    ManagedBy = "terraform"
    Component = "search"
    Adr       = "029-030"
  }
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
