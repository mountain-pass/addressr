# ADR-085: public plan identity is reviewable; commercial terms remain in the
# protected release variable defined in vars.tf.
locals {
  stripe_plan_names = {
    basic = "BASIC"
    pro   = "PRO"
    ultra = "ULTRA"
    mega  = "MEGA"
  }
  stripe_per_unit_plans = toset(["basic", "pro"])
  stripe_tiered_plans   = toset(["ultra", "mega"])
}

resource "stripe_billing_meter" "addressr_requests" {
  display_name = "Addressr requests"
  event_name   = "addressr_request"

  default_aggregation {
    formula = "sum"
  }

  customer_mapping {
    type              = "by_id"
    event_payload_key = "stripe_customer_id"
  }

  value_settings {
    event_payload_key = "value"
  }
}

resource "stripe_product" "managed_plan" {
  for_each = local.stripe_plan_names

  name   = "Addressr ${each.value}"
  active = false
}

resource "stripe_price" "per_unit" {
  for_each = local.stripe_per_unit_plans

  product             = stripe_product.managed_plan[each.key].id
  active              = false
  currency            = var.stripe_catalogue_terms[each.key].currency
  billing_scheme      = "per_unit"
  unit_amount_decimal = var.stripe_catalogue_terms[each.key].unit_amount_decimal
  lookup_key          = "addressr-${each.key}-monthly"

  recurring {
    interval   = "month"
    usage_type = "metered"
    meter      = stripe_billing_meter.addressr_requests.id
  }
}

resource "stripe_price" "tiered" {
  for_each = local.stripe_tiered_plans

  product        = stripe_product.managed_plan[each.key].id
  active         = false
  currency       = var.stripe_catalogue_terms[each.key].currency
  billing_scheme = "tiered"
  tiers_mode     = "graduated"
  lookup_key     = "addressr-${each.key}-monthly"

  tiers {
    up_to               = var.stripe_catalogue_terms[each.key].tiers[0].up_to
    flat_amount_decimal = var.stripe_catalogue_terms[each.key].tiers[0].flat_amount_decimal
    unit_amount_decimal = var.stripe_catalogue_terms[each.key].tiers[0].unit_amount_decimal
  }

  tiers {
    up_to               = var.stripe_catalogue_terms[each.key].tiers[1].up_to
    unit_amount_decimal = var.stripe_catalogue_terms[each.key].tiers[1].unit_amount_decimal
  }

  recurring {
    interval   = "month"
    usage_type = "metered"
    meter      = stripe_billing_meter.addressr_requests.id
  }
}
