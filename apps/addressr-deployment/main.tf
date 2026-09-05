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

  # P095 / R021: make terraform CONTENT-AWARE, not just name-aware.
  #
  # Without this, the key is the only thing terraform compares. A bundle whose
  # contents disagree with the version in its own name produces NO plan diff, so
  # the deploy can label the environment one version while installing another
  # and `terraform plan` shows nothing. That silent identity lie is worse than
  # the loud failure P095 records, and it was the second of two preconditions
  # the push-tier deploy axis never checked. The first — that the version being
  # deployed is actually published — is handled in deploy/resolve-version.sh.
  #
  # HASHES THE MANIFEST, NOT THE ZIP, and that is the load-bearing choice.
  # deploy.sh builds the bundle from exactly one file, deployment/package.json,
  # whose content is a pure function of the package name and the resolved
  # version. The zip WRAPPING it is not: it carries file mtimes, so its bytes
  # differ on every run even when the manifest is byte-identical. Hashing the
  # zip would therefore produce a diff on every single apply — a perpetual
  # false positive, which is the fastest way to get a real diff ignored.
  #
  # `source_hash` rather than `etag`: terraform compares `etag` against the
  # object's actual S3 ETag, so any value that is not the MD5 of the uploaded
  # zip diffs forever. `source_hash` is compared against state instead, which is
  # what makes hashing the input rather than the artefact possible at all.
  #
  # IN-PLACE, NOT A REPLACEMENT — established against the pinned provider rather
  # than assumed. In hashicorp/aws v5.21.0 (deploy/.terraform.lock.hcl),
  # internal/service/s3/object.go declares `source_hash` as
  # `{Type: schema.TypeString, Optional: true}` with no ForceNew; only `bucket`
  # and `key` force replacement. `resourceObjectCustomizeDiff` marks `version_id`
  # and `etag` newly computed when it changes. So adding this to a resource
  # already in state updates it in place and cannot cascade into
  # `aws_elastic_beanstalk_application_version`, whose `key` IS ForceNew.
  #
  # Worth keeping because the reasoning is not reconstructible from the plan: a
  # replacement here would make the object's id unknown, force the application
  # version, and the provider would then refuse to delete one that is in use.
  # `version_label` could still not move — it resolves from
  # `var.elasticapp_version`, which is config — so the failure mode would be a
  # red apply with production untouched, not a fleet bounce.
  source_hash = filemd5("${path.module}/deployment/package.json")
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

  # ADR 041: the EB primary points at the v4 domain (addressr6, OpenSearch 3.5,
  # equivalent-synonym analyzer) over IAM/SigV4.
  #
  # THERE IS NO ROLLBACK DOMAIN. The v3 standby (addressr5) was decommissioned
  # 2026-08-02 over two applies: apply 1 (2026-08-02) severed the EB instance
  # role's es:ESHttp* grant and dropped it from v3's access policy; apply 2
  # destroyed the domain, its alarm, the gha_v3_loader role and the elastic_v3_*
  # vars. Setting this value to a v3 endpoint does nothing - there is no domain.
  #
  # Why it went. The rollback MECHANISM was exercised and timed 2026-08-02 at
  # 6m36s (ADR-029 Confirmation, commits 43b3309 / f295bd8), so the path is
  # proven rather than assumed. The standby's only UNIQUE cover was "the ADR-041
  # analyzer is wrong", and that was retired by a 33.8h read-shadow soak with all
  # five criteria passed, an 800-pair relevance differential at 793/800 top-1
  # unchanged, the SSLA baseline, and production traffic post-cutover. The P079
  # retention gate was met at 157% of threshold on a denominator computed from 20
  # representative pre-cutover days, with both trip-wire alarms OK. Retaining it
  # further was a certain recurring cost against a retired hazard.
  #
  # What replaces it. For index loss or a red cluster ON THIS DOMAIN, recovery is
  # an AWS automated snapshot restore: the cs-automated-enc repository is present
  # and taking hourly snapshots of addressr and addressr-localities (69 held as of
  # 2026-08-02, spanning ~3 days since the domain was built; AWS's service default
  # retention is 14 days, which is policy rather than an observed span, so do not
  # infer a pre-cutover restore point). Note the scope honestly — automated
  # snapshots restore IN PLACE to the same domain. They do NOT cover domain-level
  # loss, they are not a cross-domain restore, and they cannot undo a bad ANALYZER
  # decision, because every snapshot carries the analyzer that took it. For that
  # last case recovery is a rebuild from G-NAF.
  #
  # The rollback MECHANISM was exercised and timed 2026-08-02 at 6m36s
  # (ADR-029 Confirmation, commits 43b3309 / f295bd8) before being retired here.
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

  # ADR 031 read-shadow REMOVED at the ADR-041 cutover. v4 (addressr6) is the
  # primary, so mirroring v4 to v4 would be redundant. Re-enable only for the
  # next migration, when a new green domain needs warming.
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

# ADR-064 — local commercial state for the Addressr-managed channel. The
# Oceania primary keeps authoritative request-time writes near the launch
# traffic measured by ADR-077; activation still depends on its measured gate.
resource "cloudflare_d1_database" "managed_channel" {
  account_id            = var.cloudflare_account_id
  name                  = "addressr-managed-channel"
  primary_location_hint = "oc"

  read_replication = {
    mode = "disabled"
  }
}

output "managed_channel_d1_id" {
  value       = cloudflare_d1_database.managed_channel.id
  description = "D1 database identifier used by deploy.sh to apply versioned managed-channel migrations."
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

  customer_database_id             = cloudflare_d1_database.managed_channel.id
  customer_rate_limit_namespace_id = var.customer_rate_limit_namespace_id
  customer_rate_limit              = var.customer_rate_limit
  demo_rate_limit_namespace_id     = var.demo_rate_limit_namespace_id
  demo_rate_limit                  = var.demo_rate_limit
  monitor_rate_limit_namespace_id  = var.monitor_rate_limit_namespace_id
  monitor_rate_limit               = var.monitor_rate_limit
  managed_origin_urls              = var.managed_origin_urls
  managed_channel_enabled          = var.managed_channel_enabled
  managed_organization_allowlist   = var.managed_organization_allowlist
  origin_auth_header               = var.proxy_auth_header
  origin_auth_value                = var.proxy_auth_value
  billable_statuses                = var.managed_billable_statuses
  clerk_publishable_key            = var.clerk_publishable_key
  clerk_jwt_key                    = var.clerk_jwt_key
  stripe_secret_key                = var.stripe_secret_key
  stripe_webhook_secret            = stripe_webhook_endpoint.managed_channel.secret
  stripe_plan_catalogue            = local.worker_stripe_plan_catalogue
  stripe_payment_method_types      = var.stripe_payment_method_types
  stripe_meter_event_name          = stripe_billing_meter.addressr_requests.event_name
  stripe_meter_id                  = stripe_billing_meter.addressr_requests.id
  managed_app_url                  = var.managed_app_url
}

# ADR-060 — persistent website hosting resources live in the existing
# production state because addressr.io and api.addressr.io share one zone.
# Website assets are uploaded separately by release.yml with Wrangler; omitting
# `source` is what keeps this a Direct Upload project with no git integration.
resource "cloudflare_pages_project" "website" {
  provider = cloudflare.pages

  account_id        = var.cloudflare_account_id
  name              = "addressr"
  production_branch = "master"
}

resource "cloudflare_pages_domain" "website" {
  provider = cloudflare.pages

  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.website.name
  name         = "addressr.io"
}

resource "cloudflare_pages_domain" "website_app" {
  provider = cloudflare.pages

  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.website.name
  name         = "app.addressr.io"
}

# Adopt the existing apex record through the release-PR plan/apply. Terraform
# then performs the Netlify-to-Pages target change in place instead of trying to
# create a duplicate production record.
resource "cloudflare_dns_record" "website_apex" {
  provider = cloudflare.pages

  depends_on = [cloudflare_pages_domain.website]

  zone_id = var.cloudflare_zone_id
  name    = "addressr.io"
  type    = "CNAME"
  content = "${cloudflare_pages_project.website.name}.pages.dev"
  ttl     = 1
  proxied = true
}

resource "cloudflare_dns_record" "website_app" {
  provider = cloudflare.pages

  depends_on = [cloudflare_pages_domain.website_app]

  zone_id = var.cloudflare_zone_id
  name    = "app.addressr.io"
  type    = "CNAME"
  content = "${cloudflare_pages_project.website.name}.pages.dev"
  ttl     = 1
  proxied = true
}

# ADR-066: Clerk's production frontend API, account portal and mail records.
# These must remain DNS-only so Clerk can verify them and issue certificates.
resource "cloudflare_dns_record" "clerk" {
  provider = cloudflare.pages

  for_each = {
    "clerk"           = "frontend-api.clerk.services"
    "accounts"        = "accounts.clerk.services"
    "clkmail"         = "mail.h9zbjfqi9ui4.clerk.services"
    "clk._domainkey"  = "dkim1.h9zbjfqi9ui4.clerk.services"
    "clk2._domainkey" = "dkim2.h9zbjfqi9ui4.clerk.services"
  }

  zone_id = var.cloudflare_zone_id
  name    = "${each.key}.addressr.io"
  type    = "CNAME"
  content = each.value
  ttl     = 1
  proxied = false
}

import {
  to = cloudflare_dns_record.website_apex
  id = "${var.cloudflare_zone_id}/7996e1b39da5b6473cd6b4ace99d8fd9"
}

# ADR 029 Stage 0d: search-parity dashboard. Built to compare two domains during
# a migration overlap, and it has served three: v1-vs-v2, v2-vs-v3, and most
# recently v3-vs-v4 for the ADR 041 analyzer migration. It is SINGLE-DOMAIN again
# as of the v3 (addressr5) decommission 2026-08-02 — v4 is the only search domain.
# The next migration puts it back into parity duty by adding the new generation to
# local.search_parity_domains below; nothing else needs to change.
data "aws_caller_identity" "current" {}

locals {
  # v4 only. The ADR 041 analyzer-migration overlap ended with the v3 decommission
  # on 2026-08-02. Add the next generation's name here to re-enter parity duty.
  search_parity_domains = [var.elastic_v4_name]
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
# Provisioned QUIET per the migration playbook step 1, then promoted to primary
# at the ADR-041 cutover. This module is THE production search domain.
#
# Sized identically to v3 ON PURPOSE. ADR-041's Confirmation makes the green
# index's on-disk size and resident hot-set a pre-cutover GATE rather than a note,
# so the class is measured and then resized, not guessed up front. Provisioning
# larger now would also confound the parity gate: change the analyzer and the
# instance class together and a latency delta is unattributable to either.
# Escalation if the measured hot-set exceeds RAM is m6g.xlarge.search (16 GB),
# decided on the number. Resize is safe (FGAC-off removed the P036 clobber).
#
# The overlap TERMINATED 2026-08-02, as this block required. v3 was decommissioned
# over two applies once the P079 retention gate was met - module.opensearch_v3,
# eb_opensearch_v3, gha_v3_loader + policy + output, the v3 alarm and the
# elastic_v3_* / v3_searchable_documents_floor vars are all gone. This is now the
# SOLE search domain. Recovery for index loss or a red cluster here is an AWS
# automated snapshot restore (cs-automated-enc, hourly, in-place to this domain
# only); domain-level loss or a wrong-analyzer decision is a rebuild from G-NAF.
module "opensearch_v4" {
  source = "./modules/opensearch"

  name            = var.elastic_v4_name
  engine_version  = var.elastic_v4_engine_version
  instance_type   = "m6g.large.search"
  instance_count  = 2
  ebs_volume_size = 20

  # Scoped principals: EB app instance role, local operator loader, and the
  # generation-4 GHA OIDC loader role — see the reasoning in oidc.tf.
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
# The NAME is historical and must not change: renaming forces replacement, and
# replacement drops the CONFIRMED email subscription below, leaving the P035
# silent-index-wipe trip-wire with no delivery path until someone clicks a link
# in an email. Tags update in place, so they carry the dual purpose instead.
resource "aws_sns_topic" "search_ops" {
  name = "addressr-search-ops"

  # Replacement drops the CONFIRMED email subscription, and an SNS email
  # subscription needs a human to click a link before it delivers again. So a
  # replacement silently disarms the P035 trip-wire for as long as nobody
  # notices. Refuse the apply rather than detect the rename afterwards.
  lifecycle {
    prevent_destroy = true
  }

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

# ADR-089: the managed-channel fault-notification terminus. APPLY 1 WAS
# ATTEMPTED ON 2026-09-06 AND FAILED. The three resources that stood here —
# `cloudflare_email_routing_settings.zone` and two
# `cloudflare_email_routing_address` — are withdrawn, NOT abandoned, and not
# reversed as a decision: alert coverage returns to MISSING, which is the state
# ADR-089 already records as accurate while the terminus is unbuilt.
#
# TWO CAUSES, both measured from the failed apply's log, neither fixable here:
#   1. `cloudflare_email_routing_settings` is broken in the provider. It errors
#      converting the API RESPONSE — "Struct defines fields not found in object:
#      support_subaddress". Upstream issue 7301, introduced in 5.23.0, still
#      present in 5.24.0 which is the latest 5.x and what the lockfile carries.
#      Fix PR 7302 is open and unmerged.
#   2. Both address creates returned 403 "Authentication error". The deploy
#      token has no Email Routing write scope.
#
# LEFT UNRESOLVED, and this is the part that decays: the settings resource
# failed converting the RESPONSE, so the enable call may have SUCCEEDED
# server-side while Terraform recorded nothing. If it did, the zone may now be
# routing-enabled with no rule, and may carry a SECOND apex SPF record — the
# apex already has `v=spf1 include:spf.efwd.registrar-servers.com ~all`, and a
# second one is a permanent SPF permerror, silently, which would poison the very
# terminus this decision chose. Neither is visible from the tree.
#
# The tickets carry this, not this comment. Problem 144 tracks the blocked
# Terraform route as a known error; problem 145 tracks the unknown zone state,
# and it is the urgent one because it decays. ADR-051 — a note only a
# maintainer reading this file would find is not a control.
#
# DO NOT REBUILD until ADR-089 is ratified. Declaring these against an
# unconfirmed decision is the exposure ADR-074 exists to close, and the
# ratification drain is where the finding above gets weighed.

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
