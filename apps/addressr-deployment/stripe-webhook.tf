# ADR-069: Terraform owns the destination and keeps its generated signing
# secret on the existing sensitive Worker binding path. This does not enable
# customer access or make the dormant catalogue available for sale.
resource "stripe_webhook_endpoint" "managed_channel" {
  url         = "https://api.addressr.io/managed/stripe-webhook"
  description = "Addressr managed subscription projection"
  enabled_events = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
  ]
}
