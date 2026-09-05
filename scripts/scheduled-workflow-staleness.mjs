#!/usr/bin/env node
// Is every scheduled workflow still actually firing?
//
// WHY THIS IS NOT THE SAME AS A FAILURE NOTIFICATION. A failure notification
// cannot fire for a workflow that never runs. Most of this repo's scheduled
// workflows run QUARTERLY (21st and 28th of Feb/May/Aug/Nov), so
// "stopped running entirely" has a blind window of up to three months — and
// GitHub disables scheduled workflows outright after 60 days of repository
// inactivity, which is exactly the state a quiet quarter produces. For most of
// this repo's scheduled surface, staleness is the ONLY thing that can detect
// the failure mode at all (P101).
//
// AND IT MUST FILTER ON event=schedule. On 2026-08-19 update-ot's two most
// recent runs were both workflow_dispatch. In a default run listing a manual
// green is indistinguishable from a scheduled green, so "the workflow is fine"
// reads true while the schedule itself could have stopped firing months
// earlier. Its last genuinely scheduled run was 2026-05-28, same as its
// siblings. A staleness check that takes the newest run of any kind is green
// over exactly the case it exists to catch.
//
// WAS deliberately wired to nothing, and no longer is. The routing question
// P101 task 2 left open — which signal a stale schedule should red — was
// answered by wiring it to a session-start report rather than to a gate:
// `check-schedules` runs it, `schedule-refresh.mjs` stamps the result, and
// `schedule-report.mjs` puts findings in front of an agent at session start.
// The header said otherwise long after it stopped being true, which is why it
// is corrected here rather than quietly deleted.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Coarse cadence from a cron expression. Deliberately coarse: the question is
 * "has this stopped firing", not "did it fire at the exact minute", so an
 * order-of-magnitude bound is enough and a full cron parser is not worth its
 * own defect surface.
 */
export function cadenceOf(cron) {
  // Limit 5, not 4. An earlier version used 4 and silently dropped day-of-week,
  // so `0 3 * * 1` fell through to daily.
  const fields = cron.trim().split(/\s+/, 5);
  const month = fields[3];
  if (month !== '*') return 'quarterly';
  const dom = fields[2];
  if (dom !== '*') return 'monthly';
  const dow = fields[4];
  // Day-of-week is read, not discarded. An earlier version limited the split
  // to four fields and dropped it, so `0 3 * * 1` fell through to daily and
  // took the 3-day bound against a 7-day cadence — STALE on four days of every
  // seven, permanently. That is the flapping alarm the bounds below exist to
  // prevent, arriving through the classifier instead. gnaf-source-smoke.yml
  // records weekly being actively weighed and rejected, so this is a shape the
  // repo could adopt tomorrow, not a hypothetical.
  if (dow !== undefined && dow !== '*') return 'weekly';
  return 'daily';
}

// Two to three missed firings before complaining — one missed run is a hiccup,
// and a tighter bound flaps. A flapping alarm is how the real one gets ignored,
// which is P101's own subject.
//
// NOT uniformly two, and the header said so until it was checked against its own
// table. `daily: 3` alarms at age 4, after misses at days 1, 2 and 3 — three
// intervals. `weekly: 21` is the same multiplier. `monthly: 70` is ~2.3, and
// quarterly is two or three depending which of its paired fire dates last ran.
// The rule the table actually follows is 'two to three', so that is what this
// says now.
//
// Quarterly is derived from the ACTUAL firing pattern, not from the quarter.
// `21,28 2,5,8,11` fires TWICE per quarter, a week apart, so the gaps are
// 7, 7, ~85 — the largest healthy gap is 85 days, not 92. Two missed firings
// from the 28th is ~92. An earlier version used 200 on the reasoning that a
// shifted month must not trip it, which is true but bought that safety with
// four missed firings of blindness: from a 28 May run, 200 days reaches
// mid-December, by which point 21 Aug, 28 Aug, 21 Nov and 28 Nov have all been
// missed — and GitHub's 60-day inactivity auto-disable, the hazard this exists
// to catch, would have fired ~140 days earlier. 110 is flap-free against an
// 85-day healthy gap and gives back ninety blind days.
export const MAX_AGE_DAYS = { daily: 3, weekly: 21, monthly: 70, quarterly: 110 };

// The corpus must be believable before "0 stale" means anything. Verified
// 2026-08-20: over an empty `.github/workflows` this CLI printed "0 stale of 0"
// and exited 0 — a clean bill of health over nothing, which is P106's shape.
// The test tier had a floor; the RUNTIME did not, and the runtime is what a
// session-start reporter believes.
//
// Five is INCLUSIVE — five workflows is believable, four is not. Stated as a
// boundary rather than as "floor 5" because the two sibling guards in this repo
// disagree with each other on exactly that (`>= 5` here, `> 5` in
// workflow-npm-scripts-resolve), and this repo has already been bitten by the
// same off-by-one in prose. schedule-verdict.test.mjs pins both sides.
//
// What it CANNOT do, stated so the guarantee is not overread: it detects the
// corpus COLLAPSING, not the corpus ERODING. The floor is well under the
// corpus size, so losing several carriers silently would still clear it. That
// is the deliberate trade against a hardcoded expected list, which would not
// cover a new carrier on the day it lands (P101 task 3). Stated without a
// count on purpose: the corpus has grown twice since this was written and the
// number went stale both times.
export const WORKFLOW_FLOOR = 5;

// How long a successful verification stays good, DERIVED rather than chosen.
// The reporter prints from a stamp that may itself be up to this old, so a free
// -standing constant here silently adds to whatever the tightest cadence bound
// is. Taking the minimum bounds the additive latency at 2x the tightest bound
// and moves automatically if MAX_AGE_DAYS moves.
export const VERIFICATION_WINDOW_DAYS = Math.min(...Object.values(MAX_AGE_DAYS));

/**
 * Three states, not two: clean / stale / unverifiable.
 *
 * The code is SEVERITY FOR A CALLER, and is deliberately not the message. A
 * determined stale finding must still be printed when something else was
 * unverifiable — keying output off this code alone would suppress three known
 * stale workflows behind one unread one, which is the exit-1-conflates-
 * stale-with-crashed defect in mirror image.
 */
export function verdict({ total, stale, unverifiable }) {
  if (total < WORKFLOW_FLOOR) {
    return {
      code: 2,
      why: `only ${total} scheduled workflows found, below the floor of ${WORKFLOW_FLOOR} — the corpus itself is not believable, so "0 stale" cannot be`,
    };
  }
  if (unverifiable > 0) {
    return { code: 2, why: `${unverifiable} of ${total} could not be read` };
  }
  if (stale > 0) return { code: 1, why: `${stale} of ${total} stale` };
  return { code: 0, why: `0 stale of ${total}` };
}

/**
 * The newest SCHEDULE-triggered run from a run listing, or null.
 *
 * This lives here rather than in the caller because it is the load-bearing
 * half of the check. On 2026-08-19 update-ot's two newest runs were both
 * workflow_dispatch, over a last scheduled run 83 days older. Taking the
 * newest run of any kind reports that workflow healthy while saying nothing
 * whatsoever about whether its schedule still fires. A staleness check that
 * does not filter is green over precisely the case it exists to catch, so the
 * filter is not left to whoever calls this.
 */
export function lastScheduledRunFrom(runs) {
  const scheduled = (runs ?? [])
    .filter((r) => r.event === 'schedule')
    .map((r) => r.createdAt)
    // ISO-8601 UTC strings sort lexicographically in chronological order, so a
    // plain string compare is correct here and needs no Date parsing.
    .toSorted((a, b) => a.localeCompare(b));
  return scheduled.length > 0 ? scheduled.at(-1) : undefined;
}

export function assess({ workflow, cron, lastScheduledRun, now }) {
  const cadence = cadenceOf(cron);
  const limit = MAX_AGE_DAYS[cadence];
  if (!lastScheduledRun) {
    // UNVERIFIABLE, not stale. A newly added quarterly workflow has no
    // scheduled run until it first fires, which can be 110 days away — calling
    // that STALE prints a standing, correct-to-ignore finding at every session
    // start for three months, and a finding that is always there is one nobody
    // reads. "I cannot tell yet" is the honest state and it is not silence.
    return { workflow, cadence, limit, ageDays: undefined, stale: false, unverifiable: true,
      reason: 'no schedule-triggered run in the fetched window — either it has never fired, or the window is too short' };
  }
  const ageDays = Math.floor((now - new Date(lastScheduledRun)) / 86_400_000);
  // An unparseable timestamp must fail CLOSED. `NaN > limit` is false, so
  // without this the workflow reported "within the bound" — a silent green,
  // which is the one direction a staleness check must never fail in. The
  // unreadable-listing path in the CLI already fails closed; this is the same
  // rule applied one layer down.
  if (Number.isNaN(ageDays)) {
    return { workflow, cadence, limit, ageDays: undefined, stale: true,
      reason: `last schedule-triggered run timestamp is unreadable (${lastScheduledRun})` };
  }
  return {
    workflow, cadence, limit, ageDays,
    stale: ageDays > limit,
    reason: ageDays > limit
      ? `last schedule-triggered run was ${ageDays}d ago, over the ${limit}d bound for a ${cadence} workflow`
      : `last schedule-triggered run ${ageDays}d ago, within the ${limit}d bound`,
  };
}

/** Every workflow carrying a `schedule:` trigger, with its first cron line. */
export function scheduledWorkflows(dir) {
  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
    const text = readFileSync(path.join(dir, file), 'utf8');
    if (!/^\s*schedule:/m.test(text)) continue;
    const cron = text.match(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/m)?.[1];
    out.push({ workflow: file, cron });
  }
  return out;
}

/**
 * Every scheduled CARRIER in the repository, from both places one can be
 * declared: a GitHub workflow with a `schedule:` trigger, and a Cloudflare
 * Worker cron trigger declared in Terraform.
 *
 * The second exists because ADR-089 (proposed) retargets confirmation
 * criterion 7: IF the managed-channel health check moves off its CI workflow
 * and onto the Worker's scheduled handler, its carrier must sit inside a
 * liveness corpus. That replacement is NOT built — `managed-channel-health.yml`
 * is still the carrier and is still in the corpus. But a corpus reading only
 * `.github/workflows` could not see a Worker cron at all, so widening it is the
 * precondition rather than a consequence, and it brings today's only Worker
 * cron, `meter_delivery`, in with it.
 *
 * ENUMERATION IS NOT YET WATCHING, and the distinction matters. `run()` below
 * asks GitHub when each workflow last fired on a `schedule` event; there is no
 * equivalent question for a Worker cron, because Cloudflare is not `gh`. So a
 * worker-cron carrier appears here and is not yet judged for staleness. The
 * freshness half needs the handler to record its own last successful run
 * somewhere readable. Until then criterion 7 is open, and saying otherwise
 * because the carrier is merely visible would be the exact substitution of
 * presence for coverage that ADR-051 rejects.
 */
export function scheduledCarriers({
  workflowDir = '.github/workflows',
  terraformDirs = ['apps/addressr-deployment/modules/cloudflare-worker'],
} = {}) {
  const carriers = scheduledWorkflows(workflowDir).map((w) => ({
    kind: 'workflow',
    name: w.workflow,
    cron: w.cron,
    watched: true,
  }));

  for (const dir of terraformDirs) {
    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.tf'));
    } catch {
      continue;
    }
    for (const file of files) {
      const text = readFileSync(path.join(dir, file), 'utf8');
      // One entry per cron_trigger resource, so a second trigger cannot hide
      // behind the first.
      for (const m of text.matchAll(
        /resource\s+"cloudflare_workers_cron_trigger"\s+"([a-z0-9_]+)"\s*\{([\s\S]*?)\n\}/g,
      )) {
        carriers.push({
          kind: 'worker-cron',
          name: m[1],
          cron: m[2].match(/cron\s*=\s*"([^"]+)"/)?.[1],
          watched: false,
        });
      }
    }
  }
  return carriers;
}

// --- CLI ------------------------------------------------------------------
// One line per workflow, exit 1 if any is stale. The `gh` call is here rather
// than in the exported functions above so the decision logic stays testable
// without a network.
export async function run({ dir = '.github/workflows', now = new Date() } = {}) {
  const { execFileSync } = await import('node:child_process');
  const carriers = scheduledCarriers({ workflowDir: dir });
  const findings = [];
  for (const w of carriers) {
    // A Worker cron has no `gh` question. It is reported UNVERIFIABLE rather
    // than omitted or called ok: omitting it would put the carrier back outside
    // the corpus, and a green line for something nothing watched is worse than
    // an honest unknown. This is the state ADR-089 criterion 7 is open on.
    if (w.kind === 'worker-cron') {
      findings.push({
        workflow: w.name, kind: w.kind, unverifiable: true, stale: false,
        reason: `Worker cron ${w.cron ?? '(no cadence)'} — no scheduled-run history is readable, so freshness is unknown`,
      });
      continue;
    }
    let runs = [];
    try {
      runs = JSON.parse(
        execFileSync(
          'gh',
          // `--event schedule` so the window is scheduled runs ONLY. Without it
          // the `--limit` window is shared with dispatches and PR runs, so 30
          // manual runs evict the scheduled evidence and a healthy workflow
          // reports as having never fired. That fails loud rather than silent,
          // but a flapping alarm is how the real one gets ignored (P101).
          ['run', 'list', '--workflow', w.name, '--event', 'schedule',
            '--limit', '30', '--json', 'event,createdAt'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      );
    } catch (error) {
      findings.push({
        workflow: w.name, kind: w.kind, unverifiable: true, stale: false,
        reason: `could not read run history (${error.message.split('\n', 1)[0]})`,
      });
      continue;
    }
    findings.push({
      kind: w.kind,
      ...assess({ workflow: w.name, cron: w.cron, lastScheduledRun: lastScheduledRunFrom(runs), now }),
    });
  }
  // Worker crons are REPORTED but excluded from the verdict arithmetic. They
  // cannot be judged — Cloudflare is not `gh` — so counting them as
  // unverifiable would pin the exit code at 2 forever, and a check that always
  // says "something could not be read" is the flapping alarm this file's header
  // warns about: it would devalue the verdict for every workflow that CAN be
  // judged. They stay in `findings`, so a reader still sees the carrier and its
  // unknown state, and the summary names the exclusion rather than hiding it.
  // When the handler records its own last run, they become judgeable and this
  // exclusion goes.
  const judged = findings.filter((f) => f.kind !== 'worker-cron');
  const excluded = findings.length - judged.length;
  const stale = judged.filter((f) => f.stale).length;
  const unverifiable = judged.filter((f) => f.unverifiable).length;
  const v = verdict({ total: judged.length, stale, unverifiable });
  return {
    findings,
    verdict: excluded
      ? { ...v, why: `${v.why}; ${excluded} Worker cron(s) reported but not counted — no run history is readable for them` }
      : v,
  };
}

async function main() {
  const { findings, verdict: v } = await run();
  for (const f of findings) {
    // The union, NOT the verdict's winner. Keying the output off the severity
    // code would hide three determined-stale workflows behind one unreadable
    // one — the same conflation this change exists to remove, inverted.
    const tag = f.unverifiable ? 'UNKNOWN ' : f.stale ? 'STALE   ' : 'ok      ';
    console.log(`${tag}${f.workflow.padEnd(26)}${f.reason}`);
  }
  console.log(`\n${v.why}`);
  return v.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
