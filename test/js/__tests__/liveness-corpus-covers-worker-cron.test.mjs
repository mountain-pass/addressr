// @jtbd JTBD-403 (Know the paid channel still bills correctly)
//
// ADR-089 (proposed) retargets confirmation criterion 7: IF the managed-channel
// health check moves off a CI workflow and onto the Worker's scheduled handler,
// its carrier must sit inside a liveness corpus — a detector nothing watches
// reproduces the defect the decision was written about.
//
// THAT REPLACEMENT IS NOT BUILT. `managed-channel-health.yml` is still the
// carrier and is still in the corpus, and the Worker cron this file is about is
// `meter_delivery`, which predates the work and carries none of the
// notification. Widening the corpus is a PRECONDITION for a carrier that does
// not yet exist, not a reaction to one that moved.
//
// The liveness check enumerates `.github/workflows/*.yml` carrying a
// `schedule:` trigger. A Worker cron is declared in Terraform, so it is
// invisible to that enumeration. This closes the enumeration half: whatever
// scheduled carriers the repository has, the corpus builder must see all of
// them, from either source.
//
// WHAT THIS DOES NOT DO, stated because the criterion is not yet discharged and
// a reader should not think it is. The staleness check's other half asks GitHub
// when each workflow last ran on a `schedule` event. There is no equivalent
// question for a Worker cron — Cloudflare is not `gh` — so enumerating the cron
// makes it VISIBLE to the corpus without yet making it WATCHED. The freshness
// half needs the replacement handler to record its own last successful run
// somewhere readable, which is apply-two work. Criterion 7 stays open until
// then, and the ledger says so.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  scheduledCarriers,
  run,
  WORKFLOW_FLOOR,
} from '../../../scripts/scheduled-workflow-staleness.mjs';

const TF_DIR = 'apps/addressr-deployment/modules/cloudflare-worker';

describe('the liveness corpus sees every scheduled carrier, not just workflows', () => {
  it('finds carriers of both kinds, so a zero-match pass is impossible', () => {
    const found = scheduledCarriers();
    // Floored by KIND, against the same constant the runtime uses. A bare count
    // over the widened corpus would let a worker cron pad out a collapsed
    // workflow corpus — the zero-match pass this assertion exists to refuse,
    // reintroduced by the widening itself.
    const workflows = found.filter((c) => c.kind === 'workflow');
    assert.ok(
      workflows.length >= WORKFLOW_FLOOR,
      `expected at least ${WORKFLOW_FLOOR} scheduled workflow carriers, found ${workflows.length}` +
        ' — has the workflow directory moved?',
    );
    assert.ok(
      found.some((c) => c.kind === 'worker-cron'),
      'no Worker cron carriers found. A cron declared in Terraform is invisible to a builder ' +
        'that only reads .github/workflows, which is the gap ADR-089 criterion 7 names.',
    );
  });

  it('sees every Worker cron the Terraform declares', () => {
    // Counted from the source rather than hardcoded, so adding a second cron
    // trigger cannot leave one outside the corpus unnoticed.
    const declared = readdirSync(TF_DIR)
      .filter((f) => f.endsWith('.tf'))
      .map((f) => readFileSync(`${TF_DIR}/${f}`, 'utf8'))
      .join('\n')
      .match(/resource\s+"cloudflare_workers_cron_trigger"/g)?.length ?? 0;
    assert.ok(declared >= 1, 'no Worker cron trigger declared — has it moved?');
    const seen = scheduledCarriers().filter((c) => c.kind === 'worker-cron');
    assert.equal(
      seen.length,
      declared,
      `${declared} Worker cron trigger(s) declared but the corpus sees ${seen.length}`,
    );
  });

  it('the wired check reads the widened corpus, not just workflows', async () => {
    // The assertion that stops this being an enumeration nobody reads. An
    // exported builder consumed only by its own test is a check with no reader
    // — the exact shape ADR-051 rejects, and the shape this file's own header
    // invokes against others. `run()` is what `npm run check-schedules` and
    // `schedule-refresh.mjs` call, so it is the corpus that exists.
    //
    // `gh` is unavailable or unauthenticated here, so every workflow comes back
    // unverifiable. That is fine: what is asserted is WHICH CARRIERS APPEAR, not
    // their freshness.
    const { findings } = await run({ now: new Date() });
    const names = findings.map((f) => f.workflow);
    for (const carrier of scheduledCarriers().filter((c) => c.kind === 'worker-cron')) {
      assert.ok(
        names.includes(carrier.name),
        `the wired staleness check does not report Worker cron \`${carrier.name}\`. ` +
          `An enumeration only its own test reads is not a corpus.`,
      );
    }
  });

  it('reports a Worker cron as unverifiable rather than fresh', async () => {
    // There is no `gh` question for a Cloudflare cron, so it cannot be judged
    // fresh. Reporting it as ok would be worse than omitting it: a green line
    // for a carrier nothing watched.
    const { findings } = await run({ now: new Date() });
    for (const f of findings.filter((f) => f.kind === 'worker-cron')) {
      assert.equal(f.unverifiable, true, `${f.workflow} is reported as judged, and it cannot be`);
      assert.equal(f.stale, false, `${f.workflow} is reported stale, which overstates what is known`);
    }
  });

  it('does not degrade the verdict for the carriers it CAN judge', async () => {
    // Running it caught what the test above did not. Counting an unwatchable
    // carrier as unverifiable moved the exit code from 0 to 2 permanently — a
    // check that always says "something could not be read" is the flapping
    // alarm this script's own header warns about, and it would devalue the
    // eleven workflows it can actually judge.
    //
    // So a worker-cron carrier is REPORTED but excluded from the verdict
    // arithmetic, and the exclusion is named in the summary rather than silent.
    // Visible to a reader, not counted against a signal it cannot inform.
    const { findings, verdict } = await run({ now: new Date() });
    const crons = findings.filter((f) => f.kind === 'worker-cron');
    assert.ok(crons.length >= 1, 'no worker-cron finding to check');
    assert.ok(
      verdict.why.includes('not counted'),
      `the verdict does not say the unwatchable carriers are excluded: ${verdict.why}`,
    );
    assert.doesNotMatch(
      verdict.why,
      new RegExp(`\\b${findings.length}\\b`),
      'the verdict totals every finding, so an unwatchable carrier still degrades it',
    );
  });

  it('carries each cron expression, so cadence can be judged', () => {
    // The staleness bound is derived from cadence. A carrier with no cron
    // expression could be enumerated and still not be judgeable, which would be
    // presence without coverage.
    for (const carrier of scheduledCarriers().filter((c) => c.kind === 'worker-cron')) {
      assert.match(
        carrier.cron ?? '',
        /^[\d*/,\- ]+$/,
        `carrier ${carrier.name} has no usable cron expression: ${carrier.cron}`,
      );
    }
  });
});
