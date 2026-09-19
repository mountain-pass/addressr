// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
// @jtbd JTBD-005 (Create and Access a Managed Hosted API Account)
//
// THE STRUCTURAL HALF OF ADR-098, PINNED BY SOMETHING THAT RUNS.
//
// The gateway admits loopback http origins so a local page can reach it before
// activation. That widening is safe only because no http origin can reach a DEPLOYED
// allowlist: `MANAGED_APP_ORIGINS` is `jsonencode([var.managed_app_url])`, and that
// variable refuses a non-https value at plan time.
//
// `terraform fmt` and `terraform validate` do NOT evaluate a variable validation against
// a value, so without this the block could be deleted and every other check would pass.
//
// WHY A TEXT ASSERTION. The behavioural instrument would be a `.tftest.hcl` with
// `expect_failures`. One was written and WITHDRAWN before it shipped: nothing in this
// repository runs `terraform test` -- not `deploy.sh`, not any workflow, not any npm
// script -- so it would have documented coverage that never executes, against the very
// job whose statement is that coverage must not silently erode. A test that does not run
// is worse than a text assertion that does, because it also claims to be the stronger
// thing. This is not a lesser tier invented here: `terraform-required-vars-wired.test.mjs`
// is the same instrument under the same annotation.
//
// WHAT IS MEASURED VERSUS PINNED. The predicate's SEMANTICS were executed once, on
// 2026-09-19, by extracting the variable into an isolated module and planning it twice --
// the https default accepted, `http://127.0.0.1:9000` refused with the validation's own
// message. This pins PRESENCE and SUBJECT. Neither substitutes for the other, and the
// semantics are measured once against a copy and not re-measured.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

// BOTH sites, and the duplication is the decision rather than an implementation detail.
// They differ by CALLER, not by consequence: the module renders both `MANAGED_APP_ORIGINS`
// and `MANAGED_APP_URL` from this one variable, so each site guards the allowlist AND the
// Stripe return links -- the root one catching the value as entered, the module one
// catching any caller that renders the bindings. A test scoped to one would let the other
// be deleted green.
const SITES = [
  'apps/addressr-deployment/vars.tf',
  'apps/addressr-deployment/modules/cloudflare-worker/variables.tf',
];

describe('managed_app_url cannot be a non-https origin', () => {
  it('finds the variable at every site, so a zero-match pass is impossible', () => {
    assert.ok(SITES.length >= 2, 'both validation sites must be enumerated');
    for (const site of SITES) {
      assert.match(
        readFileSync(path.join(root, site), 'utf8'),
        /variable "managed_app_url"\s*{/,
        `${site} no longer declares managed_app_url, so the assertions below would examine nothing`,
      );
    }
  });

  for (const site of SITES) {
    it(`${site} refuses a non-https managed_app_url`, () => {
      const source = readFileSync(path.join(root, site), 'utf8');
      const block =
        /variable "managed_app_url"\s*{[\S\s]*?\n}/.exec(source)?.at(0) ?? '';
      assert.match(
        block,
        /validation\s*{/,
        `${site} declares managed_app_url with no validation block. That block is what stops an http origin reaching the deployed MANAGED_APP_ORIGINS allowlist, and it guards the Stripe return links built from the same value.`,
      );
      // THE SUBJECT IS PART OF THE PIN, not only the pattern. Asserting an anchored
      // `^https://` alone would survive the cheapest mutation available: pointing the
      // condition at a different variable, or at a constant. The block would still
      // exist, the literal would still appear, and the guard would be gone.
      assert.match(
        block,
        /can\(regex\("\^https:\/\/",\s*var\.managed_app_url\)\)/,
        `${site}'s validation no longer requires an https prefix anchored at the start OF THIS VARIABLE. Check the subject as well as the pattern: a condition pointing elsewhere passes a pattern-only assertion.`,
      );
    });
  }
});
