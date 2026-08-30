// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PROBE = fileURLToPath(
  new URL(
    '../../perf/managed-gateway-latency-compute-probe.mjs',
    import.meta.url,
  ),
);
const API_KEY = 'addr_123456789abc_test-secret-not-for-output-1234567890';
const fixture = {};

function run(environment, arguments_ = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PROBE, ...arguments_], {
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

before(async () => {
  fixture.directory = await mkdtemp(
    path.join(tmpdir(), 'addressr-managed-probe-'),
  );
  fixture.eventsFile = path.join(fixture.directory, 'events.ndjson');
  fixture.wrangler = path.join(fixture.directory, 'fake-wrangler.mjs');
  await writeFile(fixture.eventsFile, '');
  await writeFile(
    fixture.wrangler,
    `import { open } from 'node:fs/promises';
if (process.env.ADDRESSR_BENCHMARK_API_KEY) process.exit(91);
let offset = 0;
let reading = false;
setInterval(async () => {
  if (reading) return;
  reading = true;
  const file = await open(process.env.FAKE_TAIL_EVENTS, 'r');
  try {
    const size = (await file.stat()).size;
    if (size > offset) {
      const next = Buffer.alloc(size - offset);
      await file.read(next, 0, next.length, offset);
      offset = size;
      process.stdout.write(next);
    }
  } finally {
    await file.close();
    reading = false;
  }
}, 10);
process.on('SIGINT', () => process.exit(0));
`,
  );
  fixture.server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const isCandidate = url.pathname === '/candidate';
    if (isCandidate && request.headers['x-addressr-api-key'] !== API_KEY) {
      response.writeHead(401).end('{}');
      return;
    }
    if (isCandidate) {
      const headers = {
        'x-addressr-benchmark-id': request.headers['x-addressr-benchmark-id'],
        'x-addressr-benchmark-phase':
          request.headers['x-addressr-benchmark-phase'],
        'x-addressr-benchmark-sample':
          request.headers['x-addressr-benchmark-sample'],
      };
      await writeFile(
        fixture.eventsFile,
        `${JSON.stringify({
          wallTime: 2,
          cpuTime: Number(process.env.FAKE_TAIL_CPU_MS ?? 1),
          outcome: 'ok',
          scriptVersion: { id: 'fixture-version' },
          event: { request: { headers, cf: { colo: 'SYD' } } },
        })}\n`,
        { flag: 'a' },
      );
    }
    response.setHeader('content-type', 'application/json');
    response.end('[{"id":"fixture-address"}]');
  });
  await new Promise((resolve) =>
    fixture.server.listen(0, '127.0.0.1', resolve),
  );
  fixture.origin = `http://127.0.0.1:${fixture.server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => fixture.server.close(resolve));
  await rm(fixture.directory, { recursive: true, force: true });
});

function environment(extra = {}) {
  return {
    ADDRESSR_BENCHMARK_BASELINE_URL: `${fixture.origin}/baseline`,
    ADDRESSR_BENCHMARK_CANDIDATE_URL: `${fixture.origin}/candidate`,
    ADDRESSR_BENCHMARK_API_KEY: API_KEY,
    ADDRESSR_BENCHMARK_WORKER: 'fixture-worker',
    ADDRESSR_BENCHMARK_REGION: 'fixture-region',
    ADDRESSR_BENCHMARK_D1_LOCATION: 'fixture-d1',
    ADDRESSR_BENCHMARK_N: '100',
    ADDRESSR_BENCHMARK_WARM: '1',
    ADDRESSR_BENCHMARK_REPLICATES: '2',
    ADDRESSR_BENCHMARK_TIMEOUT_MS: '5000',
    ADDRESSR_BENCHMARK_WRANGLER_PATH: fixture.wrangler,
    CLOUDFLARE_API_TOKEN: 'fixture-cloudflare-token',
    CLOUDFLARE_ACCOUNT_ID: 'fixture-account',
    FAKE_TAIL_EVENTS: fixture.eventsFile,
    ...extra,
  };
}

test('probe fails closed and emits only aggregate evidence', async () => {
  await writeFile(fixture.eventsFile, '');
  const missing = await run({});
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /ADDRESSR_BENCHMARK_BASELINE_URL is required/);

  const argv = await run(environment(), [API_KEY]);
  assert.equal(argv.code, 1);
  assert.match(argv.stderr, /accepts no argv/);

  const pass = await run(environment());
  assert.equal(pass.code, 0, pass.stderr);
  const result = JSON.parse(pass.stdout);
  assert.equal(result.status, 'PASS');
  assert.equal(result.workerVersion, 'fixture-version');
  assert.equal(result.workerCpuMs.p95, 1);
  assert.doesNotMatch(pass.stdout + pass.stderr, /addr_|x-addressr-api-key/);
  assert.doesNotMatch(pass.stdout + pass.stderr, /fixture-address/);
  assert.doesNotMatch(pass.stdout + pass.stderr, /127\.0\.0\.1/);

  await writeFile(fixture.eventsFile, '');
  process.env.FAKE_TAIL_CPU_MS = '11';
  const breached = await run(environment());
  delete process.env.FAKE_TAIL_CPU_MS;
  assert.equal(breached.code, 1);
  assert.equal(JSON.parse(breached.stdout).status, 'FAIL');
});
