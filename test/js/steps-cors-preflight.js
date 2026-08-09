/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable security/detect-object-injection -- env var names are compile-time constants */
import { expect } from 'chai';
import { After, Given, Then, When } from '@cucumber/cucumber';
import { inject } from 'light-my-request';
import { buildRest2App } from '../../packages/addressr/src/waycharter-server.js';

// WHY THESE STEPS BUILD THEIR OWN APP RATHER THAN USING this.driver.
//
// ADR-037 gates the whole `app.options` registration behind
// ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN being defined, and that decision is made
// once, at buildRest2App() time. The rest2 profile starts one server in
// BeforeAll and keeps it for the run, so toggling the env var mid-scenario
// cannot move a CORS-disabled app into a CORS-enabled one. Proxy auth gets away
// with it because proxyAuthMiddleware() is registered unconditionally and reads
// the env per request; CORS cannot.
//
// So each scenario builds a fresh app with the env already set and drives it
// through light-my-request, the same mechanism AddressrRest2EmbeddedDriver
// uses. That is a real trip through the actual express stack — the middleware
// chain, the registration order, and the RegExp path in `app.options(/.*/)` —
// which is exactly the surface that needs to be exercised. It is not a socket,
// and that is the one thing it does not prove.

const ORIGIN_VAR = 'ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN';
const MAX_AGE_VAR = 'ADDRESSR_ACCESS_CONTROL_MAX_AGE';
const METHODS_VAR = 'ADDRESSR_ACCESS_CONTROL_ALLOW_METHODS';
const AUTH_HEADER_VAR = 'ADDRESSR_PROXY_AUTH_HEADER';
const AUTH_VALUE_VAR = 'ADDRESSR_PROXY_AUTH_VALUE';

const ALL_VARS = [
  ORIGIN_VAR,
  MAX_AGE_VAR,
  METHODS_VAR,
  AUTH_HEADER_VAR,
  AUTH_VALUE_VAR,
];

function clearCorsEnvironment() {
  for (const name of ALL_VARS) delete process.env[name];
}

After(function () {
  clearCorsEnvironment();
  this.corsApp = undefined;
});

Given('CORS is not enabled at the origin', function () {
  clearCorsEnvironment();
  this.corsApp = buildRest2App();
});

Given('CORS is enabled at the origin', function () {
  clearCorsEnvironment();
  process.env[ORIGIN_VAR] = '*';
  this.corsApp = buildRest2App();
});

Given(
  'CORS is enabled and proxy auth is configured with header {string} and value {string}',
  function (header, value) {
    clearCorsEnvironment();
    process.env[ORIGIN_VAR] = '*';
    process.env[AUTH_HEADER_VAR] = header;
    process.env[AUTH_VALUE_VAR] = value;
    // Order matters: the app must be built AFTER the env is set, because both
    // the CORS registration and the proxy-auth config are read during build.
    this.corsApp = buildRest2App();
  },
);

When(
  'a preflight {string} request is made to {string}',
  async function (method, path) {
    this.corsResponse = await inject(this.corsApp, { method, url: path });
  },
);

When('a {string} request is made to {string}', async function (method, path) {
  this.corsResponse = await inject(this.corsApp, { method, url: path });
});

Then('the response status will be {int}', function (expected) {
  expect(this.corsResponse.statusCode).to.equal(expected);
});

Then(
  'the response header {string} will be {string}',
  function (name, expected) {
    const actual = this.corsResponse.headers[name.toLowerCase()];
    expect(String(actual)).to.equal(expected);
  },
);

Then('the response header {string} will be absent', function (name) {
  expect(this.corsResponse.headers[name.toLowerCase()]).to.equal(undefined);
});
