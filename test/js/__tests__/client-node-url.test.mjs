/* eslint-disable @eslint-community/eslint-comments/disable-enable-pair */
/* eslint-disable unicorn/prevent-abbreviations */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientNode } from '../../../src/client-node-url.js';

// P036-discovered: the loader (client/elasticsearch.js) shared the same
// URL-construction bug as read-shadow (src/read-shadow.js) — passwords
// containing URL-reserved chars (/, +, =, :, !, etc.) caused
// `new Client({node})` to throw `TypeError: Invalid URL`. v2.5.4 fixed
// read-shadow only; the loader silently retried once-per-second forever.
//
// This helper is the shared URL builder for both code paths, so a single
// import point eliminates the drift risk that produced this bug.
describe('buildClientNode (P036 shared helper)', () => {
  it('returns no-auth URL when username is empty', () => {
    const node = buildClientNode({
      protocol: 'https',
      username: '',
      password: '',
      host: 'cluster.example.com',
      port: '443',
    });
    assert.equal(node, 'https://cluster.example.com:443');
  });

  it('returns no-auth URL when username is undefined', () => {
    const node = buildClientNode({
      protocol: 'https',
      username: undefined,
      password: undefined,
      host: 'cluster.example.com',
      port: '443',
    });
    assert.equal(node, 'https://cluster.example.com:443');
  });

  it('returns auth URL with both credentials present', () => {
    const node = buildClientNode({
      protocol: 'https',
      username: 'elastic',
      password: 'simpleAlphaNumPassword123',
      host: 'cluster.example.com',
      port: '443',
    });
    assert.equal(
      node,
      'https://elastic:simpleAlphaNumPassword123@cluster.example.com:443',
    );
  });

  it('URL-encodes URL-reserved chars in password (P035/P036 regression)', () => {
    // Realistic base64-derived password — same chars that broke the loader.
    const password = 'Xq+abc/def=ghi:jkl@mno5+ghI!QRsTuVw=';
    const node = buildClientNode({
      protocol: 'https',
      username: 'elastic',
      password,
      host: 'cluster.example.com',
      port: '443',
    });
    // Result must be a valid URL when parsed
    assert.doesNotThrow(() => new URL(node));
    const parsed = new URL(node);
    assert.equal(decodeURIComponent(parsed.username), 'elastic');
    assert.equal(decodeURIComponent(parsed.password), password);
  });

  it('URL-encodes URL-reserved chars in username too', () => {
    const username = 'user/with+reserved=chars';
    const node = buildClientNode({
      protocol: 'https',
      username,
      password: 'simple',
      host: 'cluster.example.com',
      port: '443',
    });
    assert.doesNotThrow(() => new URL(node));
    const parsed = new URL(node);
    assert.equal(decodeURIComponent(parsed.username), username);
  });

  it('works with non-default port', () => {
    const node = buildClientNode({
      protocol: 'http',
      username: 'elastic',
      password: 'simple',
      host: '127.0.0.1',
      port: '9200',
    });
    assert.equal(node, 'http://elastic:simple@127.0.0.1:9200');
  });
});
