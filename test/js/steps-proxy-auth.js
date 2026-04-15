/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable security/detect-object-injection -- env var names are compile-time constants */
import { expect } from 'chai';
import { After, Given, Then, When } from '@cucumber/cucumber';

const HEADER_VAR = 'ADDRESSR_PROXY_AUTH_HEADER';
const VALUE_VAR = 'ADDRESSR_PROXY_AUTH_VALUE';

function clearProxyAuth() {
  delete process.env[HEADER_VAR];
  delete process.env[VALUE_VAR];
}

After(function () {
  clearProxyAuth();
});

Given('proxy auth is not configured', function () {
  clearProxyAuth();
});

Given(
  'proxy auth is configured with header {string} and value {string}',
  function (header, value) {
    process.env[HEADER_VAR] = header;
    process.env[VALUE_VAR] = value;
  },
);

When('the origin is called with path {string}', async function (path) {
  this.lastResponse = await fetch(`${this.driver.url}${path}`);
  this.lastResponseBody = await this.lastResponse.text();
});

When(
  'the origin is called with path {string} and header {string} of {string}',
  async function (path, headerName, headerValue) {
    this.lastResponse = await fetch(`${this.driver.url}${path}`, {
      headers: { [headerName]: headerValue },
    });
    this.lastResponseBody = await this.lastResponse.text();
  },
);

Then('the origin response status will be {int}', function (expected) {
  expect(this.lastResponse.status).to.equal(expected);
});

Then('the origin response body will equal', function (expected) {
  expect(JSON.parse(this.lastResponseBody)).to.deep.equal(JSON.parse(expected));
});
