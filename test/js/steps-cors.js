/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable security/detect-object-injection -- env var name is a compile-time constant */
import { expect } from 'chai';
import { After, Given, Then, When } from '@cucumber/cucumber';

// P023 / ADR 037: exercise the CORS preflight (OPTIONS) handler over real HTTP.
// Reuses the proxy-auth Given steps (steps-proxy-auth.js) and the shared
// `the origin response status will be {int}` Then step.

// Risk remediation R1: the preflight-cache handler is gated behind
// ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN. Toggle it per-scenario so the
// enabled (204 + Max-Age) and inert (no Max-Age) paths are both exercised.
const ORIGIN_VAR = 'ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN';

function clearCors() {
  delete process.env[ORIGIN_VAR];
}

After(function () {
  clearCors();
});

Given('CORS is configured with allow-origin {string}', function (origin) {
  process.env[ORIGIN_VAR] = origin;
});

Given('CORS is not configured', function () {
  clearCors();
});

When(
  'the origin receives an OPTIONS preflight for path {string}',
  async function (path) {
    this.lastResponse = await fetch(`${this.driver.url}${path}`, {
      method: 'OPTIONS',
    });
    this.lastResponseBody = await this.lastResponse.text();
  },
);

Then(
  'the origin response header {string} will be {string}',
  function (headerName, expected) {
    expect(this.lastResponse.headers.get(headerName)).to.equal(expected);
  },
);

Then(
  'the origin response header {string} will be absent',
  function (headerName) {
    // fetch() returns null for a header that was never sent.
    expect(this.lastResponse.headers.get(headerName)).to.equal(null);
  },
);
