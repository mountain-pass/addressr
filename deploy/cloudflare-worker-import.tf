# TRANSIENT — delete after the first successful apply imports + updates the worker.
#
# ADR 032 / P042 cutover via Terraform import blocks (TF >= 1.5). On the release
# that lands the cloudflare_worker module, `terraform apply` processes these
# blocks: it imports the existing dashboard-managed worker script + route into
# state, THEN applies the config diff (content -> esbuild bundle, add the
# RAPIDAPI_KEY secret binding, set compatibility_date + main_module, refresh
# safeIps). cloudflare_workers_script is keyed on (account_id, script_name), so
# this is an in-place update, NOT a destroy/recreate — no edge outage.
#
# IDs captured 2026-05-23 via the Cloudflare API:
#   account_id = 44ee5fee98c702f8b64e2d81e557c876
#   zone_id    = f0a901f4fb16bdcdf73cad942cc4e205
#   script     = cool-bush-ca66
#   route_id   = aa5d80460d384047928b27d1c4730250  (pattern api.addressr.io/*)
#
# After the apply succeeds and the release.yml worker smoke probes pass
# (referer -> 200; no-referer -> "no-origin not permitted"), DELETE this file in
# a follow-up commit. Leaving it is harmless (import is a no-op once the
# resources are in state) but it is dead config; ADR 032 calls for its removal.

import {
  to = module.cloudflare_worker.cloudflare_workers_script.proxy
  id = "44ee5fee98c702f8b64e2d81e557c876/cool-bush-ca66"
}

import {
  to = module.cloudflare_worker.cloudflare_workers_route.api_addressr_io
  id = "f0a901f4fb16bdcdf73cad942cc4e205/aa5d80460d384047928b27d1c4730250"
}
