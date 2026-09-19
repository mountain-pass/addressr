// @jtbd JTBD-403 (Know the paid channel still bills correctly)
// @jtbd JTBD-005 (Create and access a managed hosted API account)
// @jtbd JTBD-400 (Ship releases reliably from trunk)
//
// THE LOCAL DRESS REHEARSAL, first slice. The maintainer made a local rehearsal
// the condition of accepting the activation-blocked gates, and ADR-098 widened
// the gateway's origin filter so a page served from a loopback address could
// reach the gateway at all. This is the harness that widening exists for.
//
// THIS SLICE ASSERTS NO BILLING PROPERTY, and the JTBD-403 annotation is on it
// as the first slice of that job's rehearsal outcome, NOT as a discharge of it.
// That outcome was narrowed on review to journeys whose failure would be a
// BILLING fault; origin admission is not one, which is why JTBD-005 carries the
// second annotation -- its screens entry for `managed-account.mjs` already
// enumerates the allowlist as gating the pre-authentication 403 and the CORS
// header, which is exactly what is asserted below. No customer journey runs
// here, so nothing in this file is rehearsal evidence for any journey row.
//
// THE THIRD ANNOTATION IS NOT DECORATION. The compatibility-date assertions bind
// `apps/addressr-deployment/deploy.sh`, which JTBD-400 owns as the deploy
// mechanism. A maintainer arriving from that job to change the pin in the deploy
// script reds this file, so the marker is how they find it. There is no screens
// entry for this file in JTBD-400, following the precedent of
// `managed-app-url-validation-pinned.test.mjs`, which carries the same marker
// and is listed only under JTBD-005.
//
// WHAT THIS SLICE ACTUALLY ADDS, stated narrowly because the honest delta is
// smaller than the apparatus. `managed-account.test.mjs` has 24 cases calling
// the origin filter's module directly, in Node, with a synthesised Request and a
// hand-built environment object, and it already exercises the flag-on path. Its
// rule coverage is not re-claimed here. The delta is BUNDLE VERSUS MODULE: that
// esbuild's output preserves the filter, and that the origin survives the real
// request pipeline in workerd. Nothing else.
//
// THE COMPATIBILITY DATE PIN IS APPARATUS FOR LATER SLICES, NOT EVIDENCE FOR
// THIS ONE. Origin admission is a header read and an array membership test, and
// no compatibility flag changes either -- so the pin buys this slice nothing
// measurable. It is laid now because the slices that follow touch D1 semantics,
// crypto and streams, where it will matter. REASONED, not measured: that the
// pin would matter to those later slices. MEASURED: the values it compares.
//
// WHAT THIS GUARD DOES NOT REACH, recorded because a guard that misdescribes its
// own reach is worse than none:
//   * The sibling `managed-channel-d1.test.mjs` boots Miniflare at 2026-08-29
//     while the deployed Worker pins 2024-01-01. The scan below cannot see it --
//     different key spelling, different value -- so despite this file's name and
//     its one-source principle, the managed channel's own D1 rehearsal runs on a
//     runtime roughly two years newer than the one that applies its migrations
//     in production. That is a fidelity gap in the rehearsal, not in this guard,
//     and nothing covers it today.
//   * The corpus drops `docs/` because it is prose that quotes pins rather than
//     setting them. The principle is prose; the implementation is a path. Tracked
//     prose lives outside it -- the changelogs, `.changeset/*.md`, `AGENTS.md`,
//     `README.md`, `DECISION-MANAGEMENT.md`. None carries the literal today, so
//     the limit is latent: a changeset body quoting the pin would red this suite
//     and would need triaging into KNOWN_SITES or into the exclusion.
//   * Tracked binaries are in the corpus. False positives are implausible; the
//     cost is a little wall-clock in a tier that blocks pre-commit.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const here = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(here), '../../..');
const selfPath = path.relative(root, here);
const workerDirectory = path.join(
  root,
  'apps/addressr-deployment/cloudflare-worker',
);
const migrationsDirectory = path.join(workerDirectory, 'migrations');
const workerModuleDirectory = path.join(
  root,
  'apps/addressr-deployment/modules/cloudflare-worker',
);

/** The origin a rehearsal page would be served from. Any port; presence is what matters. */
const REHEARSAL_ORIGIN = 'http://127.0.0.1:9000';

// CONFIGURED AND EXPECTED TO BE STRIPPED. These sit INSIDE the allowlist on
// purpose. Admission is membership AND shape -- `allowedOrigin` is
// `!origin || allowedOrigins(environment).includes(origin)` -- so an origin left
// out of the allowlist is refused for ABSENCE, and a refusal assertion written
// that way passes with the shape filter deleted entirely. Placing them in the
// configured list makes the filter the only thing that can refuse them.
const CONFIGURED_BUT_REFUSED = [
  'http://evil.example:9000',
  'http://127.0.0.1.attacker.example:9000',
  'http://localhost', // a bare literal, no port
];

/**
 * Every place a compatibility date may be hardcoded, with the reason it is
 * allowed to be. An unknown site reds and asks to be classified into one of
 * these or removed; this list is triage, NOT a drift check.
 *
 * It used to be a drift check requiring the deploy script's pin to equal the
 * Worker's. That was wrong: they are different subjects with no reason to agree,
 * and the worker variable's own description anticipates the Worker's moving
 * alone. The old shape would have reddened on that anticipated bump while
 * pointing at a migrations shim.
 */
const KNOWN_SITES = new Map([
  [
    'apps/addressr-deployment/deploy.sh',
    'a heredoc generating a throwaway wrangler config for `wrangler d1 migrations ' +
      'apply`. It never executes the Worker, so it is deliberately NOT coupled to ' +
      "the Worker's pin and must not be asserted equal to it.",
  ],
]);

/**
 * A named variable's string default, read from a Terraform variables file with
 * the lookup SCOPED TO ITS OWN BLOCK. A repo-wide `default = "..."` match takes
 * the first hit in a file where the key is not unique, so a reordering would
 * silently bind this to a different variable while staying green. Exactly one
 * block must match: a first-match read is the same defect in miniature.
 */
function variableDefault(file, name) {
  const source = readFileSync(file, 'utf8');
  const blocks = [
    ...source.matchAll(
      new RegExp(`variable "${name}"\\s*\\{([\\s\\S]*?)\\n\\}`, 'g'),
    ),
  ];
  assert.equal(
    blocks.length,
    1,
    `expected exactly one variable "${name}" in ${path.relative(root, file)}, found ${blocks.length}`,
  );
  const defaults = [...blocks[0][1].matchAll(/default\s*=\s*"([^"]+)"/g)];
  assert.equal(
    defaults.length,
    1,
    `variable "${name}" declares ${defaults.length} string defaults; this harness reads one`,
  );
  return defaults[0][1];
}

/**
 * Everything git does not ignore, which is the honest definition of "not
 * generated". An earlier version walked the filesystem behind a hand-maintained
 * list of directories that look generated. That list was caught wrong twice --
 * once on `node_modules`, which carries the literal in four vendored files, and
 * once on `tfplan.json`, which `deploy.sh` writes under PLAN_ONLY, is gitignored,
 * and sits where no tree exclusion reached. The second was the worse defect:
 * absent in CI and present only on the machine of whoever last read a plan, so
 * it would have redded locally, stayed green in CI, and taught its reader to
 * dismiss this file.
 *
 * `--cached --others --exclude-standard` rather than bare `git ls-files`,
 * because bare lists the INDEX, and a new unstaged file is neither generated nor
 * ignored yet would have been invisible until `git add`.
 */
function notIgnoredFiles() {
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return listed.split('\0').filter(Boolean);
}

/**
 * Every hardcoded compatibility date outside prose, with its path.
 *
 * SELF-EXCLUDED, and accurately: as written the pattern does NOT match this
 * file, because the escape sequences in the source are literal backslashes and
 * `\s*` does not match one. The exclusion is not repairing a present self-match;
 * it is what stops a future rewording from silently sampling the observer.
 */
function hardcodedCompatibilityDates(corpus) {
  const sites = [];
  for (const relative of corpus) {
    if (relative === selfPath) continue;
    if (relative.startsWith('docs/')) continue;
    let source;
    try {
      source = readFileSync(path.join(root, relative), 'utf8');
    } catch {
      continue; // unreadable or vanished between listing and read
    }
    if (!source.includes('compatibility_date')) continue;
    for (const match of source.matchAll(
      /compatibility_date\s*=\s*"(\d{4}-\d{2}-\d{2})"/g,
    )) {
      sites.push({ file: relative, date: match[1] });
    }
  }
  return sites;
}

const migrationFiles = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith('.sql'))
  .sort();

let miniflare;
let compatibilityDate;
let buildOptions;

/**
 * The esbuild invocation `build:worker` ships, PARSED rather than mirrored. A
 * hand-copied `--bundle --format=esm` is a copy, and a copy lets the shipped
 * build change while this harness keeps rehearsing the old one -- the same
 * reason the sibling D1 suite imports RESERVE_SQL instead of restating it.
 */
function shippedBuildOptions() {
  const { scripts } = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const script = scripts['build:worker'];
  assert.ok(
    script,
    'no build:worker script, so there is no shipped build for this harness to mirror',
  );
  const tokens = script.trim().split(/\s+/);
  assert.equal(
    tokens[0],
    'esbuild',
    'build:worker no longer invokes esbuild directly, so this parse is wrong',
  );
  const entryPoints = tokens.slice(1).filter((token) => !token.startsWith('--'));
  assert.equal(
    entryPoints.length,
    1,
    `build:worker names ${entryPoints.length} entry points; this harness assumes exactly one`,
  );
  const flags = new Map(
    tokens
      .filter((token) => token.startsWith('--'))
      .map((token) => {
        const [flag, ...rest] = token.slice(2).split('=');
        return [flag, rest.length > 0 ? rest.join('=') : true];
      }),
  );
  return { entryPoint: path.join(root, entryPoints[0]), flags };
}

before(async () => {
  assert.ok(
    migrationFiles.length > 0,
    'no migrations enumerated, so every database assertion would pass against an empty schema',
  );
  compatibilityDate = variableDefault(
    path.join(workerModuleDirectory, 'variables.tf'),
    'compatibility_date',
  );
  buildOptions = shippedBuildOptions();

  // Built from source, and there is no alternative: `worker.bundled.js` is
  // gitignored and a test asserts it stays that way, so on a clean checkout
  // there is no committed artefact to read. A test that tolerated its absence
  // would skip, and a rehearsal that skips is the defect class this repository
  // already tracks as open.
  //
  // `write: false` deliberately. Passing the shipped outfile through would drop
  // build output into the working tree on every `test:js`. The consequence, said
  // rather than left implicit: the outfile flag is ASSERTED below, not exercised.
  const built = await build({
    entryPoints: [buildOptions.entryPoint],
    bundle: buildOptions.flags.get('bundle') === true,
    format: buildOptions.flags.get('format'),
    write: false,
    outfile: path.join(workerDirectory, 'worker.bundled.js'),
  });
  assert.equal(built.outputFiles.length, 1, 'the build emitted more than one file');
  const bundle = built.outputFiles[0].text;
  assert.ok(
    bundle.length > 1000,
    'the bundle is implausibly small, so the build produced nothing worth serving',
  );

  miniflare = new Miniflare(
    convertV4MiniflareOptions({
      name: 'managed-channel-rehearsal',
      // No compatibility flags. Production declares none, and adding one here
      // would let the rehearsal pass on a runtime production does not have.
      compatibilityDate,
      // THE WORKER IS THE ENTRYPOINT, and it is the only module. The sibling D1
      // suite ships a second module that applies migrations and dispatches to
      // it, which works there because that migration worker is its entrypoint.
      // Here the Worker must be, so migrations are applied from Node against the
      // database binding instead -- the same `exec` the sibling already uses
      // from Node to seed rows.
      modules: [
        {
          type: 'ESModule',
          path: path.join(workerDirectory, 'worker.rehearsal.bundled.js'),
          contents: bundle,
        },
      ],
      d1Databases: { CUSTOMER_DB: 'managed-channel-rehearsal' },
      bindings: {
        // TRUE here, and that is what makes this a LOCAL rehearsal. This is a
        // Miniflare binding, not the Terraform variable; the Terraform default
        // is untouched and the apply that sets it true IS activation, which
        // remains the maintainer's. Flag-on evidence produced here is PARTIAL
        // by construction and discharges nothing whose subject is production.
        MANAGED_CHANNEL_ENABLED: 'true',
        MANAGED_APP_ORIGINS: JSON.stringify([
          REHEARSAL_ORIGIN,
          ...CONFIGURED_BUT_REFUSED,
        ]),
        MANAGED_APP_URL: REHEARSAL_ORIGIN,
        CLERK_PUBLISHABLE_KEY: 'pk_test_rehearsal',
        CLERK_JWT_KEY: 'rehearsal-jwt-key',
        STRIPE_SECRET_KEY: 'sk_test_rehearsal',
        STRIPE_WEBHOOK_SECRET: 'whsec_rehearsal',
        // The catalogue parser drops any entry that is not shaped exactly so:
        // a `price_`-prefixed priceId, a safe non-negative integer quota, and a
        // boolean hardLimit. An entry missing one is silently filtered out
        // rather than rejected, so a wrong shape here reads as "no plans".
        STRIPE_PLAN_CATALOGUE: JSON.stringify({
          rehearsal: {
            name: 'Rehearsal plan',
            priceId: 'price_rehearsal',
            quota: 1000,
            hardLimit: true,
          },
        }),
        // THE HARNESS FOUND THESE THREE RATHER THAN A READING OF THE SOURCE DID.
        // The first run reported `available: false` with the origin already
        // admitted and echoed, which narrowed it to the configuration predicate:
        // it also requires a meter event name, a meter id and at least one
        // payment method type. A module-level test with a hand-built environment
        // object never has to satisfy the whole predicate, which is part of what
        // booting the real bundle buys.
        STRIPE_METER_EVENT_NAME: 'rehearsal_request',
        STRIPE_METER_ID: 'mtr_rehearsal',
        STRIPE_PAYMENT_METHOD_TYPES: JSON.stringify(['card']),
      },
    }),
  );
  const database = await miniflare.getD1Database('CUSTOMER_DB');
  for (const file of migrationFiles) {
    // Newlines collapsed, matching how the sibling suite feeds `exec`. The
    // remote applier's semicolon-in-comment hazard is a property of that
    // applier, not of this one, so nothing here stands in for it.
    const sql = readFileSync(path.join(migrationsDirectory, file), 'utf8');
    await database.exec(sql.replaceAll('\n', ' '));
  }
  const schema = await database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all();
  assert.ok(
    schema.results.length > 0,
    'no tables exist after applying every migration, so the schema did not land',
  );
});

after(async () => {
  await miniflare?.dispose();
});

describe('the rehearsal harness runs what production runs', () => {
  it('builds a corpus that includes tracked files and excludes ignored ones', () => {
    // The corpus builder needs its own proof, because a builder that silently
    // returned nothing would make every scan below pass having read nothing.
    const corpus = notIgnoredFiles();
    assert.ok(
      corpus.includes('package.json'),
      'the corpus omits a tracked file at the repository root, so it is not listing what git tracks',
    );
    assert.equal(
      corpus.filter((file) => file.startsWith('node_modules/')).length,
      0,
      'the corpus contains vendored files, so --exclude-standard is not taking effect ' +
        'and the scan below will red on a dependency',
    );
    // The --others half cannot be proved here: a fresh CI clone has no
    // untracked-unignored files, so CI only ever exercises --cached. It was
    // mutation-proved locally instead, by dropping a scratch file carrying the
    // literal into the tree and watching the triage assertion red on it.
  });

  it('boots at the compatibility date the deployed Worker is pinned to', () => {
    // Not "a date was read". The value must be the one the module declares, so
    // that pointing the extraction at another variable reds.
    assert.equal(
      compatibilityDate,
      variableDefault(
        path.join(workerModuleDirectory, 'variables.tf'),
        'compatibility_date',
      ),
      'the harness booted at a date other than the one the worker module declares',
    );
    assert.match(compatibilityDate, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('pins the deployed Worker to the variable rather than to a literal', () => {
    // THE ASSERTION THAT ACTUALLY PROTECTS WHAT THIS HARNESS BOOTS AT. If the
    // module ever hardcodes a date, the variable this harness reads stops being
    // what deploys, and every rehearsal below would run on the wrong runtime
    // while staying green.
    const main = readFileSync(path.join(workerModuleDirectory, 'main.tf'), 'utf8');
    const rendered = [...main.matchAll(/compatibility_date\s*=\s*([^\n]+)/g)];
    assert.equal(
      rendered.length,
      1,
      `the worker module assigns compatibility_date ${rendered.length} times; expected one`,
    );
    assert.equal(
      rendered[0][1].trim(),
      'var.compatibility_date',
      'the worker module hardcodes a compatibility date instead of taking the variable',
    );
  });

  it('is not overridden by any Terraform caller', () => {
    // BIDIRECTIONAL. Reading the module default is only correct while nothing
    // overrides it -- the moment a caller passes its own, this harness rehearses
    // a runtime production does not have, while staying green.
    const callers = readFileSync(
      path.join(root, 'apps/addressr-deployment/main.tf'),
      'utf8',
    );
    assert.doesNotMatch(
      callers,
      /compatibility_date\s*=/,
      'a Terraform caller now overrides compatibility_date, so the module default is no ' +
        'longer what deploys and this harness is rehearsing the wrong runtime',
    );
  });

  it('hardcodes a compatibility date only where a known site says why', () => {
    const sites = hardcodedCompatibilityDates(notIgnoredFiles());
    const unknown = sites.filter((site) => !KNOWN_SITES.has(site.file));
    assert.deepEqual(
      unknown,
      [],
      'these files hardcode a compatibility date and nothing says why: ' +
        `${unknown.map((site) => `${site.file}=${site.date}`).join(', ')}. ` +
        'Classify each into KNOWN_SITES with its reason, or remove the literal.',
    );
    // PER-ENTRY FLOOR. A count floor would let the list go stale silently if a
    // known heredoc were removed; this names the entry that stopped matching.
    const unmatched = [...KNOWN_SITES.keys()].filter(
      (file) => !sites.some((site) => site.file === file),
    );
    assert.deepEqual(
      unmatched,
      [],
      `these known sites no longer hardcode a compatibility date: ${unmatched.join(', ')}. ` +
        'The literal moved; update KNOWN_SITES deliberately rather than leaving it stale.',
    );
  });

  it('serves the bundle the release ships, built by the invocation the release uses', () => {
    assert.equal(
      buildOptions.entryPoint,
      path.join(workerDirectory, 'worker.js'),
      'build:worker no longer bundles the worker entry this harness serves',
    );
    assert.equal(buildOptions.flags.get('bundle'), true);
    assert.equal(buildOptions.flags.get('format'), 'esm');
  });
});

describe('the bundled gateway admits a loopback origin in the pinned runtime', () => {
  it('admits the configured loopback origin and echoes it back', async () => {
    const response = await miniflare.dispatchFetch(
      'https://api.addressr.io/managed/config',
      { headers: { Origin: REHEARSAL_ORIGIN } },
    );
    assert.equal(
      response.status,
      200,
      'the bundled Worker refused a loopback origin the allowlist carries',
    );
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      REHEARSAL_ORIGIN,
      'the origin was admitted but not echoed, so a browser would still refuse the response',
    );
    const body = await response.json();
    assert.equal(body.available, true, 'the managed channel reports unavailable');
  });

  it('refuses every configured origin the shape filter strips', async () => {
    // Each of these IS in MANAGED_APP_ORIGINS, so a 403 here can only come from
    // the filter. Delete the filter and this reds; that is the whole point of
    // configuring them rather than omitting them.
    for (const origin of CONFIGURED_BUT_REFUSED) {
      const response = await miniflare.dispatchFetch(
        'https://api.addressr.io/managed/config',
        { headers: { Origin: origin } },
      );
      assert.equal(
        response.status,
        403,
        `the bundled Worker admitted ${origin}, which is configured but must be stripped`,
      );
    }
  });

  it('records that the contains-attack refusal is an http rule and not a substring guard', async () => {
    // HONEST BOUNDARY, asserted rather than left for a reader to assume. The
    // refusal of `http://127.0.0.1.attacker.example:9000` above is a property of
    // the HTTP rule. The https rule is `^https://[a-z0-9.-]+$`, which ADMITS
    // `https://localhost.attacker.example` -- that admissibility predates
    // ADR-098 and is untouched by it. So the 403 below is for ABSENCE from the
    // allowlist, NOT for shape, and this case must not be read as a substring
    // guard. Reaching admission still requires that host to BE the configured
    // app URL, which is one Terraform variable under a `^https://` validation.
    const containsOverHttps = 'https://localhost.attacker.example';
    const response = await miniflare.dispatchFetch(
      'https://api.addressr.io/managed/config',
      { headers: { Origin: containsOverHttps } },
    );
    assert.equal(
      response.status,
      403,
      'this origin is not configured, so it must be refused for absence; if this ever ' +
        'returns 200 the allowlist has grown and the comment above needs rereading',
    );
  });
});
