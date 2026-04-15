/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable security/detect-object-injection -- env var names are compile-time constants, not user input */
import debug from 'debug';

const error = debug('error');
error.log = console.error.bind(console);

const HEADER_VAR = 'ADDRESSR_PROXY_AUTH_HEADER';
const VALUE_VAR = 'ADDRESSR_PROXY_AUTH_VALUE';

// Closed list per ADR 024: /health for monitoring, /api-docs for gateway
// OpenAPI imports (ADR 023). Exact-match, not prefix.
const ALLOWLIST = new Set(['/health', '/api-docs']);

function isNonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

export function validateProxyAuthConfig(environment = process.env) {
  const headerSet = isNonEmpty(environment[HEADER_VAR]);
  const valueSet = isNonEmpty(environment[VALUE_VAR]);
  if (headerSet && !valueSet) {
    throw new Error(
      `Proxy auth misconfigured: ${HEADER_VAR} is set but ${VALUE_VAR} is missing. Set both to enforce a gateway auth header, or unset both to disable enforcement.`,
    );
  }
  if (valueSet && !headerSet) {
    throw new Error(
      `Proxy auth misconfigured: ${VALUE_VAR} is set but ${HEADER_VAR} is missing. Set both to enforce a gateway auth header, or unset both to disable enforcement.`,
    );
  }
}

export function proxyAuthMiddleware() {
  return function proxyAuth(request, response, next) {
    const headerName = process.env[HEADER_VAR];
    const expected = process.env[VALUE_VAR];
    if (!isNonEmpty(headerName) || !isNonEmpty(expected)) {
      return next();
    }
    if (ALLOWLIST.has(request.path)) {
      return next();
    }
    const presented = request.get ? request.get(headerName) : undefined;
    if (presented === expected) {
      return next();
    }
    error('proxy-auth rejected %s', request.path);
    return response.status(401).json({ message: 'Authentication required' });
  };
}
