#!/usr/bin/env node
// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// What a session start says about scheduled-workflow staleness, and what it
// deliberately does not say.
//
// THIS DOES NO NETWORK. It reads a stamp written by a previous run and returns.
// The real check takes ~11s (measured 2026-08-20, one `gh run list` call per
// scheduled workflow), which is not a cost worth paying at every session start
// for a signal
// whose blind window is 60-110 days. So the reporter reads the LAST result and
// spawns the refresh detached; a finding surfaces at the next session start,
// which loses nothing against a three-month window.
//
// THE ADDRESSEE IS THE AGENT, NOT THE MAINTAINER, and that is the whole point
// rather than a detail of phrasing. ADR-051 disqualifies a check whose only
// consumer is the maintainer's attention, and it names "run X manually before
// risky changes" as operator memory rather than a control. A line reading
// "staleness unverified since <date>" is exactly that shape one layer up: its
// only discharge is the maintainer remembering. So every branch below emits an
// instruction THIS AGENT can discharge in-session without them.
//
// IT ALWAYS EXITS 0. A SessionStart hook that fails must not stop a session
// from starting. That makes it a silent-exit-0 surface by construction — the
// P062 / ADR-038 class, where an unregistered or crashing hook is
// observationally identical to a healthy repo. Two things bound that:
//   - the REFRESHER is self-checking. If the detached child never runs, the
//     stamp ages out and the unverified branch fires. That is the design's best
//     property and it costs nothing.
//   - the REPORTER is not self-checking, and no amount of care here makes it
//     so. It is covered by an end-to-end assertion in the test tier instead.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { VERIFICATION_WINDOW_DAYS } from './scheduled-workflow-staleness.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
// DURABLE, and separate from the rate-limit token on purpose. $TMPDIR is wiped
// between sessions on this machine, so a stamp kept there would make "verified
// an hour ago" indistinguishable from "never verified" and the unverified
// branch would fire on every fresh session — the train-them-to-ignore-it defect
// this whole exercise exists to remove.
export const STAMP = path.join(repoRoot, '.addressr-state', 'schedule-check.json');
// EPHEMERAL. Losing this only means the refresh runs more often, which costs
// latency in a detached child and never costs a missed detection.
const TOKEN = path.join(tmpdir(), 'addressr-schedule-refresh');

const DAY = 86_400_000;

/**
 * What to print, given a stamp and the time. Pure, so the branches are testable
 * without a clock, a filesystem or a network.
 *
 * Returns [] for the fresh case — printing nothing is correct there, and is the
 * only branch where silence is not a lie.
 */
export function report({ stamp, now }) {
  if (!stamp || !stamp.checkedAt) {
    return [
      'Scheduled-workflow staleness has NEVER been verified in this working copy.',
      'ACTION FOR THE AGENT, not the maintainer: run `npm run check-schedules` now and report any',
      'workflow it names before doing anything else. Do not ask the maintainer to run it.',
    ];
  }
  const ageDays = Math.floor((now - new Date(stamp.checkedAt)) / DAY);
  if (Number.isNaN(ageDays)) {
    // Fail closed. An unreadable timestamp must not read as fresh — the same
    // rule the staleness check itself applies one layer down.
    return [
      `The staleness stamp carries an unreadable timestamp (${stamp.checkedAt}).`,
      'ACTION FOR THE AGENT: run `npm run check-schedules` now and report what it says.',
    ];
  }
  const lines = [];
  // Findings are printed as the UNION and independently of the verdict code, so
  // a determined stale workflow is never suppressed behind an unreadable one.
  const stale = (stamp.findings ?? []).filter((f) => f.stale);
  // Worker crons are separated from the unreadable ones. Both are "not judged",
  // but an unreadable WORKFLOW is a fault to chase, while a Worker cron has no
  // run history to read by construction — there is no `gh` question for a
  // Cloudflare schedule. Folding the second into the first would print "could
  // not be read — this is not a pass" at every session start, forever, which is
  // the flapping alarm that gets a real one ignored. The carrier is still shown,
  // under its own heading, saying what is true of it.
  const unwatchable = (stamp.findings ?? []).filter((f) => f.kind === 'worker-cron');
  const unknown = (stamp.findings ?? []).filter(
    (f) => f.unverifiable && f.kind !== 'worker-cron',
  );
  if (stale.length > 0) {
    lines.push(`${stale.length} scheduled workflow(s) have STOPPED FIRING:`);
    for (const f of stale) lines.push(`  ${f.workflow} — ${f.reason}`);
    lines.push('ACTION FOR THE AGENT: this is a real finding. Establish why the schedule stopped');
    lines.push('(GitHub disables scheduled workflows after 60 days of repository inactivity) and');
    lines.push('report it to the maintainer with a remedy, not just the fact.');
  }
  if (unknown.length > 0) {
    lines.push(`${unknown.length} scheduled workflow(s) could not be read — this is not a pass:`);
    for (const f of unknown) lines.push(`  ${f.workflow} — ${f.reason}`);
  }
  if (unwatchable.length > 0) {
    lines.push(
      `${unwatchable.length} carrier(s) have no readable run history and are not judged here:`,
    );
    for (const f of unwatchable) lines.push(`  ${f.workflow} — ${f.reason}`);
  }
  // The verification's OWN staleness, which is a different thing from a stale
  // schedule and is deliberately worded differently so the two are not confused
  // in a session-start line read at a glance.
  if (ageDays > VERIFICATION_WINDOW_DAYS) {
    lines.push(
      `Staleness was last VERIFIED ${ageDays}d ago, over the ${VERIFICATION_WINDOW_DAYS}d window ` +
        `(the tightest cadence bound it defends).`,
    );
    lines.push('ACTION FOR THE AGENT: run `npm run check-schedules` in the foreground now.');
  }
  return lines;
}

function readStamp() {
  try {
    return JSON.parse(readFileSync(STAMP, 'utf8'));
  } catch {
    return null;
  }
}

/** Kick the real check off detached, at most once per day. Never blocks. */
async function refresh() {
  const { spawn } = await import('node:child_process');
  try {
    const last = readFileSync(TOKEN, 'utf8');
    if (Date.now() - Number(last) < DAY) return;
  } catch {
    // No token, or an unreadable one. Refresh — the failure direction is an
    // extra run, never a missed one.
  }
  try {
    writeFileSync(TOKEN, String(Date.now()));
    mkdirSync(path.dirname(STAMP), { recursive: true });
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./schedule-refresh.mjs', import.meta.url))],
      { detached: true, stdio: 'ignore', cwd: repoRoot },
    );
    child.unref();
  } catch {
    // A refresh that cannot start is exactly what the stamp's own age catches
    // at the next session, so there is nothing to say here and nothing to fail.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const line of report({ stamp: readStamp(), now: new Date() })) console.log(line);
  await refresh();
  process.exit(0);
}
