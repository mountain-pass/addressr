// The Google Maps browser key that ships in the website bundle is CONSTRAINED.
//
// WHY THIS EXISTS AS A TEST RATHER THAN A NOTE. This key must reach the browser
// — a Maps browser key that does not is useless — so every other credential
// guard in this repo is the wrong shape for it. `website-carries-no-webhook-
// credential.test.mjs` asks "is a secret present where it should not be";
// `rendered-output.test.mjs` allowlists this key by prefix precisely so it is
// NOT flagged. Neither can say the thing that actually keeps us safe, which is
// that holding the key buys an attacker almost nothing.
//
// That property lived in a screenshot and a maintainer's memory until
// 2026-08-24. It is configuration held in the Google Cloud console, outside this
// repository, and it can be widened to `*` in four clicks with every test in
// this repo still green. This file is the only thing that would notice.
//
// THE CLAIM IT REPLACES, because the correction is the reason it exists.
// JTBD-401 recorded the restriction as "unresolvable from outside", after probes
// against `maps/api/js` returned identical 200s for any referrer. That inference
// was wrong: the loader endpoint does not enforce, but `maps/embed/v1/view` —
// the endpoint `Search.js` actually calls — does. Two endpoints failing to
// discriminate was generalised to "none can", and that turned a gap in the probe
// set into a recorded impossibility which told the next reader not to look.
//
// WHAT IT CANNOT SEE, stated because a guard that misdescribes its reach is
// worse than a smaller one:
//   - The API-surface half. The key is scoped to
//     `maps-embed-backend.googleapis.com` alone, which is what makes a leak
//     cheap, and that is only readable through gcloud with project credentials
//     CI does not have. Verified by hand 2026-08-24; NOT asserted here.
//   - Quota and billing. A key restricted to our origins can still be abused by
//     anyone who can set a Referer header, which is anyone. Referrer restriction
//     is a spend control, not an authentication mechanism.
//   - Whether the map actually renders. This probes the API; it does not drive a
//     browser.
//
// IT REACHES THE NETWORK, deliberately, and it FAILS rather than skips when it
// cannot. NOT on the ADR-041 precedent — an earlier draft of this header cited
// it and that citation is withdrawn in the same commit that wrote it. ADR-041's
// test depends on a service the job starts itself, so a skip there means the
// job failed its own setup; here a skip would mean Google had a bad minute.
// Different thing.
//
// What justifies fail-not-skip is the deliberate trade recorded at the CI step
// in release.yml: a false red reddens master and stalls `push:watch` until
// someone reads the job name, and that cost is accepted because the alternative
// — a scheduled probe — has no reader. If this ever moves into a release-gating
// job, that reasoning stops carrying it. It sits in its own tier for the same
// reason `test:website` does: a job that cannot reach google.com should not be
// forced to run it, rather than it being made to skip quietly.
//
// @jtbd JTBD-401
// @adr ADR-018 (the worker safelist this must agree with)
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEARCH = path.join(REPO, 'apps/website/src/components/Search.js');

/**
 * The key is read FROM SOURCE, never hardcoded here.
 *
 * A rotation then carries this test with it automatically. Hardcoding would
 * produce the worst outcome available: a green test proving the restriction on
 * a key the site no longer serves.
 */
const keyFromSource = () => {
  const src = readFileSync(SEARCH, 'utf8');
  return src.match(/AIza[0-9A-Za-z_-]{35}/)?.[0] ?? '';
};

const probe = async (referer, key) => {
  const url =
    `https://www.google.com/maps/embed/v1/view?key=${key}` +
    '&center=-33.8688,151.2093&zoom=18&maptype=satellite';
  let res;
  try {
    res = await fetch(url, { headers: { Referer: referer }, redirect: 'manual' });
  } catch (cause) {
    // Transport failure is INCONCLUSIVE, and inconclusive must not read as
    // green. Fail with the cause named rather than skipping.
    throw new Error(
      `could not reach the Maps Embed API to check the key restriction ` +
        `(referer ${referer}): ${cause.message}. This tier needs network ` +
        'access; it is deliberately not skipped, because a skip here would ' +
        'report the restriction as verified when nothing was checked.',
      { cause },
    );
  }
  return res.status;
};

// Must be ALLOWED — these are origins the site actually serves from.
const ALLOWED = ['https://addressr.io/', 'https://addressr.mountain-pass.com.au/'];

// Must be REFUSED. The lookalike is the important one: a prefix or substring
// match would let it through, and that is the most likely way a hand-edited
// allowlist goes wrong.
const REFUSED = [
  'https://unrelated-example.net/',
  'https://addressr.io.evil.example/',
];

describe('the shipped Google Maps key is referrer-restricted (JTBD-401)', () => {
  let key;

  before(() => {
    key = keyFromSource();
    // THE FLOOR. Without it, a renamed component or a key moved to an env var
    // yields an empty key, every probe below 403s for the wrong reason, and the
    // refusal assertions pass while proving nothing at all.
    assert.match(
      key,
      /^AIza[0-9A-Za-z_-]{35}$/,
      `no Google API key found in ${path.relative(REPO, SEARCH)}. This test ` +
        'reads the key from source so a rotation carries it automatically; an ' +
        'empty key would make every refusal below pass vacuously.',
    );
  });

  for (const referer of ALLOWED) {
    it(`serves an embed to ${referer}`, async () => {
      const status = await probe(referer, key);
      assert.equal(
        status,
        200,
        `${referer} was refused (HTTP ${status}). TWO CAUSES, and they want ` +
          'opposite responses — check which before acting. (1) The origin is ' +
          "missing from the key's referrer allowlist: the map really is broken " +
          'there, and the fix is to add it. That is the defect found on ' +
          '2026-08-24, when the alias domain and localhost were both absent. ' +
          '(2) Google is rate-limiting or refusing this runner — shared CI ' +
          'egress IPs get throttled — in which case NOTHING is wrong with the ' +
          'key and widening the allowlist would loosen a working control for ' +
          'no reason. DISCRIMINATOR, and it is imperfect: if the refusal ' +
          'assertions in this same file ALSO failed, it is certainly cause 2. ' +
          'But Google returns 403 for rateLimitExceeded on Maps APIs, so ' +
          'throttling can present as this failure alone while the refusal ' +
          'assertions pass — they expect 403 and get it, for the wrong reason. ' +
          'Before widening anything, re-run: cause 1 is deterministic and ' +
          'cause 2 usually is not.',
      );
    });
  }

  for (const referer of REFUSED) {
    it(`refuses an embed to ${referer}`, async () => {
      const status = await probe(referer, key);
      assert.equal(
        status,
        403,
        `${referer} was SERVED (HTTP ${status}). The key's referrer ` +
          'restriction is not constraining it. Either the allowlist has been ' +
          'widened — check for a `*` entry — or Application restrictions has ' +
          'been set to None. Anyone could then spend our Maps quota.',
      );
    });
  }
});
