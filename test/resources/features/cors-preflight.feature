@rest2 @not-rest2 @not-cli2
Feature: CORS preflight caching and the OPTIONS auth exemption

    Per ADR 037, when an operator enables CORS the origin answers preflight
    OPTIONS requests itself with Access-Control-Max-Age and
    Access-Control-Allow-Methods, returning 204 before proxy auth runs. That
    cuts the cross-origin preflight tax without opening a data path: the
    handler is registered only when ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN is
    set, and data-carrying methods still fall through to enforcement.

    See also:
      - docs/decisions/037-cors-preflight-caching-policy.proposed.md
      - docs/decisions/024-origin-gateway-auth-header-enforcement.accepted.md

    WHY THIS FILE EXISTS. ADR 037 cited it in four Confirmation criteria and a
    comment in test/js/__tests__/waycharter-server.test.mjs asserted the
    behaviour was "covered behaviourally" here — but the file did not exist.
    Three of ADR 037's Confirmation criteria were unmet, and every guard that
    did exist was source-inspection over file text, comparing the index of
    "app.options(" against "app.use(proxyAuthMiddleware())". Text comparison
    cannot see a runtime routing or ordering regression: it would pass green
    through a broken preflight. Surfaced by architecture review 2026-08-03,
    while checking whether express 5 was safe to adopt.

    These scenarios build the app per-scenario rather than using the shared
    driver, because the ADR 037 registration is decided at build time and the
    rest2 profile keeps one server for the whole run. See the header comment in
    test/js/steps-cors-preflight.js.

    WHY @not-rest2 AND @not-cli2. Both of those profiles already have a live
    origin — rest2 an in-process one started in BeforeAll, cli2 a separately
    spawned binary. Calling buildRest2App() alongside a running server was
    measured to break the rest2 run: the shared profile went from 38 scenarios
    and 234 steps green to a hard timeout on an unrelated locality scenario,
    and reverting the tag restored it. In cli2 it would be worse than broken —
    it would pass while asserting against an in-process app that is not the
    binary under test, which is the same false-coverage shape this file was
    written to remove. The embedded profile builds a fresh app per scenario by
    design, so that is where these belong. Same profile constraint P010
    records for the proxy-auth scenarios: see
    docs/problems/010-cli2-cucumber-cannot-mutate-origin-env.open.md.

    Scenario: CORS enabled — preflight is answered at the origin with cache directives
        Given CORS is enabled at the origin
        When a preflight "OPTIONS" request is made to "/addresses"
        Then the response status will be 204
        And the response header "Access-Control-Max-Age" will be "86400"
        And the response header "Access-Control-Allow-Methods" will be "GET,OPTIONS"

    Scenario: CORS enabled — the RegExp route matches any path, not just the root
        Given CORS is enabled at the origin
        When a preflight "OPTIONS" request is made to "/addresses/GAACT714845933"
        Then the response status will be 204
        And the response header "Access-Control-Max-Age" will be "86400"

    Scenario: CORS disabled — the handler is not registered and no directive is emitted
        Given CORS is not enabled at the origin
        When a preflight "OPTIONS" request is made to "/addresses"
        Then the response header "Access-Control-Max-Age" will be absent

    Scenario: Proxy auth on — the preflight is exempt but data methods stay enforced
        Given CORS is enabled and proxy auth is configured with header "X-Test-Header" and value "s3cr3t"
        When a preflight "OPTIONS" request is made to "/addresses"
        Then the response status will be 204
        And the response header "Access-Control-Max-Age" will be "86400"

    Scenario: Proxy auth on — a data GET without the secret is still rejected
        Given CORS is enabled and proxy auth is configured with header "X-Test-Header" and value "s3cr3t"
        When a "GET" request is made to "/addresses?q=sydney"
        Then the response status will be 401
