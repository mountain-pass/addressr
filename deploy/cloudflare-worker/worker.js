// Cloudflare Worker — addressr API key proxy (ADR 018, version-controlled via ADR 032 / P042).
//
// Behaviour:
//   1. Receives requests at https://api.addressr.io/* and the workers.dev
//      fallback https://cool-bush-ca66.addressr-key-provider.workers.dev/*
//   2. Allows the request through if either:
//        a. Referer/Origin hostname is on `safeHosts` (browser sessions from
//           the addressr.io SPA — JTBD-200 boundary for unauthenticated
//           browser traffic), OR
//        b. CF-Connecting-IP is in `safeIps` (Uptime Robot per ADR 016, and
//           any other IP-stable monitoring).
//   3. Rewrites the upstream host to addressr.p.rapidapi.com and injects the
//      RapidAPI key from `env.RAPIDAPI_KEY` (a Cloudflare Worker secret
//      provisioned by the Terraform module in deploy/modules/cloudflare-worker).
//   4. Fails loud — Response 500 — if `env.RAPIDAPI_KEY` is missing. Per
//      JTBD-200 line 25 "Partial configuration fails at startup rather than
//      allowing bypass", a TF rollout that drops the secret must not silently
//      ship an unauthenticated proxy. See ADR 032 Confirmation.
//
// Module shape: ES modules (`export default { fetch }`). Replaces the
// previous classic-handler shape (`addEventListener('fetch', ...)`) the
// dashboard worker used. Cloudflare's V8 isolate supports both; ES modules
// is the contemporary shape and is what `cloudflare_worker_script` in the
// Cloudflare Terraform provider deploys by default.
//
// The 401 response body shape `${origin} not permitted from ${srcIp}` is
// load-bearing — release.yml smoke probes at lines 239-246 assert on the
// "no-origin not permitted" prefix to distinguish the worker layer (ADR 018)
// from the origin layer (ADR 024). Do not change this without updating the
// smoke probe in the same changeset.

import { ipInList } from './ip-matcher.mjs';
import { safeHosts, safeIps } from './safe-ips.mjs';

const UPSTREAM_HOST = 'addressr.p.rapidapi.com';

export default {
  async fetch(request, environment) {
    if (!environment || !environment.RAPIDAPI_KEY) {
      return new Response('RAPIDAPI_KEY not configured', { status: 500 });
    }

    const referer = request.headers.get('Referer');
    const origin = request.headers.get('origin');
    const sourceIp = request.headers.get('CF-Connecting-IP');

    const referenceHost = referer ? safeUrlHost(referer) : undefined;
    const orgHost = origin ? safeUrlHost(origin) : undefined;

    const hostOk =
      (referenceHost && safeHosts.includes(referenceHost)) ||
      (orgHost && safeHosts.includes(orgHost));
    const ipOk = ipInList(sourceIp, safeIps);

    if (!hostOk && !ipOk) {
      return new Response(
        `${referer || origin || 'no-origin'} not permitted from ${sourceIp}`,
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    url.hostname = UPSTREAM_HOST;

    const upstreamRequest = new Request(
      url.toString(),
      new Request(request, {}),
    );
    upstreamRequest.headers.set('x-rapidapi-key', environment.RAPIDAPI_KEY);
    upstreamRequest.headers.set('x-rapidapi-host', UPSTREAM_HOST);

    try {
      const response = await fetch(upstreamRequest);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
      });
    } catch (error) {
      return Response.json(
        { error: error.message },
        {
          status: 500,
        },
      );
    }
  },
};

function safeUrlHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return;
  }
}
