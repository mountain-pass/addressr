// P067: the server exported stopServer() but nothing wired it to a process
// signal, so every termination dropped whatever requests were in flight.
//
// This composes with the tini init added under ADR-039 rather than replacing
// it: tini is PID 1 and forwards SIGTERM to node, which makes the container
// stop PROMPTLY; these handlers make it stop GRACEFULLY. Without tini the
// signal never arrives; without these handlers node takes the default
// disposition and dies mid-request.
//
// The drain is bounded. server.close() resolves only when every connection has
// ended, and an idle keep-alive socket (the upstream pool a reverse proxy holds
// open) will happily outlive any orchestrator grace window. stopServer() closes
// the idle ones immediately, and this module force-closes the rest at the
// deadline rather than letting a stuck connection earn a SIGKILL.
import debug from 'debug';

const logger = debug('api');

// Under Docker's default 10s stop grace, with headroom for the force-close.
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8000;

/**
 * Resolve the drain budget from the environment.
 *
 * Unset falls back to the default; set-but-invalid throws, matching the
 * fail-at-startup contract of validateProxyAuthConfig and
 * validateReadShadowConfig. A silently-NaN budget would fire the deadline
 * immediately and drop every in-flight request while looking configured.
 */
export function shutdownTimeoutMs(environment = process.env) {
  const configured = environment.ADDRESSR_SHUTDOWN_TIMEOUT_MS;
  if (configured === undefined || configured === '') {
    return DEFAULT_SHUTDOWN_TIMEOUT_MS;
  }
  const milliseconds = Number(configured);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error(
      `ADDRESSR_SHUTDOWN_TIMEOUT_MS must be a positive number of milliseconds, got '${configured}'`,
    );
  }
  return milliseconds;
}

/**
 * Build a server-handle lifecycle: track the listening server, drain it, and
 * force it down at the deadline.
 *
 * The handle lives here rather than in `waycharter-server.js`, with the two
 * functions that act on it, and that move is what lets a unit test exercise the
 * drain at all (P033): `waycharter-server.js` transitively imports
 * `service/address-service` through a babel-only bare specifier and cannot be
 * loaded by raw Node ESM, so while these functions lived there the only
 * available instrument was regex-matching their source text.
 *
 * A FACTORY over a module-level `let` for two reasons, both of them practical.
 * A test gets a genuinely independent handle by calling this again, instead of
 * defeating the module cache with a query-string import. And the singleton
 * below becomes a `const` initialised once, so nothing assigns to module scope
 * from inside a function — the shape `unicorn/no-top-level-assignment-in-function`
 * is pointing at (P084).
 *
 * @returns {{trackServer: <T>(server: T) => T, stopServer: () => Promise<void>, forceCloseConnections: () => void}}
 */
export function createServerLifecycle() {
  let tracked;

  return {
    /**
     * Record the server the shutdown path acts on, and return it.
     *
     * Returns its argument so the caller keeps using the handle it just made.
     * Replacing a previous server is deliberate and is what a restart does.
     * Draining a stale handle would NOT hang — a closed server fires its
     * `close()` callback with ERR_SERVER_NOT_RUNNING, so the drain would
     * resolve immediately while the live server kept serving and then took the
     * SIGKILL. That is worse than hanging, because a hang is visible.
     */
    trackServer(server) {
      tracked = server;
      return server;
    },

    /**
     * Stop accepting connections and drain the ones in flight.
     *
     * Resolves when every connection has ended, and NEVER rejects: an
     * `ERR_SERVER_NOT_RUNNING` callback is a no-op, not a shutdown failure, and
     * the caller at `test/js/world.js` discards the return value — an unhandled
     * rejection there fails teardown. Exit codes are `installShutdownHandlers`'
     * business, not this function's.
     */
    stopServer() {
      if (tracked === undefined) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        tracked.close(() => resolve());
        // Idle keep-alive sockets hold close() open indefinitely — a reverse
        // proxy upstream pool would otherwise consume the whole drain budget
        // doing nothing. After close(), so nothing new lands in the gap.
        tracked.closeIdleConnections();
      });
    },

    /** The deadline path: whatever is still connected when the budget expires. */
    forceCloseConnections() {
      if (tracked !== undefined) {
        tracked.closeAllConnections();
      }
    },
  };
}

// The process-wide instance. `server2.js` and `test/js/world.js` import these
// through `waycharter-server.js`, which re-exports them.
export const { trackServer, stopServer, forceCloseConnections } =
  createServerLifecycle();

/**
 * Register the shutdown handlers.
 *
 * @param {object} options
 * @param {() => Promise<void>} options.stop drains and stops accepting connections
 * @param {() => void} [options.force] tears down whatever is still connected
 */
export function installShutdownHandlers({
  stop,
  force = () => {},
  env: environment = process.env,
  timeoutMs = shutdownTimeoutMs(environment),
  signals = ['SIGTERM', 'SIGINT'],
  proc = process,
} = {}) {
  let isDraining = false;

  const onSignal = (signal) => {
    if (isDraining) {
      // A second signal is an operator who has stopped waiting.
      logger('%s received while draining, exiting now', signal);
      force();
      proc.exit(1);
      return;
    }
    isDraining = true;
    logger(
      '%s received, draining in-flight requests (up to %dms)',
      signal,
      timeoutMs,
    );

    const deadline = setTimeout(() => {
      logger('drain unfinished after %dms, closing connections', timeoutMs);
      force();
      proc.exit(1);
    }, timeoutMs);

    // The two-argument `.then(onFulfilled, onRejected)` is load-bearing, not a
    // style slip: it keeps the success and failure paths DISJOINT BY
    // CONSTRUCTION. `.then(f).catch(r)` would also route a throw from the
    // success handler into r; `await` would need a nested try/catch to keep
    // them apart. Both are more machinery for the same guarantee this gets for
    // free. (Not claiming a live bug — `proc.exit(0)` below is synchronous in
    // production, so nothing downstream of it throws today. The point is that
    // the property holds without depending on that.) P084.
    // eslint-disable-next-line unicorn/prefer-await, unicorn/prefer-then-catch -- see above
    Promise.resolve(stop()).then(
      () => {
        clearTimeout(deadline);
        logger('drain complete, exiting');
        proc.exit(0);
      },
      (error) => {
        clearTimeout(deadline);
        logger('drain failed (%s), closing connections', error.message);
        force();
        proc.exit(1);
      },
    );
  };

  for (const signal of signals) {
    proc.on(signal, () => onSignal(signal));
  }
}
