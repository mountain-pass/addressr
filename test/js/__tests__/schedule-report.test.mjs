// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// What the session-start reporter says, and to WHOM.
//
// The addressee is the load-bearing property, not a matter of phrasing. ADR-051
// disqualifies a check whose only consumer is the maintainer's attention, and
// names "run X manually before risky changes" as operator memory rather than a
// control. A session-start line whose only discharge is the maintainer
// remembering to do something is that disqualified shape one layer up — so
// every non-silent branch is asserted to carry an instruction the AGENT can
// discharge in-session.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../../../scripts/schedule-report.mjs';
import { VERIFICATION_WINDOW_DAYS } from '../../../scripts/scheduled-workflow-staleness.mjs';

const NOW = new Date('2026-08-20T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('session-start schedule reporter (P101 / ADR-051)', () => {
  it('says NOTHING when the check ran recently and found nothing', () => {
    // The one branch where silence is not a lie. Everything else must speak.
    const lines = report({
      stamp: { checkedAt: daysAgo(1), code: 0, why: '0 stale of 10', findings: [] },
      now: NOW,
    });
    assert.deepEqual(lines, []);
  });

  it('speaks when the check has NEVER run, rather than reading as clean', () => {
    const lines = report({ stamp: null, now: NOW });
    assert.ok(lines.length > 0, 'a never-verified working copy must not be silent');
    assert.match(lines.join('\n'), /never been verified/i);
  });

  it('addresses the AGENT, never the maintainer, in every non-silent branch', () => {
    // The property ADR-051 turns on. Asserted over all of them at once so a
    // branch added later cannot quietly reintroduce a maintainer-addressed line.
    const branches = [
      report({ stamp: null, now: NOW }),
      report({ stamp: { checkedAt: 'not-a-date' }, now: NOW }),
      report({ stamp: { checkedAt: daysAgo(90), code: 0, findings: [] }, now: NOW }),
      report({
        stamp: {
          checkedAt: daysAgo(1),
          code: 1,
          findings: [{ workflow: 'update-wa.yml', stale: true, reason: 'over the 110d bound' }],
        },
        now: NOW,
      }),
    ];
    for (const lines of branches) {
      assert.ok(lines.length > 0);
      const text = lines.join('\n');
      assert.match(text, /ACTION FOR THE AGENT/, `branch is silent about who acts:\n${text}`);
    }
  });

  it('names the stale workflow and its reason, not merely the count', () => {
    const lines = report({
      stamp: {
        checkedAt: daysAgo(1),
        code: 1,
        findings: [{ workflow: 'update-nt.yml', stale: true, reason: 'over the 110d bound' }],
      },
      now: NOW,
    });
    const text = lines.join('\n');
    assert.match(text, /update-nt\.yml/);
    assert.match(text, /110d bound/);
  });

  it('reports an unreadable workflow as not-a-pass rather than omitting it', () => {
    // The defect this replaced: with `gh` absent the CLI printed no finding on
    // stdout at all, so anything reading stdout saw an all-clear.
    const lines = report({
      stamp: {
        checkedAt: daysAgo(1),
        code: 2,
        findings: [{ workflow: 'update-sa.yml', unverifiable: true, reason: 'could not read run history' }],
      },
      now: NOW,
    });
    const text = lines.join('\n');
    assert.match(text, /could not be read/i);
    assert.match(text, /not a pass/i);
    assert.match(text, /update-sa\.yml/);
  });

  it('separates a carrier with no run history from a workflow that could not be read', () => {
    // Both are "not judged", and folding them together goes wrong in whichever
    // direction the fold runs. Printing a Worker cron under "could not be read
    // — this is not a pass" fires that line at every session start forever,
    // which is how a real one gets ignored; suppressing an unreadable WORKFLOW
    // is the false-green this reporter was written to refuse.
    //
    // The discriminator is `kind`, and `schedule-refresh.mjs` now stamps it on
    // every finding. Without this case the only guard feeds a shape the
    // producer no longer emits, so narrowing the filter — to `kind ===
    // undefined`, say — would silence every real unreadable workflow with the
    // suite green.
    const lines = report({
      stamp: {
        checkedAt: daysAgo(1),
        code: 2,
        findings: [
          {
            workflow: 'update-sa.yml',
            kind: 'workflow',
            unverifiable: true,
            reason: 'could not read run history',
          },
          {
            workflow: 'meter_delivery',
            kind: 'worker-cron',
            unverifiable: true,
            reason: 'no scheduled-run history is readable',
          },
        ],
      },
      now: NOW,
    });
    const text = lines.join('\n');

    const notAPass = lines.filter((l) => /not a pass/i.test(l));
    assert.equal(notAPass.length, 1, `expected exactly one not-a-pass heading:\n${text}`);
    assert.match(notAPass[0], /1 scheduled workflow/, 'the Worker cron was counted as a fault');

    // Both carriers are still NAMED — separating them must not lose either.
    assert.match(text, /update-sa\.yml/);
    assert.match(text, /meter_delivery/);

    // And the cron sits under its own heading, saying what is true of it.
    assert.match(text, /no readable run history and are not judged here/);
  });

  it('prints a determined stale finding even when something else was unreadable', () => {
    // Severity is for a caller; the printed findings are the union. Keying the
    // output off the verdict code would hide a known-stale workflow behind an
    // unread one — the exit-code conflation, inverted.
    const lines = report({
      stamp: {
        checkedAt: daysAgo(1),
        code: 2,
        findings: [
          { workflow: 'update-vic.yml', stale: true, reason: 'over the 110d bound' },
          { workflow: 'update-sa.yml', unverifiable: true, reason: 'could not read run history' },
        ],
      },
      now: NOW,
    });
    const text = lines.join('\n');
    assert.match(text, /update-vic\.yml/, 'the stale finding was suppressed by the unverifiable one');
    assert.match(text, /update-sa\.yml/);
  });

  it('escalates on the age of the last SUCCESSFUL verification', () => {
    const withinWindow = report({
      stamp: { checkedAt: daysAgo(VERIFICATION_WINDOW_DAYS), code: 0, findings: [] },
      now: NOW,
    });
    assert.deepEqual(withinWindow, [], 'at exactly the window it is still fresh');

    const past = report({
      stamp: { checkedAt: daysAgo(VERIFICATION_WINDOW_DAYS + 1), code: 0, findings: [] },
      now: NOW,
    });
    assert.match(past.join('\n'), /last VERIFIED/);
  });

  it('distinguishes a stale SCHEDULE from a stale VERIFICATION in its wording', () => {
    // Two different failures that a glanced-at session-start line would
    // otherwise conflate.
    const staleSchedule = report({
      stamp: {
        checkedAt: daysAgo(1),
        code: 1,
        findings: [{ workflow: 'update-qld.yml', stale: true, reason: 'over the 110d bound' }],
      },
      now: NOW,
    }).join('\n');
    const staleVerification = report({
      stamp: { checkedAt: daysAgo(90), code: 0, findings: [] },
      now: NOW,
    }).join('\n');
    assert.match(staleSchedule, /STOPPED FIRING/);
    assert.doesNotMatch(staleSchedule, /last VERIFIED/);
    assert.match(staleVerification, /last VERIFIED/);
    assert.doesNotMatch(staleVerification, /STOPPED FIRING/);
  });

  it('fails CLOSED on an unreadable stamp timestamp', () => {
    const lines = report({ stamp: { checkedAt: 'not-a-date' }, now: NOW });
    assert.ok(lines.length > 0, 'an unreadable timestamp must not read as fresh');
    assert.match(lines.join('\n'), /unreadable/i);
  });
});
