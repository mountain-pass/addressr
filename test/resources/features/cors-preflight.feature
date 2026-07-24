@rest2 @not-nodejs
Feature: CORS preflight caching at the origin

    Per ADR 037 (and problem P023), when CORS is enabled the origin answers CORS
    preflight (OPTIONS) requests with Access-Control-Max-Age so cross-origin
    browsers cache the preflight instead of re-running it on every GET. The
    OPTIONS handler is registered before proxyAuthMiddleware (ADR 024), so an
    unauthenticated preflight — which carries no gateway secret — is answered
    204, not 401. The data-carrying methods still fall through to
    proxyAuthMiddleware and remain enforced (covered by
    proxy-auth-enforcement.feature).

    Risk remediation R1 (STOP 6/25 → within appetite): the preflight-cache
    handler is gated behind the SAME ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN opt-in
    as the sibling CORS response headers. Access-Control-Max-Age is inert
    without Access-Control-Allow-Origin, so when CORS is NOT enabled the origin
    emits no Max-Age and the OPTIONS auth-exemption does not exist.

    See also:
      - docs/decisions/037-cors-preflight-caching-policy.proposed.md
      - docs/problems/known-error/023-cross-origin-root-not-browser-cached.md

    Scenarios that toggle env vars mid-run are tagged @not-cli2 for the same
    reason as proxy-auth-enforcement.feature (P010): the cli2 profile spawns
    the origin as a separate preinstalled binary whose environment the step
    definitions cannot mutate.

    @not-cli2
    Scenario: Preflight returns 204 with cache directives when CORS is enabled
        Given CORS is configured with allow-origin "https://example.com"
        And proxy auth is not configured
        When the origin receives an OPTIONS preflight for path "/"
        Then the origin response status will be 204
        And the origin response header "Access-Control-Max-Age" will be "86400"
        And the origin response header "Access-Control-Allow-Methods" will be "GET,OPTIONS"

    @not-cli2
    Scenario: Preflight is inert when CORS is not enabled (R1)
        # R1: without ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN the preflight-cache
        # handler is not registered, so no Max-Age is emitted (prior behaviour).
        Given CORS is not configured
        And proxy auth is not configured
        When the origin receives an OPTIONS preflight for path "/"
        Then the origin response header "Access-Control-Max-Age" will be absent

    @not-cli2
    Scenario: Preflight is exempt but data methods stay enforced when proxy auth is on
        # ADR 037 ordering invariant / JTBD-200 guard: with CORS enabled the
        # OPTIONS exemption must not open a data path. Pins the pairing — OPTIONS
        # preflight is answered 204 (not 401) while a data GET without the secret
        # still 401s.
        Given CORS is configured with allow-origin "https://example.com"
        And proxy auth is configured with header "X-Test-Header" and value "s3cr3t"
        When the origin receives an OPTIONS preflight for path "/"
        Then the origin response status will be 204
        And the origin response header "Access-Control-Max-Age" will be "86400"
        When the origin is called with path "/addresses?q=x"
        Then the origin response status will be 401
