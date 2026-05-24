// CIDR-aware IP matcher for the Cloudflare Worker (ADR 032 / P042).
//
// Replaces the prior `safeIps.includes(srcIp)` strict-equality check that
// could never match CIDR entries — the realised cost of which was P040's
// recurring Uptime Robot 401 alerts. Pinned behaviour lives in
// test/js/__tests__/cloudflare-worker-ip-matcher.test.mjs.
//
// Pure functions, no I/O, no dependencies. Runs in both Node (for tests) and
// Cloudflare's V8 isolate (for the worker).

export function ipInList(srcIp, list) {
  if (!srcIp) return false;
  for (const entry of list) {
    if (entry.includes('/')) {
      if (ipInCidr(srcIp, entry)) return true;
    } else if (srcIp === entry) {
      return true;
    }
  }
  return false;
}

export function ipInCidr(ip, cidr) {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number.parseInt(bitsStr, 10);
  if (Number.isNaN(bits)) return false;
  const ipIsV6 = ip.includes(':');
  const rangeIsV6 = range.includes(':');
  if (ipIsV6 !== rangeIsV6) return false;
  return ipIsV6 ? v6InCidr(ip, range, bits) : v4InCidr(ip, range, bits);
}

export function v4InCidr(ip, range, bits) {
  if (bits < 0 || bits > 32) return false;
  const ipNum = v4ToInt(ip);
  const rangeNum = v4ToInt(range);
  if (ipNum === null || rangeNum === null) return false;
  if (bits === 0) return true;
  const mask = (-1 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

export function v4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number.parseInt(p, 10);
    if (Number.isNaN(v) || v < 0 || v > 255 || String(v) !== p) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function v6InCidr(ip, range, bits) {
  if (bits < 0 || bits > 128) return false;
  const ipBig = v6ToBig(ip);
  const rangeBig = v6ToBig(range);
  if (ipBig === null || rangeBig === null) return false;
  if (bits === 0) return true;
  const mask =
    ((1n << 128n) - 1n) ^ ((1n << (128n - BigInt(bits))) - 1n);
  return (ipBig & mask) === (rangeBig & mask);
}

export function v6ToBig(ip) {
  let head;
  let tail;
  if (ip.includes('::')) {
    [head, tail] = ip.split('::');
  } else {
    head = ip;
    tail = '';
  }
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const fill = 8 - headParts.length - tailParts.length;
  if (fill < 0) return null;
  const parts = [...headParts, ...Array(fill).fill('0'), ...tailParts];
  if (parts.length !== 8) return null;
  let n = 0n;
  for (const p of parts) {
    const v = Number.parseInt(p || '0', 16);
    if (Number.isNaN(v) || v < 0 || v > 0xffff) return null;
    n = (n << 16n) | BigInt(v);
  }
  return n;
}
