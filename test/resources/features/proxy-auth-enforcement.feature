@rest2 @not-rest @not-nodejs @not-cli
Feature: Proxy auth header enforcement at the origin

    Per ADR 024, when operators front Addressr with a gateway (RapidAPI, Kong,
    Tyk, Apigee, AWS API Gateway, nginx/Caddy, own Cloudflare Worker) the origin
    opts in to rejecting requests that do not present a configured header with a
    configured value. Self-hosted deployments leave both env vars unset and
    behave as before. Discovery routes (/health, /api-docs) remain exempt.

    See also:
      - docs/decisions/024-origin-gateway-auth-header-enforcement.proposed.md
      - docs/problems/009-upstream-backends-openly-callable-bypassing-rapidapi.known-error.md

    Note: ADR 024 Confirmation criteria 3 & 4 (partial-config startup failure
    when exactly one of the env var pair is set) are covered by the
    test/js/proxy-auth.test.js unit test, not this feature file. Cucumber asserts
    live HTTP behaviour; process-startup-fails-with-exit-code is expressed more
    directly as a unit test adjacent to the config-validation module.

    Scenario: Self-hosted default — both env vars unset, no enforcement
        Given proxy auth is not configured
        When the origin is called with path "/addresses?q=sydney"
        Then the origin response status will be 200

    Scenario: Enforcement on — request without the configured header is rejected
        Given proxy auth is configured with header "X-Test-Header" and value "s3cr3t"
        When the origin is called with path "/addresses?q=sydney"
        Then the origin response status will be 401
        And the origin response body will equal
            """
            {"message":"Authentication required"}
            """

    Scenario: Enforcement on — request with wrong header value is rejected
        Given proxy auth is configured with header "X-Test-Header" and value "s3cr3t"
        When the origin is called with path "/addresses?q=sydney" and header "X-Test-Header" of "wrong"
        Then the origin response status will be 401

    Scenario: Enforcement on — request with correct header value is accepted
        Given proxy auth is configured with header "X-Test-Header" and value "s3cr3t"
        When the origin is called with path "/addresses?q=sydney" and header "X-Test-Header" of "s3cr3t"
        Then the origin response status will be 200

    Scenario: /health is exempt from enforcement
        Given proxy auth is configured with header "X-Test-Header" and value "s3cr3t"
        When the origin is called with path "/health"
        Then the origin response status will be 200

    Scenario: /api-docs is exempt from enforcement
        Given proxy auth is configured with header "X-Test-Header" and value "s3cr3t"
        When the origin is called with path "/api-docs"
        Then the origin response status will be 200
