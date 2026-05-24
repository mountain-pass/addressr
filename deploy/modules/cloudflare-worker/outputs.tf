output "script_name" {
  value       = cloudflare_workers_script.proxy.script_name
  description = "Worker script name; echoes var.script_name. Convenient for downstream resources or smoke probes."
}

output "workers_dev_url" {
  value       = "https://${var.script_name}.addressr-key-provider.workers.dev"
  description = "The auto-provisioned workers.dev fallback URL. Same worker as the api.addressr.io route binding (ADR 018 line 32). Useful for Uptime Robot fallback monitors."
}

output "route_pattern" {
  value       = cloudflare_workers_route.api_addressr_io.pattern
  description = "The route pattern bound to this worker; echoes var.route_pattern."
}
