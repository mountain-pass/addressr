// @jtbd JTBD-201
// ADR 033: select OpenSearch client auth — basic (default, self-hosted /
// local Docker / v1) vs IAM/SigV4 (AWS-managed v2, gated by an env flag).
// Default-off and fail-safe: anything other than an explicit "sigv4" falls
// back to basic, so a self-hosted operator can never accidentally land on
// the AWS-only path. Signer + credential provider are DI'd for unit tests.

import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

/**
 * Resolve the auth mode from an env-like object.
 * @param {Record<string,string|undefined>} env
 * @param {string} [varName] env var to read (default ELASTIC_AUTH_MODE; pass
 *   ADDRESSR_SHADOW_AUTH_MODE for the read-shadow client)
 * @returns {'basic'|'sigv4'}
 */
export function resolveAuthMode(
  environment,
  variableName = 'ELASTIC_AUTH_MODE',
) {
  const raw = (environment?.[variableName] ?? '').trim().toLowerCase();
  return raw === 'sigv4' ? 'sigv4' : 'basic';
}

/**
 * Build the @opensearch-project/opensearch Client options for the chosen
 * auth mode.
 *
 * - basic → `{ node }` (credentials are already embedded in the node URL by
 *   the caller's buildClientNode; byte-identical to the pre-ADR-033 shape).
 * - sigv4 → `{ ...AwsSigv4Signer({ region, service, getCredentials }), node }`.
 *   No credentials in the node URL. Fail-loud if region is missing rather
 *   than silently downgrading to basic.
 *
 * @param {{
 *   authMode: 'basic'|'sigv4',
 *   node: string,
 *   region?: string,
 *   service?: string,
 *   signerFactory?: Function,   // DI (default AwsSigv4Signer)
 *   getCredentials?: Function,  // DI (default defaultProvider())
 * }} opts
 */
export function buildEsClientOptions({
  authMode,
  node,
  region,
  service = 'es',
  signerFactory = AwsSigv4Signer,
  getCredentials,
}) {
  if (authMode !== 'sigv4') {
    return { node };
  }
  if (!region) {
    throw new Error(
      'ELASTIC_AUTH_MODE=sigv4 requires a region (set ELASTIC_REGION); refusing to silently fall back to basic auth',
    );
  }
  const creds = getCredentials ?? defaultProvider();
  return {
    ...signerFactory({ region, service, getCredentials: creds }),
    node,
  };
}
