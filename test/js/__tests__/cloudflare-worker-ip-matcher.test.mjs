import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ipInList,
  ipInCidr,
  v4ToInt,
  v6ToBig,
} from '../../../deploy/cloudflare-worker/ip-matcher.mjs';

// ADR 032 (P042): the worker's IP allowlist was previously
// `safeIps.includes(srcIp)` — a strict string-equality test that could never
// match the four CIDR entries (`69.162.124.224/28`, `216.144.248.16/28`,
// `216.245.221.80/28`, `2607:ff68:107::0/121`). P040 was the realised cost.
// These tests pin the CIDR-aware behaviour that P040 produced as a patch and
// P042 brings into the repo under version control. The test layer is the
// regression guarantee P040 could not host because the source was not yet in
// the repo (P040 ticket Investigation Tasks line 78).
describe('cloudflare-worker/ip-matcher — exact-match (P040 baseline behaviour)', () => {
  const list = ['128.140.106.114', '2400:6180:10:200::56a0:b000'];

  it('matches an exact IPv4 address', () => {
    assert.equal(ipInList('128.140.106.114', list), true);
  });

  it('rejects an IPv4 address not in the list', () => {
    assert.equal(ipInList('1.2.3.4', list), false);
  });

  it('matches an exact IPv6 address', () => {
    assert.equal(ipInList('2400:6180:10:200::56a0:b000', list), true);
  });

  it('rejects an IPv6 address not in the list', () => {
    assert.equal(ipInList('2001:db8::1', list), false);
  });
});

describe('cloudflare-worker/ip-matcher — IPv4 CIDR matching (the P040 fix)', () => {
  const list = ['69.162.124.224/28', '216.144.248.16/28'];

  // /28 → 16 addresses. 69.162.124.224 through 69.162.124.239.
  it('matches the first address in a /28 range', () => {
    assert.equal(ipInList('69.162.124.224', list), true);
  });

  it('matches the last address in a /28 range', () => {
    assert.equal(ipInList('69.162.124.239', list), true);
  });

  it('matches a middle address in a /28 range (the original P040 failing case)', () => {
    // 69.162.124.227, .235, .238 are the IPs cited in the P040 RCA as having
    // been rejected by the unpatched worker despite being inside the
    // 69.162.124.224/28 range UR publishes.
    assert.equal(ipInList('69.162.124.227', list), true);
    assert.equal(ipInList('69.162.124.235', list), true);
    assert.equal(ipInList('69.162.124.238', list), true);
  });

  it('rejects the address one below the /28 lower bound', () => {
    assert.equal(ipInList('69.162.124.223', list), false);
  });

  it('rejects the address one above the /28 upper bound', () => {
    assert.equal(ipInList('69.162.124.240', list), false);
  });

  it('matches across multiple /28 ranges', () => {
    assert.equal(ipInList('216.144.248.20', list), true);
    assert.equal(ipInList('216.144.248.31', list), true);
    assert.equal(ipInList('216.144.248.32', list), false);
  });
});

describe('cloudflare-worker/ip-matcher — IPv6 CIDR matching (the P040 fix)', () => {
  const list = ['2607:ff68:107::0/121'];

  // /121 → 128 addresses. ::0 through ::7F.
  it('matches the first address in a /121 range', () => {
    assert.equal(ipInList('2607:ff68:107::0', list), true);
  });

  it('matches addresses inside a /121 range (the original P040 failing case)', () => {
    // 2607:ff68:107::14, ::33 — ::60 are the IPv6 addresses cited in P040 RCA.
    assert.equal(ipInList('2607:ff68:107::14', list), true);
    assert.equal(ipInList('2607:ff68:107::33', list), true);
    assert.equal(ipInList('2607:ff68:107::60', list), true);
  });

  it('matches the last address in a /121 range', () => {
    assert.equal(ipInList('2607:ff68:107::7f', list), true);
  });

  it('rejects an address one above the /121 upper bound', () => {
    assert.equal(ipInList('2607:ff68:107::80', list), false);
  });

  it('rejects an address in a different /64 block', () => {
    assert.equal(ipInList('2607:ff68:108::14', list), false);
  });
});

describe('cloudflare-worker/ip-matcher — cross-family guards', () => {
  it('does not match an IPv4 against an IPv6 CIDR', () => {
    assert.equal(ipInList('1.2.3.4', ['::/0']), false);
  });

  it('does not match an IPv6 against an IPv4 CIDR', () => {
    assert.equal(ipInList('::1', ['0.0.0.0/0']), false);
  });
});

describe('cloudflare-worker/ip-matcher — malformed and edge inputs', () => {
  it('returns false for null srcIp', () => {
    assert.equal(ipInList(null, ['1.2.3.4']), false);
  });

  it('returns false for undefined srcIp', () => {
    assert.equal(ipInList(undefined, ['1.2.3.4']), false);
  });

  it('returns false for empty srcIp', () => {
    assert.equal(ipInList('', ['1.2.3.4']), false);
  });

  it('returns false for empty list', () => {
    assert.equal(ipInList('1.2.3.4', []), false);
  });

  it('returns false for a malformed IPv4 octet', () => {
    assert.equal(ipInCidr('999.0.0.1', '0.0.0.0/0'), false);
  });

  it('returns false for an IPv4 with non-numeric octet', () => {
    assert.equal(ipInCidr('1.2.3.abc', '0.0.0.0/0'), false);
  });

  it('returns false for a CIDR with NaN bit count', () => {
    assert.equal(ipInCidr('1.2.3.4', '1.2.3.4/xx'), false);
  });

  it('returns false for an out-of-range bit count (v4 /33)', () => {
    assert.equal(ipInCidr('1.2.3.4', '1.2.3.4/33'), false);
  });

  it('returns false for an out-of-range bit count (v6 /129)', () => {
    assert.equal(ipInCidr('::1', '::/129'), false);
  });
});

describe('cloudflare-worker/ip-matcher — v4ToInt direct', () => {
  it('parses 0.0.0.0 as 0', () => {
    assert.equal(v4ToInt('0.0.0.0'), 0);
  });

  it('parses 255.255.255.255 as 0xFFFFFFFF (unsigned)', () => {
    assert.equal(v4ToInt('255.255.255.255'), 0xffffffff);
  });

  it('returns null for octets >255', () => {
    assert.equal(v4ToInt('256.0.0.0'), null);
  });

  it('returns null for too few octets', () => {
    assert.equal(v4ToInt('1.2.3'), null);
  });

  it('returns null for leading-zero octets (defence against ambiguous parsing)', () => {
    assert.equal(v4ToInt('01.2.3.4'), null);
  });
});

describe('cloudflare-worker/ip-matcher — v6ToBig direct', () => {
  it('parses :: as 0n', () => {
    assert.equal(v6ToBig('::'), 0n);
  });

  it('parses ::1 as 1n', () => {
    assert.equal(v6ToBig('::1'), 1n);
  });

  it('parses fully-expanded form', () => {
    assert.equal(
      v6ToBig('2607:ff68:107:0:0:0:0:14'),
      v6ToBig('2607:ff68:107::14'),
    );
  });

  it('returns null for more than 8 groups', () => {
    assert.equal(v6ToBig('1:2:3:4:5:6:7:8:9'), null);
  });
});

describe('cloudflare-worker/ip-matcher — bits=0 covers everything in-family', () => {
  it('IPv4 /0 matches any IPv4', () => {
    assert.equal(ipInCidr('1.2.3.4', '0.0.0.0/0'), true);
    assert.equal(ipInCidr('255.255.255.255', '0.0.0.0/0'), true);
  });

  it('IPv6 /0 matches any IPv6', () => {
    assert.equal(ipInCidr('::1', '::/0'), true);
    assert.equal(ipInCidr('2607:ff68:107::14', '::/0'), true);
  });
});
