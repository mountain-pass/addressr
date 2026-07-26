/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable unicorn/prevent-abbreviations */
/* eslint-disable max-lines-per-function */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shutdownTimeoutMs,
  installShutdownHandlers,
} from '../../../src/graceful-shutdown.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server2Path = path.resolve(__dirname, '../../../src/server2.js');
const waycharterServerPath = path.resolve(
  __dirname,
  '../../../src/waycharter-server.js',
);

// P067: nothing wired the existing stopServer() to a process signal, so any
// termination dropped in-flight requests. ADR-039's tini init made the container
// stop PROMPTLY; this handler makes it stop GRACEFULLY. The two compose: tini
// delivers the signal, this drains the requests.

/**
 * A stand-in for `process` that records handler registrations and exit codes
 * instead of terminating the test runner.
 */
function fakeProcess() {
  const handlers = new Map();
  const exits = [];
  return {
    handlers,
    exits,
    on(signal, handler) {
      handlers.set(signal, handler);
    },
    exit(code) {
      exits.push(code);
    },
    raise(signal) {
      handlers.get(signal)();
    },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('shutdownTimeoutMs (ADDRESSR_SHUTDOWN_TIMEOUT_MS)', () => {
  it("defaults to 8000ms, under Docker's 10s SIGKILL grace", () => {
    assert.equal(shutdownTimeoutMs({}), 8000);
  });

  it('reads a positive override from the environment', () => {
    assert.equal(
      shutdownTimeoutMs({ ADDRESSR_SHUTDOWN_TIMEOUT_MS: '2500' }),
      2500,
    );
  });

  it('treats an empty value as unset', () => {
    assert.equal(shutdownTimeoutMs({ ADDRESSR_SHUTDOWN_TIMEOUT_MS: '' }), 8000);
  });

  for (const bad of ['abc', '0', '-1']) {
    it(`throws, naming the variable, on the set-but-invalid value '${bad}'`, () => {
      assert.throws(
        () => shutdownTimeoutMs({ ADDRESSR_SHUTDOWN_TIMEOUT_MS: bad }),
        /ADDRESSR_SHUTDOWN_TIMEOUT_MS/,
        'a misconfigured drain budget must fail loudly, not silently degrade',
      );
    });
  }
});

describe('installShutdownHandlers (P067)', () => {
  it('registers a handler for SIGTERM and SIGINT', () => {
    const proc = fakeProcess();
    installShutdownHandlers({ stop: async () => {}, proc });
    assert.deepEqual([...proc.handlers.keys()], ['SIGTERM', 'SIGINT']);
  });

  it('drains via stop() and exits 0 once the drain completes', async () => {
    const proc = fakeProcess();
    let stopped = 0;
    installShutdownHandlers({ stop: async () => (stopped += 1), proc });
    proc.raise('SIGTERM');
    await tick();
    assert.equal(stopped, 1, 'stop() must be called on SIGTERM');
    assert.deepEqual(proc.exits, [0]);
  });

  it('drains on SIGINT too, so a local Ctrl-C does not drop requests', async () => {
    const proc = fakeProcess();
    let stopped = 0;
    installShutdownHandlers({ stop: async () => (stopped += 1), proc });
    proc.raise('SIGINT');
    await tick();
    assert.equal(stopped, 1);
    assert.deepEqual(proc.exits, [0]);
  });

  it('force-closes connections and exits 1 when the drain outlives the budget', async () => {
    const proc = fakeProcess();
    let forced = 0;
    installShutdownHandlers({
      stop: () => new Promise(() => {}), // never resolves — a stuck keep-alive
      force: () => (forced += 1),
      timeoutMs: 20,
      proc,
    });
    proc.raise('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      forced,
      1,
      'the deadline must force the remaining connections closed',
    );
    assert.deepEqual(
      proc.exits,
      [1],
      'a hung drain must not outlive the orchestrator grace window',
    );
  });

  it('does not fire the deadline once the drain has completed', async () => {
    const proc = fakeProcess();
    let forced = 0;
    installShutdownHandlers({
      stop: async () => {},
      force: () => (forced += 1),
      timeoutMs: 20,
      proc,
    });
    proc.raise('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(forced, 0, 'the deadline timer must be cleared on a clean drain');
    assert.deepEqual(proc.exits, [0]);
  });

  it('is idempotent — a repeat signal during the drain exits at once without re-draining', async () => {
    const proc = fakeProcess();
    let stopped = 0;
    let forced = 0;
    installShutdownHandlers({
      stop: () => {
        stopped += 1;
        return new Promise(() => {});
      },
      force: () => (forced += 1),
      timeoutMs: 5000,
      proc,
    });
    proc.raise('SIGTERM');
    proc.raise('SIGTERM');
    await tick();
    assert.equal(stopped, 1, 'stop() must not be invoked twice');
    assert.equal(forced, 1);
    assert.deepEqual(proc.exits, [1], 'an impatient operator gets an immediate exit');
  });

  it('exits 1, force-closing, when stop() rejects', async () => {
    const proc = fakeProcess();
    let forced = 0;
    installShutdownHandlers({
      stop: async () => {
        throw new Error('close failed');
      },
      force: () => (forced += 1),
      proc,
    });
    proc.raise('SIGTERM');
    await tick();
    await tick();
    assert.equal(forced, 1);
    assert.deepEqual(proc.exits, [1]);
  });

  it('validates the drain budget at install time, so a bad env var fails startup', () => {
    const proc = fakeProcess();
    assert.throws(
      () =>
        installShutdownHandlers({
          stop: async () => {},
          proc,
          env: { ADDRESSR_SHUTDOWN_TIMEOUT_MS: 'soon' },
        }),
      /ADDRESSR_SHUTDOWN_TIMEOUT_MS/,
    );
    assert.equal(proc.handlers.size, 0, 'no handler is installed on a bad config');
  });
});

// Source-inspection for the wiring, per the precedent in this directory:
// src/server2.js pulls in the babel-only server module and cannot be imported
// under raw `node --test`.
describe('server entry point wiring (src/server2.js)', () => {
  it('installs the shutdown handlers against stopServer and forceCloseConnections', async () => {
    const source = await readFile(server2Path, 'utf8');
    assert.match(
      source,
      /import\s*\{[^}]*installShutdownHandlers[^}]*\}\s*from\s*'\.\/graceful-shutdown'/,
      'server2.js must import installShutdownHandlers',
    );
    assert.match(
      source,
      /installShutdownHandlers\(\s*\{[\s\S]*stop:\s*stopServer[\s\S]*force:\s*forceCloseConnections[\s\S]*\}\s*\)/,
      'the handler must drain via stopServer() and force-close via forceCloseConnections()',
    );
  });

  it('installs the handlers BEFORE the server starts listening', async () => {
    const source = await readFile(server2Path, 'utf8');
    const installIndex = source.indexOf('installShutdownHandlers(');
    const startIndex = source.indexOf('startRest2Server()');
    assert.notEqual(installIndex, -1);
    assert.notEqual(startIndex, -1);
    assert.ok(
      installIndex < startIndex,
      'a bad ADDRESSR_SHUTDOWN_TIMEOUT_MS must fail before the port is bound, not after',
    );
  });
});

describe('stopServer / forceCloseConnections (src/waycharter-server.js)', () => {
  async function functionBody(name) {
    const source = await readFile(waycharterServerPath, 'utf8');
    const startIndex = source.indexOf(`export function ${name}(`);
    assert.notEqual(startIndex, -1, `${name} must exist`);
    return source.slice(startIndex, startIndex + 600);
  }

  it('stopServer resolves rather than rejects, so test teardown cannot unhandled-reject', async () => {
    const body = await functionBody('stopServer');
    assert.match(
      body,
      /return\s+Promise\.resolve\(\)/,
      'no server: resolve immediately',
    );
    assert.match(
      body,
      /server\.close\(\s*\(\s*\)\s*=>\s*resolve\(\)\s*\)/,
      'the close callback resolves, discarding ERR_SERVER_NOT_RUNNING',
    );
    assert.doesNotMatch(body, /reject/, 'stopServer must never reject');
  });

  it('stopServer closes idle keep-alive connections so the drain can finish', async () => {
    const body = await functionBody('stopServer');
    assert.match(
      body,
      /server\.closeIdleConnections\(\)/,
      'idle keep-alive upstream sockets would otherwise hold server.close() open for the full budget',
    );
  });

  it('forceCloseConnections tears down whatever is left at the deadline', async () => {
    const body = await functionBody('forceCloseConnections');
    assert.match(body, /server\.closeAllConnections\(\)/);
  });
});
