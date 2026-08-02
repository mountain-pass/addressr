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

  # ADR 041 CUTOVER: the EB primary points at the v4 domain
  # (addressr6, OpenSearch 3.5, equivalent-synonym analyzer) over IAM/SigV4.
  #
  # ROLLBACK IS THIS ONE LINE: set value back to module.opensearch_v3.endpoint
  # and apply. v3 (addressr5) is retained fully populated and WARM - it served
  # production until this commit - so rollback is a flip, not the hours-long
  # rebuild-from-G-NAF that ADR 035 was stuck with. Do not go looking elsewhere.
  #
  # Gated on all five ADR 031 Soak Gate criteria, measured over 33.8 h: mirror
  # parity, zero failures with sustained doc parity, p90 ratio flattened within
  # the 10% band, >=24 h spanning two business peaks, and k6 green p95 at 1.05x
  # a freshly measured blue baseline against a 1.5x gate.
  #
  # Username/password stay EMPTIED so buildClientNode builds the credential-less
  # node URL the SigV4 signer wraps. The EB instance role holds es:ESHttp* on the
  # v4 ARN (eb_opensearch_v4). In-deploy safety: EB rolling deploy + /health
  # auto-rollback.
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "ELASTIC_HOST"
    value     = module.opensearch_v4.endpoint
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

  # ADR 031 read-shadow REMOVED at the ADR-041 cutover: v4 (addressr6)
  # is now PRIMARY (ELASTIC_HOST above), so mirroring v4 to v4 would be redundant.
  # The soak ran 33.8 h and all five Soak Gate criteria passed: mirror parity 1.001,
  # zero failures with sustained doc parity, p90 ratio flattened to 1.046x within
  # the 10% band on 12/12 buckets, >=24 h spanning two business peaks, and k6 green
  # p95 at 1.05x a freshly measured blue baseline against a 1.5x gate.
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

# ADR 035 Phase 2: the v3 OpenSearch 3.5 domain — the PREVIOUS production search
# domain since the v2 (addressr4, 2.19) cutover 2026-07-14 (Stage 5) and
# decommission (step 6). Provisioned via the blue/green pattern that took v1→v2→v3.
# m6g.large.search x 2 / 20 GB proven steady-state class (Lucene 10 may reduce the
# footprint but we don't assume it — right-size later if measured, via
# from-scratch/blue-green, never an ad-hoc resize under load per ADR 030).
# ELASTIC_HOST (EB settings above) now sources module.opensearch_v4.endpoint; this module is the rollback target.
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
  # ADR 041: wired to SNS. Until then this alarm reached nobody.
  alarm_actions     = [aws_sns_topic.search_ops.arn]
  ok_actions        = [aws_sns_topic.search_ops.arn]
  alarm_description = "ADR 035: v3 OpenSearch searchable-document count dropped below floor — possible P035-class silent index deletion. Investigate before it self-heals."
}

# ADR 029 Stage 0d: search-parity dashboard. Originally stood up against v1
# before any v2 spend to prove the parity signal at real traffic volume; used
# v2-vs-v3 during the 2.19→3.5 overlap to prove parity before cutover. Since the
# v2 (addressr4) decommission 2026-07-14 (ADR 035 Phase 2 step 6) it was v3-only.
# ADR 041 puts it back into parity duty for the analyzer-migration overlap:
# v3 (addressr5) vs v4 (addressr6), same metrics, same purpose — prove parity
# before cutover. Drops back to single-domain when v3 is decommissioned.
data "aws_caller_identity" "current" {}

locals {
  # ADR 041: v3 AND v4 during the analyzer-migration overlap — this is what the
  # parity dashboard was built for and what it did during the 2.19 to 3.5 overlap.
  # Drops back to v4-only when v3 is decommissioned post-cutover.
  search_parity_domains = [var.elastic_v3_name, var.elastic_v4_name]
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
        title  = "${metric} — ${join(" vs ", local.search_parity_domains)}"
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

# ---------------------------------------------------------------------------
# ADR 041 / P069: generation-4 search domain.
#
# GENERATION 4 RUNS THE SAME ENGINE (OpenSearch 3.5) AS GENERATION 3. This
# generation exists to carry the ADR-041 analyzer change — equivalent synonyms
# plus a synonym-free search analyzer — which cannot be applied to an existing
# index and forces a full ~15M-doc reindex. It is NOT an engine upgrade.
#
# Provisioned QUIET per the migration playbook step 1: no shadow traffic, and the
# EB primary ELASTIC_HOST moved to module.opensearch_v4.endpoint at the ADR-041
# ADR-041 cutover. This module is now the ROLLBACK TARGET, retained warm.
#
# Sized identically to v3 ON PURPOSE. ADR-041's Confirmation makes the green
# index's on-disk size and resident hot-set a pre-cutover GATE rather than a note,
# so the class is measured and then resized, not guessed up front. Provisioning
# larger now would also confound the parity gate: change the analyzer and the
# instance class together and a latency delta is unattributable to either.
# Escalation if the measured hot-set exceeds RAM is m6g.xlarge.search (16 GB),
# decided on the number. Resize is safe (FGAC-off removed the P036 clobber).
#
# The overlap TERMINATES. ADR-035's cost driver is breached in substance if this
# becomes open-ended: decommission v3 after cutover + soak, removing
# module.opensearch_v3, eb_opensearch_v3, gha_v3_loader + policy, the v3 alarm,
# and the elastic_v3_* / v3_searchable_documents_floor vars.
module "opensearch_v4" {
  source = "./modules/opensearch"

  name            = var.elastic_v4_name
  engine_version  = var.elastic_v4_engine_version
  instance_type   = "m6g.large.search"
  instance_count  = 2
  ebs_volume_size = 20

  # Same scoped principals as v3, but with the generation-4 GHA role rather than
  # gha_v3_loader — see the reasoning in oidc.tf.
  allowed_principal_arns = [
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-elasticbeanstalk-ec2-role",
    var.loader_principal_arn,
    aws_iam_role.gha_v4_loader.arn,
  ]

  tags = {
    ManagedBy = "terraform"
    Component = "search"
    Adr       = "041"
  }
}

# ADR 033/041: let the EB app SigV4-call the v4 domain. Granted pre-cutover —
# permission only; EB does not query v4 until ELASTIC_HOST flips. Both halves are
# required: the domain access policy above grants the resource side, this grants
# the identity side. Without it, read-shadow mirroring to v4 returns 403, and
# ADR-031's error classifier SWALLOWS that as UnknownError, so the soak would look
# healthy while mirroring nothing.
resource "aws_iam_role_policy" "eb_opensearch_v4" {
  name = "addressr-opensearch-v4-eshttp"
  role = "aws-elasticbeanstalk-ec2-role"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "es:ESHttp*"
        Resource = "${module.opensearch_v4.arn}/*"
      }
    ]
  })
}

# ADR 041: somewhere for the trip-wire alarms to shout.
#
# Until now the SearchableDocuments alarms declared no alarm_actions and there was
# no SNS topic in the tree at all, so they changed state in the console and reached
# nobody. ADR-035's "v3 drop-alarm armed" and the playbook's "trip-wire for a
# silent index wipe" both assume notification; neither was getting it. That matters
# most during exactly this migration: a ~15M-doc bulk load is long and unattended.
resource "aws_sns_topic" "search_ops" {
  name = "addressr-search-ops"
  tags = {
    ManagedBy = "terraform"
    Component = "search"
    Adr       = "041"
  }
}

resource "aws_sns_topic_subscription" "search_ops_email" {
  topic_arn = aws_sns_topic.search_ops.arn
  protocol  = "email"
  endpoint  = var.ops_alert_email
}

# ADR 041 / P035 trip-wire: absolute floor for generation 4.
#
# Raised to 15M at the ADR-041 cutover. During provision and bulk load the floor
# was held at 1M so a fresh empty domain would clear once the load crossed ~1M:
# an absolute floor cannot both sit near the expected count AND tolerate a load
# that legitimately starts at zero. A low floor catches a full wipe (which goes
# to 0 — the P035 deletion was caught within minutes at floor 1M) but not a
# PARTIAL drop mid-load; partial-drop detection is carried by the rate alarm
# below instead.
#
# EXPECTED STATE, POST-CUTOVER — read this before dismissing an alarm. v4 is
# loaded (16,905,824 docs) and the floor is 15M, so this alarm should go OK
# almost immediately after apply and STAY there. An ALARM here is now a REAL
# signal — a P035-class silent index deletion or a partial drop — not the
# expected empty-domain state it was during the load. That earlier "sits in
# ALARM until the load crosses 1M, and is not something to fix" reasoning
# applied to the 1M provisioning floor and is retired with it. Headroom is
# ~11%; v3 has run at an identical 15M floor against the same corpus since
# 2026-07-14 with no false trip.
resource "aws_cloudwatch_metric_alarm" "v4_searchable_documents_drop" {
  alarm_name  = "addressr-v4-searchable-documents-drop"
  namespace   = "AWS/ES"
  metric_name = "SearchableDocuments"
  dimensions = {
    DomainName = var.elastic_v4_name
    ClientId   = data.aws_caller_identity.current.account_id
  }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  threshold           = var.v4_searchable_documents_floor
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.search_ops.arn]
  ok_actions          = [aws_sns_topic.search_ops.arn]
  alarm_description   = "ADR 041: v4 OpenSearch searchable-document count dropped below floor — possible P035-class silent index deletion. Floor raised to 15M at the ADR-041 cutover."
}

# ADR 041: partial-drop detection, which no absolute floor delivers during a load.
# Metric math on the period-over-period change: fires when the document count
# FALLS at any absolute level, so it works from the first document through to
# steady state. This is what the playbook's learning actually wants.
resource "aws_cloudwatch_metric_alarm" "v4_searchable_documents_rate_drop" {
  alarm_name          = "addressr-v4-searchable-documents-falling"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  threshold           = -1000
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.search_ops.arn]
  alarm_description   = "ADR 041: v4 searchable-document count FELL between periods. Catches a partial index drop at any absolute level, which the absolute floor cannot do during a load that starts at zero."

  metric_query {
    id          = "delta"
    expression  = "DIFF(docs)"
    label       = "SearchableDocuments period-over-period change"
    return_data = true
  }
  metric_query {
    id = "docs"
    metric {
      namespace   = "AWS/ES"
      metric_name = "SearchableDocuments"
      period      = 300
      stat        = "Minimum"
      dimensions = {
        DomainName = var.elastic_v4_name
        ClientId   = data.aws_caller_identity.current.account_id
      }
    }
  }
}

# ADR 031 shadow liveness alarm REMOVED at the ADR-041 cutover. It watched v4's
# SearchRate as a dead-mirror detector while v4 was the shadow target. Now that v4
# is primary its search rate is production's, not the shadow's, so a 0.1/node/min
# floor is meaningless. Removed rather than repointed: v3 is being decommissioned.
