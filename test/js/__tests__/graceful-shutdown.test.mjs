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
  createServerLifecycle,
  trackServer,
  stopServer,
  forceCloseConnections,
} from '../../../src/graceful-shutdown.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server2Path = path.resolve(__dirname, '../../../src/server2.js');

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
    assert.equal(
      forced,
      0,
      'the deadline timer must be cleared on a clean drain',
    );
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
    assert.deepEqual(
      proc.exits,
      [1],
      'an impatient operator gets an immediate exit',
    );
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
    assert.equal(
      proc.handlers.size,
      0,
      'no handler is installed on a bad config',
    );
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
      /import\s*\{[^}]*installShutdownHandlers[^}]*\}\s*from\s*'\.\/graceful-shutdown(\.js)?'/,
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

// Behavioural cover for the server-handle lifecycle, replacing four
// source-inspection regexes over `src/waycharter-server.js` (P033).
//
// Those regexes read the FUNCTION BODY as text — that it contains
// `Promise.resolve()`, contains `server.close((` , contains
// `closeIdleConnections()`, and does not contain `reject`. Each is a claim
// about a shutdown path that decides whether an in-flight request is answered
// or dropped, and not one of them ran it.
//
// The `doesNotMatch(/reject/)` one is the sharpest example of why text is the
// wrong instrument: it fails on a variable named `rejectedCount`, and it passes
// on a promise that rejects through a helper. It is checking a spelling.
/** Minimal net.Server shape recording which teardown calls it received. */
const fakeServer = ({ closeCallbackError } = {}) => ({
  calls: [],
  close(callback) {
    this.calls.push('close');
    queueMicrotask(() => callback(closeCallbackError));
  },
  closeIdleConnections() {
    this.calls.push('closeIdle');
  },
  closeAllConnections() {
    this.calls.push('closeAll');
  },
});

describe('server-handle lifecycle — executed, not grepped (P033)', () => {
  it('resolves immediately when no server was ever tracked', async () => {
    const { stopServer } = createServerLifecycle();
    await stopServer();
  });

  it('RESOLVES when close() reports ERR_SERVER_NOT_RUNNING, and does not reject', async () => {
    // The behavioural form of the old `doesNotMatch(body, /reject/)`. That
    // regex asserted the word was absent from the source; this asserts the
    // promise settles fulfilled when close() hands back an error — which is
    // the actual contract, since test/js/world.js discards the return value
    // and an unhandled rejection there fails teardown.
    const { stopServer, trackServer } = createServerLifecycle();
    trackServer(
      fakeServer({ closeCallbackError: new Error('ERR_SERVER_NOT_RUNNING') }),
    );
    await stopServer();
  });

  it('closes idle keep-alive sockets, or the drain budget is spent on nothing', async () => {
    const { stopServer, trackServer } = createServerLifecycle();
    const server = trackServer(fakeServer());
    await stopServer();
    assert.ok(
      server.calls.includes('closeIdle'),
      'an upstream reverse-proxy pool holds close() open for the full budget otherwise',
    );
  });

  it('requests the close BEFORE closing idle sockets, not after', async () => {
    // Order the old regex could not see: closeIdleConnections() before
    // close() would let a new connection land in the gap.
    const { stopServer, trackServer } = createServerLifecycle();
    const server = trackServer(fakeServer());
    await stopServer();
    assert.deepStrictEqual(server.calls, ['close', 'closeIdle']);
  });

  it('force-close tears down everything still connected at the deadline', async () => {
    const { forceCloseConnections, trackServer } = createServerLifecycle();
    const server = trackServer(fakeServer());
    forceCloseConnections();
    assert.deepStrictEqual(server.calls, ['closeAll']);
  });

  it('force-close is a no-op when no server was tracked, rather than throwing', async () => {
    // installShutdownHandlers calls force() on the deadline path regardless.
    // A throw here would replace a clean exit(1) with an uncaught exception.
    const { forceCloseConnections } = createServerLifecycle();
    forceCloseConnections();
  });

  it('tracks the most recent server, so a restart does not drain the dead one', async () => {
    const { stopServer, trackServer } = createServerLifecycle();
    const first = trackServer(fakeServer());
    const second = trackServer(fakeServer());
    await stopServer();
    assert.deepStrictEqual(
      first.calls,
      [],
      'the replaced handle is not touched',
    );
    assert.deepStrictEqual(second.calls, ['close', 'closeIdle']);
  });
});

// The seven cases above each build a FRESH lifecycle, which is what makes them
// independent — and is also why, on their own, they prove nothing about the
// instance production runs. `server2.js` hands `installShutdownHandlers` the
// singleton's functions, and `startRest2Server` calls the singleton's
// `trackServer`. If those three ever stopped referring to one closure, every
// test above would still pass.
//
// The failure mode is why this matters more than it looks. `stopServer()` on an
// untracked handle returns `Promise.resolve()` — so a broken wiring does not
// throw and does not hang. It drains nothing, instantly, and exits 0. The
// Cucumber tiers cannot see it either: `test/js/world.js` awaits the drain but
// asserts nothing about it, and a no-op drain completes faster than a real one.
//
// So this case executes the singleton itself.
describe('the process-wide lifecycle singleton (what production actually runs)', () => {
  it('drains the server handed to the exported trackServer', async () => {
    const server = {
      calls: [],
      close(callback) {
        this.calls.push('close');
        queueMicrotask(() => callback());
      },
      closeIdleConnections() {
        this.calls.push('closeIdle');
      },
      closeAllConnections() {
        this.calls.push('closeAll');
      },
    };
    assert.equal(
      trackServer(server),
      server,
      'trackServer returns its argument so startRest2Server can keep the handle',
    );

    await stopServer();
    assert.deepStrictEqual(
      server.calls,
      ['close', 'closeIdle'],
      'the exported stopServer must act on the handle the exported trackServer was given — if these are separate closures the drain silently no-ops',
    );

    forceCloseConnections();
    assert.deepStrictEqual(server.calls, ['close', 'closeIdle', 'closeAll']);
  });
});
