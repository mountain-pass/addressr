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
  let draining = false;

  const onSignal = (signal) => {
    if (draining) {
      // A second signal is an operator who has stopped waiting.
      logger('%s received while draining, exiting now', signal);
      force();
      proc.exit(1);
      return;
    }
    draining = true;
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
