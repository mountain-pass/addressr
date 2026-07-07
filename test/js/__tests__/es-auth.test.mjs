// ADR 033: conditional IAM/SigV4 vs basic auth for the OpenSearch client.
// Unit tests for the pure selector in src/es-auth.js (clean ESM, DI per P033).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveAuthMode, buildEsClientOptions } from '../../../src/es-auth.js';

describe('resolveAuthMode (ADR 033)', () => {
  it('defaults to basic when the flag is unset', () => {
    assert.equal(resolveAuthMode({}), 'basic');
  });

  it('defaults to basic for the empty string', () => {
    assert.equal(resolveAuthMode({ ELASTIC_AUTH_MODE: '' }), 'basic');
  });

  it('returns sigv4 for the sigv4 flag (case/space-insensitive)', () => {
    assert.equal(resolveAuthMode({ ELASTIC_AUTH_MODE: 'sigv4' }), 'sigv4');
    assert.equal(resolveAuthMode({ ELASTIC_AUTH_MODE: 'SigV4' }), 'sigv4');
    assert.equal(resolveAuthMode({ ELASTIC_AUTH_MODE: ' sigv4 ' }), 'sigv4');
  });

  it('reads a custom env var name (for the shadow flag)', () => {
    assert.equal(
      resolveAuthMode(
        { ADDRESSR_SHADOW_AUTH_MODE: 'sigv4' },
        'ADDRESSR_SHADOW_AUTH_MODE',
      ),
      'sigv4',
    );
    assert.equal(
      resolveAuthMode(
        { ELASTIC_AUTH_MODE: 'sigv4' },
        'ADDRESSR_SHADOW_AUTH_MODE',
      ),
      'basic',
    );
  });

  it('treats any non-sigv4 value as basic (fail-safe to the unprivileged path)', () => {
    assert.equal(resolveAuthMode({ ELASTIC_AUTH_MODE: 'iam' }), 'basic');
    assert.equal(resolveAuthMode({ ELASTIC_AUTH_MODE: 'aws' }), 'basic');
  });
});

const fakeCreds = () => 'creds-provider';

describe('buildEsClientOptions (ADR 033)', () => {
  const node = 'https://user:pass@host:443';

  it('basic mode returns just the node (no signer)', () => {
    const options = buildEsClientOptions({ authMode: 'basic', node });
    assert.deepEqual(options, { node });
  });

  it('sigv4 mode merges signer options and the node, calling the signer with region+service+getCredentials', () => {
    const calls = [];
    const fakeSigner = (argument) => {
      calls.push(argument);
      return { Connection: 'FAKE_CONN', auth: 'sigv4-marker' };
    };
    const options = buildEsClientOptions({
      authMode: 'sigv4',
      node,
      region: 'ap-southeast-2',
      service: 'es',
      signerFactory: fakeSigner,
      getCredentials: fakeCreds,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].region, 'ap-southeast-2');
    assert.equal(calls[0].service, 'es');
    assert.equal(calls[0].getCredentials, fakeCreds);
    assert.equal(options.node, node);
    assert.equal(options.Connection, 'FAKE_CONN');
    assert.equal(options.auth, 'sigv4-marker');
  });

  it('sigv4 mode defaults service to "es" when not supplied', () => {
    let seen;
    buildEsClientOptions({
      authMode: 'sigv4',
      node,
      region: 'ap-southeast-2',
      signerFactory: (a) => {
        seen = a;
        return {};
      },
      getCredentials: () => 'c',
    });
    assert.equal(seen.service, 'es');
  });

  it('sigv4 mode throws a clear error when region is missing (fail-loud, not silent-basic)', () => {
    assert.throws(
      () =>
        buildEsClientOptions({
          authMode: 'sigv4',
          node,
          signerFactory: () => ({}),
          getCredentials: () => 'c',
        }),
      /region/i,
    );
  });
});
