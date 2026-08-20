// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// The wiring between `.claude/settings.json` and the scripts it names, and the
// ignore rule the staleness stamp depends on.
//
// WHY THIS SITS OUTSIDE THE THING IT PROTECTS. A hook that is unregistered,
// renamed, or pointed at a path that no longer exists produces NO OUTPUT and NO
// ERROR — it is observationally identical to a healthy repo. That is P062's
// class exactly: ADR-038 records a SessionStart hook whose "every miss is a
// silent `exit 0`" injecting nothing into any session for months, undetected.
// A check living inside the hook cannot catch the hook not running, so this
// runs in the ordinary unit suite instead.
//
// AND IT RECONCILES AGAINST THE FILESYSTEM rather than merely counting. P103's
// verified remedy for the doc-link corpus was reconciliation, on the grounds
// that a floored-but-self-derived scan passes vacuously the moment the scan key
// changes shape. So every hook command here is resolved against disk.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const settings = JSON.parse(readFileSync(path.join(repoRoot, '.claude/settings.json'), 'utf8'));

/** Every `command` string across every hook event, with its event name. */
function hookCommands() {
  const out = [];
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    for (const entry of entries ?? []) {
      for (const h of entry.hooks ?? []) {
        if (h.type === 'command' && h.command) out.push({ event, command: h.command });
      }
    }
  }
  return out;
}

describe('.claude/settings.json hook wiring (ADR-051 / P103)', () => {
  it('finds hook commands to check, so a zero-match pass is impossible', () => {
    // The corpus floor. Every array in this file was empty until 2026-08-20, so
    // "no dangling referrers" was true and meaningless; it must not silently
    // return to that state and keep reading as a pass.
    assert.ok(hookCommands().length > 0, 'no hook commands found — this guard would pass vacuously');
  });

  it('resolves every script a hook names against the filesystem', () => {
    // The referrer class ADR-048 lists as NOT COVERED and P103 owns: a bare
    // script path in a config file, which no guard reads and no runtime
    // executes until the moment it is needed.
    for (const { event, command } of hookCommands()) {
      for (const token of command.split(/\s+/)) {
        if (!/^[\w./-]+\.(mjs|js|sh)$/.test(token)) continue;
        assert.ok(
          existsSync(path.join(repoRoot, token)),
          `${event} hook names "${token}", which does not exist`,
        );
      }
    }
  });

  it('registers the staleness reporter at session start', () => {
    const commands = hookCommands()
      .filter((h) => h.event === 'SessionStart')
      .map((h) => h.command);
    assert.ok(
      commands.some((c) => c.includes('schedule-report.mjs')),
      'the SessionStart staleness reporter is not registered — it would be silent, and silence is what it reports when healthy',
    );
  });

  it('keeps the staleness stamp out of git, and untracked as well as ignored', () => {
    // Two assertions, not one. `check-ignore` proves the RULE matches and says
    // nothing about a path that was already tracked when the rule landed —
    // and a committed stamp is worse than no stamp, because every clone would
    // then read another machine's success timestamp and print nothing.
    const stamp = '.addressr-state/schedule-check.json';
    const ignored = spawnSync('git', ['check-ignore', '--no-index', stamp], { cwd: repoRoot });
    assert.equal(ignored.status, 0, `${stamp} is not covered by .gitignore — an anchored rule may have been stripped by a move`);

    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', stamp], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    assert.notEqual(tracked.status, 0, `${stamp} is TRACKED — ignoring it now does not untrack it`);
  });
});
