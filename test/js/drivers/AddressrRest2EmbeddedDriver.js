import { waychaser } from '@mountainpass/waychaser';
import { inject } from 'light-my-request';
import { buildRest2App } from '../../../src/waycharter-server';
import { AddressrRest2Driver } from './AddressrRest2Driver';

// Adapt light-my-request's response to the minimal WHATWG-fetch Response shape
// @mountainpass/waychaser consumes (headers.get, text(), status, ok, url).
// This lets waychaser drive the real v2 app in-process with no socket.
function injectFetch(app) {
  return async function fetch(url, options = {}) {
    const requestUrl = new URL(url.toString());
    const response = await inject(app, {
      method: options.method || 'GET',
      url: requestUrl.pathname + requestUrl.search,
      // Preserve the embedded authority so any host-based link generation
      // stays self-consistent with the base waychaser follows against.
      headers: { host: requestUrl.host, ...options.headers },
      payload: options.body,
    });
    const headers = new Map();
    for (const [key, value] of Object.entries(response.headers)) {
      headers.set(
        key.toLowerCase(),
        Array.isArray(value) ? value.join(', ') : String(value),
      );
    }
    return {
      status: response.statusCode,
      statusText: response.statusMessage || '',
      ok: response.statusCode >= 200 && response.statusCode < 300,
      redirected: false,
      type: 'basic',
      url: requestUrl.toString(),
      headers: {
        get(name) {
          return headers.get(name.toLowerCase());
        },
      },
      async text() {
        return response.payload;
      },
    };
  };
}

// Fast in-process v2 test driver. Replaces the removed v1 AddressrEmbeddedDriver
// (ADR-036). Drives the REAL v2 Express app (buildRest2App) through the REAL
// @mountainpass/waychaser HATEOAS client via a light-my-request-injecting fetch
// — no socket, no separate process, and no reimplementation of v2 link logic
// (so it cannot drift from the shipped contract).
export class AddressrRest2EmbeddedDriver extends AddressrRest2Driver {
  constructor() {
    super('http://embedded');
    this.waychaser = waychaser.defaults({
      fetch: injectFetch(buildRest2App()),
    });
  }

  async getApiRoot() {
    return this.waychaser(this.url);
  }
}
