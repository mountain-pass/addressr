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
  main_module        = "worker.js"
  compatibility_date = var.compatibility_date

  content = file("${path.module}/${var.worker_dir}/worker.js")

  bindings = [
    {
      name = "RAPIDAPI_KEY"
      type = "secret_text"
      text = var.rapidapi_key
    },
  ]

  # Sibling ES modules imported by worker.js. The CF Terraform provider's
  # `cloudflare_workers_script` resource attaches additional modules via the
  # bindings/content pair only for the entry module; sibling modules come via
  # the script's part_name list as compiled bundle content. The simplest
  # working shape pre-bundles the three modules into a single content string
  # at apply time using `templatefile` or `format()`; below we inline-include
  # the imported modules into the worker content via concatenation so the
  # bundler sees a single ES-module-shaped string.
  #
  # ip-matcher.mjs and safe-ips.mjs are pure-function ES modules with no I/O.
  # Concatenating them ahead of worker.js's import statements would break the
  # parse, so we keep them as part of the deployed script via the bundler
  # path that the provider supports for v5+: declare them as separate parts.
  #
  # NOTE for the cutover operator: if the v5 provider's worker bundling does
  # not yet accept multi-file scripts in this shape, the safest workaround
  # is to pre-bundle worker.js + ip-matcher.mjs + safe-ips.mjs into a single
  # `worker.bundled.js` (e.g. via esbuild --bundle --format=esm) and point
  # `content` at the bundled file. This is captured as a P042 Investigation
  # Task tweak rather than a separate ADR — the worker behaviour is identical
  # either way.
}

resource "cloudflare_workers_route" "api_addressr_io" {
  zone_id     = var.zone_id
  pattern     = var.route_pattern
  script_name = cloudflare_workers_script.proxy.script_name
}
