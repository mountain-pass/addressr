#!/usr/bin/env node
// @jtbd JTBD-400 (Ship Releases Reliably From Trunk)
//
// Runs the real staleness check and writes the stamp the session-start reporter
// reads. Spawned detached by `schedule-report.mjs`; never run in a session's
// foreground, because it takes ~11s.
//
// IT WRITES THE STAMP ONLY ON A COMPLETED RUN, whatever the verdict. Clean,
// stale and unverifiable all update `checkedAt`, because all three mean the
// check RAN. A crash writes nothing, so the stamp ages and the reporter's
// unverified branch fires — which is how the refresher stays self-checking
// without a second instrument watching it.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { run } from './scheduled-workflow-staleness.mjs';
import { STAMP } from './schedule-report.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { findings, verdict } = await run();
    mkdirSync(path.dirname(STAMP), { recursive: true });
    writeFileSync(
      STAMP,
      `${JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          code: verdict.code,
          why: verdict.why,
          // Only the findings worth re-reporting. Storing the healthy ones too
          // would make the stamp grow with the corpus for no reader.
          findings: findings.filter((f) => f.stale || f.unverifiable),
        },
        null,
        2,
      )}\n`,
    );
    process.exit(0);
  } catch {
    // Deliberately writes NOTHING on a crash. Stamping a failed run would make
    // "the checker is broken" look like "recently verified, all clear", which
    // is the silent-green this whole design exists to avoid.
    process.exit(1);
  }
}
