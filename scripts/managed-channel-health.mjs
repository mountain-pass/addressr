// ADR-051: consumed by the managed-health workflow and its recurring agent reader.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  MAX_METER_ATTEMPTS,
  reconciliationWindow,
} from '../apps/addressr-deployment/cloudflare-worker/meter-policy.mjs';

export const REPORT_PREFIX = 'ADDRESSR_MANAGED_HEALTH ';
const WORKFLOW = 'managed-channel-health.yml';
const REPOSITORY = 'mountain-pass/addressr';
const MAX_AGE_MS = 30 * 60 * 1000;
const LIMITATION = 'workload_and_provider_parity_unverified';
const FLAGS = [
  'delivery_exhausted',
  'delivery_overdue',
  'reconciliation_missing',
  'reconciliation_pending',
  'reconciliation_failed',
];

export function healthQuery(now = new Date()) {
  // Give the existing five-minute producer one invocation after a window becomes due.
  const { end } = reconciliationWindow(new Date(now.getTime() - 5 * 60 * 1000));
  return {
    // ponytail: missing-window audit scans retained usage; add indexed incremental reads when cost warrants it.
    sql: `SELECT
      EXISTS(SELECT 1 FROM usage_records WHERE outcome='billable'
        AND meter_state='pending' AND meter_attempts >= ?) AS delivery_exhausted,
      EXISTS(SELECT 1 FROM usage_records WHERE outcome='billable'
        AND meter_state='pending' AND created_at < ?) AS delivery_overdue,
      EXISTS(SELECT 1 FROM usage_records u
        LEFT JOIN meter_reconciliations r ON r.organization_id=u.organization_id
          AND r.window_start=substr(u.created_at,1,13) || ':00:00.000Z'
        WHERE u.outcome='billable' AND u.created_at < ?
          AND r.organization_id IS NULL) AS reconciliation_missing,
      EXISTS(SELECT 1 FROM meter_reconciliations
        WHERE state='pending' AND window_end <= ?) AS reconciliation_pending,
      EXISTS(SELECT 1 FROM meter_reconciliations
        WHERE state IN ('rejected','mismatched','error')) AS reconciliation_failed`,
    params: [
      String(MAX_METER_ATTEMPTS),
      end.toISOString(),
      end.toISOString(),
      end.toISOString(),
    ],
  };
}

function report(status, findings, now) {
  return {
    schema: 1,
    scope: 'd1_meter_state',
    checkedAt: now.toISOString(),
    status,
    findings,
    limitations: [LIMITATION],
  };
}

export function healthFromRow(row, now = new Date()) {
  if (!row || FLAGS.some((flag) => row[flag] !== 0 && row[flag] !== 1)) {
    return report('unverified', ['invalid_query_result'], now);
  }
  const findings = FLAGS.filter((flag) => row[flag] === 1);
  // Deliberately identical for empty and nonempty clear databases: no traffic disclosure.
  return report(findings.length > 0 ? 'unhealthy' : 'observed', findings, now);
}

export async function readManagedHealth(
  environment,
  fetcher = fetch,
  now = new Date(),
) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID;
  const token = environment.CLOUDFLARE_API_TOKEN;
  if (!token || !/^[a-f0-9]{32}$/.test(account || '')) {
    return report('unverified', ['credentials_unavailable'], now);
  }
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`;
  async function request(url, options = {}) {
    const response = await fetcher(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('provider_unavailable');
    const body = await response.json();
    if (body?.success !== true || !Array.isArray(body.result)) {
      throw new Error('provider_unavailable');
    }
    return body.result;
  }
  try {
    const databases = await request(
      `${base}?name=addressr-managed-channel&per_page=100`,
    );
    const matches = databases.filter(
      (item) => item.name === 'addressr-managed-channel',
    );
    if (
      databases.length >= 100 ||
      matches.length !== 1 ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        matches[0]?.uuid || '',
      )
    ) {
      return report('unverified', ['database_unresolved'], now);
    }
    const result = await request(`${base}/${matches[0].uuid}/query`, {
      method: 'POST',
      body: JSON.stringify(healthQuery(now)),
    });
    if (
      result.length !== 1 ||
      result[0].success !== true ||
      result[0].results?.length !== 1 ||
      result[0].meta?.changed_db === true ||
      Number(result[0].meta?.rows_written || 0) !== 0
    ) {
      return report('unverified', ['invalid_query_result'], now);
    }
    return healthFromRow(result[0].results[0], now);
  } catch {
    // Provider bodies and errors can contain credentials or customer data.
    return report('unverified', ['provider_unavailable'], now);
  }
}

export function assessHealthRuns(
  { workflow, latest, scheduled, logs },
  now = new Date(),
) {
  const findings = [];
  if (workflow?.state !== 'active') findings.push('workflow_unavailable');
  for (const [label, run] of [
    ['latest', latest],
    ['scheduled', scheduled],
  ]) {
    if (!run) {
      findings.push(`${label}_missing`);
      continue;
    }
    if (
      run.head_branch !== 'master' ||
      run.status !== 'completed' ||
      run.conclusion !== 'success' ||
      (label === 'scheduled' && run.event !== 'schedule')
    ) {
      findings.push(`${label}_failed`);
    }
    const age = now.getTime() - Date.parse(run.run_started_at);
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS)
      findings.push(`${label}_stale`);
  }
  const lines = String(logs || '')
    .split('\n')
    .filter((line) => line.includes(REPORT_PREFIX));
  let observed;
  try {
    if (lines.length !== 1) throw new Error('invalid_report');
    observed = JSON.parse(
      lines[0].slice(lines[0].indexOf(REPORT_PREFIX) + REPORT_PREFIX.length),
    );
    const age = now.getTime() - Date.parse(observed.checkedAt);
    const allowed = new Set([
      ...FLAGS,
      'credentials_unavailable',
      'database_unresolved',
      'invalid_query_result',
      'provider_unavailable',
    ]);
    if (
      observed.schema !== 1 ||
      observed.scope !== 'd1_meter_state' ||
      !['observed', 'unhealthy', 'unverified'].includes(observed.status) ||
      !Array.isArray(observed.findings) ||
      observed.findings.some((code) => !allowed.has(code)) ||
      JSON.stringify(observed.limitations) !== JSON.stringify([LIMITATION]) ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > MAX_AGE_MS ||
      (observed.status === 'observed') !== (observed.findings.length === 0)
    ) {
      throw new Error('invalid_report');
    }
  } catch {
    findings.push('report_unverified');
  }
  if (!findings.includes('report_unverified'))
    findings.push(...observed.findings);
  return report(findings.length > 0 ? 'unverified' : 'observed', findings, now);
}

export function readHealthRuns(run = execFileSync, now = new Date()) {
  function gh(arguments_) {
    return run('gh', arguments_, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    });
  }
  try {
    const endpoint = `repos/${REPOSITORY}/actions/workflows/${WORKFLOW}`;
    const workflow = JSON.parse(gh(['api', endpoint]));
    const latest = JSON.parse(
      gh(['api', `${endpoint}/runs?branch=master&status=completed&per_page=1`]),
    ).workflow_runs?.[0];
    const scheduled = JSON.parse(
      gh([
        'api',
        `${endpoint}/runs?branch=master&event=schedule&status=completed&per_page=1`,
      ]),
    ).workflow_runs?.[0];
    const logs = Number.isSafeInteger(latest?.id)
      ? gh(['run', 'view', String(latest.id), '--repo', REPOSITORY, '--log'])
      : '';
    return assessHealthRuns({ workflow, latest, scheduled, logs }, now);
  } catch {
    return report('unverified', ['workflow_unavailable'], now);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result =
    process.argv[2] === '--report'
      ? readHealthRuns()
      : await readManagedHealth(process.env);
  console.log(REPORT_PREFIX + JSON.stringify(result));
  process.exitCode = result.status === 'observed' ? 0 : 1;
}
