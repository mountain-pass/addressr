import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  assessHealthRuns,
  healthFromRow,
  healthQuery,
  readManagedHealth,
  readHealthRuns,
  REPORT_PREFIX,
} from '../../../scripts/managed-channel-health.mjs';
import { reconciliationWindow } from '../../../apps/addressr-deployment/cloudflare-worker/meter-policy.mjs';

const now = new Date('2026-08-31T10:10:00.000Z');
const clear = {
  delivery_exhausted: 0,
  delivery_overdue: 0,
  reconciliation_missing: 0,
  reconciliation_pending: 0,
  reconciliation_failed: 0,
};
const environment = {
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  CLOUDFLARE_API_TOKEN: 'synthetic-secret',
};
const database = {
  name: 'addressr-managed-channel',
  uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
};
const run = {
  id: 1,
  status: 'completed',
  conclusion: 'success',
  head_branch: 'master',
  event: 'schedule',
  run_started_at: '2026-08-31T10:07:00.000Z',
};
const logs = REPORT_PREFIX + JSON.stringify(healthFromRow(clear, now));

test('health windows retain the producer delay and allow its next invocation', () => {
  assert.deepEqual(reconciliationWindow(now), {
    start: new Date('2026-08-31T08:00:00Z'),
    end: new Date('2026-08-31T09:00:00Z'),
  });
  assert.equal(
    healthQuery(new Date('2026-08-31T10:04:59Z')).params[1],
    '2026-08-31T08:00:00.000Z',
  );
  assert.equal(
    healthQuery(new Date('2026-08-31T10:05:00Z')).params[1],
    '2026-08-31T09:00:00.000Z',
  );
});

test('provider reads stay on the fixed Cloudflare endpoint and suppress unsafe results', async () => {
  const calls = [];
  const healthy = await readManagedHealth(
    environment,
    async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        success: true,
        result:
          calls.length === 1
            ? [database]
            : [
                {
                  success: true,
                  results: [clear],
                  meta: { rows_written: 0, changed_db: false },
                },
              ],
      });
    },
    now,
  );
  assert.deepEqual(healthy, healthFromRow(clear, now));
  assert.equal(calls.length, 2);
  for (const { url, options } of calls) {
    assert.equal(new URL(url).origin, 'https://api.cloudflare.com');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-secret');
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.deepEqual(JSON.parse(calls[1].options.body), healthQuery(now));
  for (const response of [
    new Response('synthetic-secret', { status: 403 }),
    Response.json({ success: false, errors: ['synthetic-secret'] }),
    Response.json({ success: true, result: [database, database] }),
  ]) {
    const result = await readManagedHealth(
      environment,
      async () => response,
      now,
    );
    assert.equal(result.status, 'unverified');
    assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
  }
  const unavailable = await readManagedHealth(
    {},
    () => assert.fail('no credentials'),
    now,
  );
  assert.equal(unavailable.status, 'unverified');
  for (const meta of [{ changed_db: true }, { rows_written: 1 }]) {
    let call = 0;
    const written = await readManagedHealth(
      environment,
      async () =>
        Response.json({
          success: true,
          result:
            ++call === 1
              ? [database]
              : [{ success: true, results: [clear], meta }],
        }),
      now,
    );
    assert.equal(written.status, 'unverified');
    assert.deepEqual(written.findings, ['invalid_query_result']);
  }
  const timedOut = await readManagedHealth(
    environment,
    async () => {
      throw new Error('synthetic-secret');
    },
    now,
  );
  assert.deepEqual(timedOut.findings, ['provider_unavailable']);
  assert.ok(!JSON.stringify(timedOut).includes('synthetic-secret'));
  assert.equal(
    healthFromRow({ ...clear, delivery_overdue: 'secret' }, now).status,
    'unverified',
  );
  const cli = spawnSync(
    process.execPath,
    ['scripts/managed-channel-health.mjs'],
    {
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: '',
        CLOUDFLARE_ACCOUNT_ID: '',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /credentials_unavailable/);
});

test('agent reader rejects failed, stale, absent and malformed monitoring evidence', () => {
  const baseline = {
    workflow: { state: 'active' },
    latest: run,
    scheduled: run,
    logs,
  };
  assert.equal(assessHealthRuns(baseline, now).status, 'observed');
  const unhealthy = assessHealthRuns(
    {
      ...baseline,
      logs:
        REPORT_PREFIX +
        JSON.stringify(healthFromRow({ ...clear, delivery_overdue: 1 }, now)),
    },
    now,
  );
  assert.equal(unhealthy.status, 'unverified');
  assert.deepEqual(unhealthy.findings, ['delivery_overdue']);
  const cases = [
    [
      {
        scheduled: { ...run, conclusion: 'failure' },
        latest: { ...run, event: 'workflow_dispatch' },
      },
      'scheduled_failed',
    ],
    [
      { scheduled: { ...run, run_started_at: '2026-08-31T09:39:59Z' } },
      'scheduled_stale',
    ],
    [{ scheduled: undefined }, 'scheduled_missing'],
    [{ latest: { ...run, conclusion: 'cancelled' } }, 'latest_failed'],
    [{ workflow: { state: 'disabled_manually' } }, 'workflow_unavailable'],
    [{ logs: '' }, 'report_unverified'],
    [{ logs: `${logs}\n${logs}` }, 'report_unverified'],
    [
      {
        logs:
          REPORT_PREFIX +
          JSON.stringify({
            ...healthFromRow(clear, now),
            findings: ['secret'],
          }),
      },
      'report_unverified',
    ],
    [
      {
        logs:
          REPORT_PREFIX +
          JSON.stringify(
            healthFromRow(clear, new Date('2026-08-31T09:00:00Z')),
          ),
      },
      'report_unverified',
    ],
  ];
  for (const [change, expected] of cases) {
    const result = assessHealthRuns({ ...baseline, ...change }, now);
    assert.equal(result.status, 'unverified');
    assert.ok(result.findings.includes(expected), expected);
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
  const calls = [];
  const result = readHealthRuns((command, arguments_) => {
    assert.equal(command, 'gh');
    calls.push(arguments_);
    if (calls.length === 1) return JSON.stringify({ state: 'active' });
    if (calls.length <= 3) return JSON.stringify({ workflow_runs: [run] });
    return logs;
  }, now);
  assert.equal(result.status, 'observed');
  assert.ok(calls[2][1].includes('event=schedule'));
  assert.deepEqual(calls[3], [
    'run',
    'view',
    '1',
    '--repo',
    'mountain-pass/addressr',
    '--log',
  ]);
  assert.equal(
    readHealthRuns(() => {
      throw new Error('secret');
    }, now).status,
    'unverified',
  );
});
