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
// somewhere readable, which is apply-two work. ADR-089 criterion 6, and
// ADR-088 criterion 7's TRANSFER half, stay open until then.
//
// ADR-088 CRITERION 7'S TODAY-HALF IS DISCHARGED HERE, and it was live and
// undischarged until 2026-09-19. The corpus was floored only by KIND -- five
// workflow carriers, one Worker cron -- so removing the `schedule:` trigger from
// the health workflow while keeping the file took the corpus from eleven
// carriers to ten, stayed above the floor, and stayed green while the health
// check had no liveness watcher. The script's own docstring asserted the
// membership in prose, which is exactly the "assumed" the criterion refuses.
//
// THE FETCH IS STUBBED, and that is a correction rather than a convenience.
// These cases used to call the real `run()`, which launches one `gh` per
// carrier: on an authenticated machine ~11 network round trips per case in a
// tier that gates every commit, and on CI every workflow came back
// unverifiable. The same assertions meant different things on different
// machines, which is evidence for neither. The corpus builder and the judged
// arithmetic are still the real ones -- only the fetch is replaced.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { healthCarrier } from '../health-carrier.mjs';
import {
  scheduledCarriers,
  run,
  WORKFLOW_FLOOR,
} from '../../../scripts/scheduled-workflow-staleness.mjs';

const TF_DIR = 'apps/addressr-deployment/modules/cloudflare-worker';
const NOW = new Date('2026-09-19T12:00:00Z');
/** Every workflow answered with one scheduled run an hour old. */
const fetchFresh = () =>
  JSON.stringify([
    { event: 'schedule', createdAt: new Date(NOW.getTime() - 3_600_000).toISOString() },
  ]);
/** `gh` absent or unauthenticated. Kept exercised ON PURPOSE -- ADR-052 records
 *  this branch as a closed hole, and before the stub landed its only exerciser
 *  was `gh` happening to be missing on CI. */
const fetchUnreadable = () => {
  throw new Error('gh: command not found');
};

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
    const { findings } = await run({ now: NOW, fetchRuns: fetchFresh });
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
    const { findings } = await run({ now: NOW, fetchRuns: fetchFresh });
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
    const { findings, verdict } = await run({ now: NOW, fetchRuns: fetchFresh });
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

  it('judges the health check\'s own carrier, not merely enumerates it', async () => {
    // ADR-088 CRITERION 7'S TODAY-HALF. The carrier is derived from the workflow
    // that RUNS the health script, shared with the file that pins that
    // workflow's exit-code path, so one rename moves both and neither holds a
    // second path literal.
    const carrier = healthCarrier();
    const { findings, verdict } = await run({ now: NOW, fetchRuns: fetchFresh });

    // Zero-match guard first. `run()` still reads the real workflow directory
    // relative to the working directory, so a wrong cwd would make everything
    // below vacuous.
    const finding = findings.find((f) => f.workflow === carrier);
    assert.ok(
      finding,
      `the staleness check does not report \`${carrier}\`, which is the workflow that runs ` +
        'the managed-channel health script. Its liveness is watched by nothing.',
    );
    assert.notEqual(finding.kind, 'worker-cron');
    // Asserted FALSY, not `=== false`. `assess` omits the field entirely on a
    // healthy finding, and `verdict` counts `judged.filter((f) => f.unverifiable)`
    // -- so falsy is what the arithmetic reads, and pinning a shape the code
    // never produces would be a test fitted to a guess.
    assert.ok(
      !finding.unverifiable,
      `\`${carrier}\` came back unverifiable against a stub that answers every workflow`,
    );

    // AND IT IS IN THE SET THE VERDICT COUNTS, which membership in `findings`
    // does not establish. Every carrier is pushed into `findings`
    // unconditionally; `judged` is a separate filter and only its length reaches
    // `verdict`. So a second exclusion predicate would drop this carrier from
    // the arithmetic while leaving it in `findings`, and an assertion over
    // `findings` alone would stay green over exactly that.
    //
    // THE ANTICIPATED EDIT IS NOT HYPOTHETICAL: `scheduledCarriers` already sets
    // `watched: true` / `watched: false` on every carrier and NOTHING reads it,
    // while `run()` re-derives its exclusion from `kind`. The plausible next
    // change is `findings.filter((f) => f.watched !== false)`, or `watched:
    // false` appearing on a workflow carrier. Either drops this carrier from
    // `judged` silently. This equality is what reds.
    //
    // CONSTRUCTED, NOT PARSED. The below-floor verdict reads "below the floor of
    // 5", so a bare /of (\d+)/ would capture the FLOOR on exactly the
    // corpus-collapse branch. Anchoring on the whole phrase cannot.
    const judged = findings.filter((f) => f.kind !== 'worker-cron');
    assert.ok(
      judged.includes(finding),
      `\`${carrier}\` is reported but excluded from the judged set`,
    );
    assert.match(
      verdict.why,
      new RegExp(`0 stale of ${judged.length}\\b`),
      `the verdict counts a different number than the non-cron carriers, so \`${carrier}\` ` +
        `may be reported without being counted: ${verdict.why}`,
    );
  });

  it('still reports a carrier it cannot read as unverifiable', async () => {
    // ADR-052 records absent `gh` as a closed hole. Before the fetch was
    // stubbed its only exerciser was `gh` happening to be missing on CI, which
    // is coverage by accident. This exercises it on purpose.
    const { findings } = await run({ now: NOW, fetchRuns: fetchUnreadable });
    const carrier = findings.find((f) => f.workflow === healthCarrier());
    assert.ok(carrier, 'the carrier vanished from the corpus when the fetch failed');
    assert.equal(carrier.unverifiable, true);
    assert.equal(
      carrier.stale,
      false,
      'an unreadable carrier is reported stale, which claims more than is known',
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
