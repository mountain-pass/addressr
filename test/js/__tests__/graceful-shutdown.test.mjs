/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */

/* eslint-disable max-lines-per-function */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shutdownTimeoutMs,
  installShutdownHandlers,
  createServerLifecycle,
  trackServer,
  stopServer,
  forceCloseConnections,
} from '../../../packages/addressr/src/graceful-shutdown.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

// CONVERTED 2026-08-21 — RFC-009 rows 2/3. Two source pins stood here: that
// `server2.js` imports `installShutdownHandlers` and wires it to `stopServer` /
// `forceCloseConnections`, and that the install appears BEFORE
// `startRest2Server()` in the file. Both read the text, and STORY-001 measured
// them BLIND: gate the install behind a never-true env check and both `indexOf`
// markers still match while no handler is ever installed.
//
// The blocker was real — importing `server2.js` starts a server and connects a
// search client, so nothing can exercise it in-process. P033 recorded the honest
// conversion as a child-process one. This is it: spawn the entry point and
// observe what the PROCESS does.
//
// THE ORDERING IS OBSERVABLE because a bad ADDRESSR_SHUTDOWN_TIMEOUT_MS makes
// `shutdownTimeoutMs` throw. Install-before-listen means the process dies before
// binding; install-after means it binds first and crashes after. So "handlers
// are installed before the port is bound" — which the ordering pin asserted
// about source POSITION — becomes an observable about process behaviour.
describe('server entry point (src/server2.js) — spawned, not read', () => {
  const ENTRY = fileURLToPath(
    new URL('../../../packages/addressr/src/server2.js', import.meta.url),
  );

  const spawnEntry = (environment, killAfterMs = 15_000) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [ENTRY], {
        // DEBUG=api is REQUIRED, not incidental: the listen callback logs
        // through `debug('api')`, and with the namespace off there is no
        // observable for "the port was bound" at all.
        env: { ...process.env, DEBUG: 'api', PORT: '8099', ...environment },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', (d) => {
        out += d;
      });
      child.stderr.on('data', (d) => {
        out += d;
      });
      const kill = setTimeout(() => child.kill('SIGKILL'), killAfterMs);
      child.on('close', (code, signal) => {
        clearTimeout(kill);
        resolve({ code, signal, out });
      });
    });

  it('refuses to start on a bad shutdown timeout, and dies before binding the port', async () => {
    const result = await spawnEntry({
      ADDRESSR_SHUTDOWN_TIMEOUT_MS: 'not-a-number',
    });

    assert.notEqual(
      result.code,
      0,
      `the entry point started despite an invalid ADDRESSR_SHUTDOWN_TIMEOUT_MS; it exited ${result.code}`,
    );
    assert.match(
      result.out,
      /ADDRESSR_SHUTDOWN_TIMEOUT_MS/,
      'the failure did not name the variable that caused it, so an operator cannot act on it',
    );
    // TWO WRONG OBSERVABLES WERE TRIED FIRST. Recorded because picking the
    // observable is the whole difficulty here, and both failures are instructive.
    //
    //   1. The SUCCESS BANNER, asserted absent. VACUOUS: it prints only after
    //      `esConnect()` resolves and no OpenSearch runs in this tier, so it
    //      never prints on ANY path. Measured — a run with a VALID timeout
    //      produces no banner either. An assertion that cannot be true cannot
    //      fail: the exact defect this conversion exists to remove.
    //   2. `Waiting for <host>:<port>`, asserted absent. BLIND to the ordering
    //      mutation that matters. That line comes from the backend wait, which
    //      is downstream of where a moved install would sit, so moving the
    //      install AFTER startup still produced no `Waiting for`. Measured: the
    //      move was BLIND against it.
    //
    // The real discriminator is the LISTEN log, because binding the port is the
    // event the ordering property is about. Measured both directions with a bad
    // timeout: install-first exits 1 with no listen log; install-after binds,
    // logs, and crashes afterwards.
    assert.doesNotMatch(
      result.out,
      /listening on port/,
      'the port was BOUND before the shutdown-handler validation ran — a bad ADDRESSR_SHUTDOWN_TIMEOUT_MS must abort startup, not bind the port and crash afterwards',
    );
  });

  // THE CONTROL. Without it the assertion above is satisfied by ANY early
  // failure, including one with nothing to do with handler ordering — and the
  // vacuous-banner version it replaced would have passed forever.
  //
  // This run is EXPECTED to be killed: with a valid timeout the entry point gets
  // past the handlers, binds, and then waits for a search backend that is not
  // running in this tier. Reaching the wait is the whole assertion; the SIGKILL
  // is how the test ends, not a failure.
  // THE WIRING, exercised end to end. The deleted pins asserted that
  // `server2.js` passes `stop: stopServer` and `force: forceCloseConnections`.
  // Neither the exit-code case above nor anything else reaches those: the bad
  // timeout throws inside the DEFAULT PARAMETER `timeoutMs =
  // shutdownTimeoutMs(env)`, which is evaluated before `stop` or `force` is ever
  // read. Measured: dropping `force: forceCloseConnections` was BLIND to every
  // other case in this file.
  //
  // So drive the real thing. Start the entry point, wait for the port, send
  // SIGTERM, and read what the process does. The drain log carries the timeout
  // VALUE, so it also proves `timeoutMs` reached the handler from the
  // environment rather than falling back to the default.
  // WHAT THIS STILL DOES NOT COVER, measured rather than assumed:
  //
  //   - `force: forceCloseConnections`. Dropping it is BLIND to every case in
  //     this file. `installShutdownHandlers` defaults `force` to `() => {}`, so
  //     the omission is silent, and `force` only fires when a request outlives
  //     the drain deadline — which needs a live search backend, absent here.
  //     Measured: a held keep-alive connection drains in 4ms.
  //   - `stop: stopServer` wired to a no-op. Also BLIND, for the same reason:
  //     with nothing in flight, a no-op stop still lets the process exit 0.
  //
  // The deleted pins DID catch both, by reading the text. That cover is not
  // replaced, and it is recorded here and in RFC-009 rather than quietly lost.
  // The honest fix is to make `force` a required option — a silent default that
  // disables force-close is a latent defect in its own right — which is a
  // production change and out of this conversion's scope.
  it('SIGTERM drains and exits cleanly, with the configured timeout in force', async () => {
    const child = spawn(process.execPath, [ENTRY], {
      env: {
        ...process.env,
        DEBUG: 'api',
        PORT: '8093',
        ADDRESSR_SHUTDOWN_TIMEOUT_MS: '3000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const listening = new Promise((resolve) => {
      const onData = (d) => {
        out += d;
        if (/listening on port/.test(out)) resolve();
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
    });
    const closed = new Promise((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal }));
    });
    const guard = setTimeout(() => child.kill('SIGKILL'), 20_000);

    await listening;
    child.kill('SIGTERM');
    const result = await closed;
    clearTimeout(guard);

    assert.equal(
      result.signal,
      null,
      'the process had to be killed rather than shutting down on SIGTERM — the shutdown handlers are not wired to anything that stops the server',
    );
    assert.equal(
      result.code,
      0,
      `a drained shutdown must exit 0; got ${result.code}`,
    );
    assert.match(
      out,
      /SIGTERM received, draining in-flight requests \(up to 3000ms\)/,
      'the drain did not run with the configured timeout — either stop is not wired, or timeoutMs did not reach the handler from the environment',
    );
    assert.match(
      out,
      /drain complete, exiting/,
      'the drain started but never completed, so the process exited by some other path',
    );
  });

  it('control: with a VALID timeout the port IS bound, so the assertion above is not vacuous', async () => {
    const result = await spawnEntry(
      { ADDRESSR_SHUTDOWN_TIMEOUT_MS: '5000' },
      6000,
    );
    assert.match(
      result.out,
      /listening on port/,
      `the port was never bound even with a valid timeout, so "no listen log" above is satisfied by any startup failure and proves nothing about ordering. Output: ${result.out.slice(0, 300)}`,
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
