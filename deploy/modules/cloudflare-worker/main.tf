# Cloudflare Worker module (ADR 032 / P042).
#
# Provisions the addressr API key proxy worker described in ADR 018, bringing
# its source under version control (the gap ADR 018 line 50/63 named). Mirrors
# the module-encapsulated IaC pattern ADR 030 established for the search tier:
# ad-hoc cloudflare_workers_* resources outside this module constitute a
# confirmation violation (ADR 032 Confirmation).
#
# Resources:
#   1. cloudflare_workers_script.proxy
#        — the worker script itself, ES modules format
#        — entry: worker.js; additional modules: ip-matcher.mjs, safe-ips.mjs
#        — compatibility_date pinned via var.compatibility_date
#
#   2. cloudflare_workers_secret.rapidapi_key
#        — populates env.RAPIDAPI_KEY consumed by worker.js
#        — replaces the prior hardcoded key in the dashboard worker source
#          (ADR 018 line 48 Bad consequence)
#
#   3. cloudflare_workers_route.api_addressr_io
#        — route binding `api.addressr.io/*` → proxy
#        — the workers.dev fallback URL is auto-provisioned by the script
#          resource; no separate route resource is required for it
#
# Cutover: `terraform import` the existing dashboard worker (script + route)
# once before the first apply; expect a no-op plan after import (ADR 032
# Decision Outcome / Cutover mechanism).

resource "cloudflare_workers_script" "proxy" {
  account_id         = var.account_id
  script_name        = var.script_name
  main_module        = var.main_module
  compatibility_date = var.compatibility_date

  # Deployed content is the esbuild bundle (single ES module), NOT the raw
  # worker.js. The CF Terraform provider's cloudflare_workers_script (v5)
  # accepts only a single `content` string — there is no multi-module upload
  # attribute — so worker.js's `import './ip-matcher.mjs'` / './safe-ips.mjs'
  # must be bundled into one file first. `npm run build:worker` (esbuild
  # --bundle --format=esm) produces worker.bundled.js; deploy/deploy.sh runs
  # it before terraform. The bundle is a deploy-time artifact (gitignored),
  # derived from the same source the unit tests import — so tested behaviour
  # and deployed behaviour cannot drift. See ADR 032 (amended 2026-05-25).
  content = file("${path.module}/${var.worker_dir}/${var.worker_bundle}")

  bindings = [
    {
      name = "RAPIDAPI_KEY"
      type = "secret_text"
      text = var.rapidapi_key
    },
  ]
}

resource "cloudflare_workers_route" "api_addressr_io" {
  zone_id = var.zone_id
  pattern = var.route_pattern
  script  = cloudflare_workers_script.proxy.script_name
}
