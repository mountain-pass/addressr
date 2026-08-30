// @jtbd JTBD-001 (Search and Autocomplete Addresses From Partial Input)
// ADR-077 / ADR-078 launch apparatus. Targets and credentials are env-only;
// output is aggregates only. This deliberately does not activate the channel.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUERIES = [
  '17 Oconnell Street Sydney',
  '200 Queen Street Melbourne',
  '1 Adelaide Street Brisbane',
  '50 St Georges Terrace Perth',
  '1 King William Street Adelaide',
];
const MARKER_HEADER = 'x-addressr-benchmark-id';
const PHASE_HEADER = 'x-addressr-benchmark-phase';
const SAMPLE_HEADER = 'x-addressr-benchmark-sample';

export function percentile(values, percentileValue) {
  if (values.length === 0) throw new Error('cannot summarize zero samples');
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.ceil((percentileValue / 100) * sorted.length) - 1,
    )
  ];
}

export function parseTailLine(line, marker) {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return;
  }
  const request = raw?.event?.request;
  const headers = request?.headers;
  if (!headers || headers[MARKER_HEADER] !== marker) return;
  if (raw.truncated) throw new Error('tail reported a truncated event');
  const phase = headers[PHASE_HEADER];
  if (phase === 'ready') return { phase };
  const sample = headers[SAMPLE_HEADER];
  if (phase !== 'measure' || !sample) return;
  const cpuMs = raw.cpuTime;
  const wallMs = raw.wallTime;
  const outcome = raw.outcome;
  const colo = request.cf?.colo;
  const scriptVersion = raw.scriptVersion?.id;
  if (
    typeof outcome !== 'string' ||
    typeof colo !== 'string' ||
    typeof scriptVersion !== 'string' ||
    !Number.isFinite(cpuMs) ||
    !Number.isFinite(wallMs)
  ) {
    throw new TypeError('tail event is missing required compute evidence');
  }
  return { phase, sample, cpuMs, wallMs, outcome, colo, scriptVersion };
}

function required(environment, name) {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(environment, name, fallback, minimum = 1) {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new TypeError(`${name} must be an integer at least ${minimum}`);
  return value;
}

function target(environment, name) {
  const url = new URL(required(environment, name));
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(`${name} must be an HTTP(S) URL without userinfo`);
  for (const key of url.searchParams.keys()) {
    if (/key|token|secret|auth|password/i.test(key))
      throw new TypeError(`${name} must not carry credentials in its query`);
  }
  return url;
}

function settings(environment, argv) {
  if (argv.length > 2)
    throw new Error(
      'refusing to run: this probe accepts no argv; use environment variables',
    );
  const baseline = target(environment, 'ADDRESSR_BENCHMARK_BASELINE_URL');
  const candidate = target(environment, 'ADDRESSR_BENCHMARK_CANDIDATE_URL');
  if (baseline.href === candidate.href)
    throw new Error('baseline and candidate URLs must be distinct');
  const baselineHeaderName =
    environment.ADDRESSR_BENCHMARK_BASELINE_HEADER_NAME;
  const baselineHeaderValue =
    environment.ADDRESSR_BENCHMARK_BASELINE_HEADER_VALUE;
  if (Boolean(baselineHeaderName) !== Boolean(baselineHeaderValue))
    throw new Error('baseline header name and value must be supplied together');
  return {
    baseline,
    candidate,
    baselineHeaderName,
    baselineHeaderValue,
    apiKey: required(environment, 'ADDRESSR_BENCHMARK_API_KEY'),
    worker: required(environment, 'ADDRESSR_BENCHMARK_WORKER'),
    region: required(environment, 'ADDRESSR_BENCHMARK_REGION'),
    d1Location: required(environment, 'ADDRESSR_BENCHMARK_D1_LOCATION'),
    n: positiveInteger(environment, 'ADDRESSR_BENCHMARK_N', 200, 100),
    warm: positiveInteger(environment, 'ADDRESSR_BENCHMARK_WARM', 20),
    replicates: positiveInteger(
      environment,
      'ADDRESSR_BENCHMARK_REPLICATES',
      3,
      2,
    ),
    timeoutMs: positiveInteger(
      environment,
      'ADDRESSR_BENCHMARK_TIMEOUT_MS',
      30_000,
    ),
    wranglerPath:
      environment.ADDRESSR_BENCHMARK_WRANGLER_PATH ||
      fileURLToPath(
        new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url),
      ),
  };
}

function tailEnvironment(environment) {
  const safe = {
    PATH: environment.PATH,
    HOME: environment.HOME,
    CLOUDFLARE_API_TOKEN: environment.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: environment.CLOUDFLARE_ACCOUNT_ID,
  };
  if (environment.FAKE_TAIL_EVENTS)
    safe.FAKE_TAIL_EVENTS = environment.FAKE_TAIL_EVENTS;
  return safe;
}

function startTail(config, environment, marker) {
  const events = new Map();
  let isReady = false;
  let failure;
  let buffer = '';
  const child = spawn(
    process.execPath,
    [
      config.wranglerPath,
      'tail',
      config.worker,
      '--format',
      'json',
      '--header',
      `${MARKER_HEADER}:${marker}`,
    ],
    { env: tailEnvironment(environment), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      try {
        const event = parseTailLine(line, marker);
        if (event?.phase === 'ready') isReady = true;
        if (event?.phase === 'measure') {
          if (events.has(event.sample))
            failure = new Error('tail emitted a duplicate measured event');
          events.set(event.sample, event);
        }
      } catch (error) {
        failure = error;
      }
    }
  });
  child.once('error', () => {
    failure = new Error('Wrangler tail failed to start');
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    if (/dropped|truncated/i.test(chunk))
      failure = new Error('Wrangler tail reported dropped or truncated events');
  });
  child.once('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGINT')
      failure = new Error('Wrangler tail exited before capture completed');
  });
  return {
    child,
    events,
    get isReady() {
      return isReady;
    },
    get failure() {
      return failure;
    },
  };
}

function headers(config, { arm, marker, phase, sample }) {
  const values = {
    [MARKER_HEADER]: marker,
    [PHASE_HEADER]: phase,
    [SAMPLE_HEADER]: sample,
  };
  if (arm === 'candidate') values['x-addressr-api-key'] = config.apiKey;
  if (arm === 'baseline' && config.baselineHeaderName)
    values[config.baselineHeaderName] = config.baselineHeaderValue;
  return values;
}

async function request(config, { arm, query, marker, phase, sample }) {
  const url = new URL(arm === 'baseline' ? config.baseline : config.candidate);
  url.searchParams.set('q', query);
  const started = performance.now();
  const response = await fetch(url, {
    headers: headers(config, { arm, marker, phase, sample }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const elapsedMs = performance.now() - started;
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${arm} returned an unparseable response`);
  }
  if (!response.ok || !Array.isArray(body) || body.length === 0)
    throw new Error(`${arm} did not return a successful non-empty search`);
  return elapsedMs;
}

async function waitForTail(config, tail, marker) {
  const deadline = Date.now() + config.timeoutMs;
  let attempt = 0;
  while (!tail.isReady && Date.now() < deadline) {
    if (tail.failure) throw tail.failure;
    await request(config, {
      arm: 'candidate',
      query: QUERIES[attempt % QUERIES.length],
      marker,
      phase: 'ready',
      sample: `ready-${attempt}`,
    });
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!tail.isReady) throw new Error('Wrangler tail did not become ready');
}

async function stopTail(tail) {
  if (tail.child.exitCode !== null || tail.child.signalCode) return;
  const exited = new Promise((resolve) => tail.child.once('exit', resolve));
  tail.child.kill('SIGINT');
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (tail.child.exitCode === null && !tail.child.signalCode)
    tail.child.kill('SIGKILL');
}

function summary(values) {
  return {
    p50: +percentile(values, 50).toFixed(3),
    p95: +percentile(values, 95).toFixed(3),
    p99: +percentile(values, 99).toFixed(3),
  };
}

async function waitForEvents(config, tail, count) {
  const deadline = Date.now() + config.timeoutMs;
  while (tail.events.size < count && Date.now() < deadline) {
    if (tail.failure) throw tail.failure;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (tail.events.size !== count)
    throw new Error(
      'tail event count did not match measured candidate requests',
    );
}

export async function run(environment = process.env, argv = process.argv) {
  const config = settings(environment, argv);
  required(environment, 'CLOUDFLARE_API_TOKEN');
  required(environment, 'CLOUDFLARE_ACCOUNT_ID');
  const marker = randomUUID();
  const tail = startTail(config, environment, marker);
  const replicates = [];
  try {
    await waitForTail(config, tail, marker);
    for (let replicate = 0; replicate < config.replicates; replicate += 1) {
      for (let index = 0; index < config.warm; index += 1) {
        const query = QUERIES[index % QUERIES.length];
        const sample = `warm-${replicate}-${index}`;
        const order =
          index % 2 === 0
            ? ['baseline', 'candidate']
            : ['candidate', 'baseline'];
        for (const arm of order) {
          await request(config, { arm, query, marker, phase: 'warm', sample });
        }
      }
      const baseline = [];
      const candidate = [];
      const deltas = [];
      for (let index = 0; index < config.n; index += 1) {
        const query = QUERIES[index % QUERIES.length];
        const sample = `${replicate}-${index}`;
        const measured = {};
        const order =
          index % 2 === 0
            ? ['baseline', 'candidate']
            : ['candidate', 'baseline'];
        for (const arm of order) {
          measured[arm] = await request(config, {
            arm,
            query,
            marker,
            phase: 'measure',
            sample,
          });
        }
        baseline.push(measured.baseline);
        candidate.push(measured.candidate);
        deltas.push(measured.candidate - measured.baseline);
      }
      replicates.push({
        replicate: replicate + 1,
        n: config.n,
        baselineMs: summary(baseline),
        candidateMs: summary(candidate),
        addedMs: summary(deltas),
      });
    }
    await waitForEvents(config, tail, config.n * config.replicates);
    if (tail.failure) throw tail.failure;
    const events = tail.events.values().toArray();
    if (events.some((event) => event.outcome !== 'ok'))
      throw new Error('a measured Worker invocation had a non-success outcome');
    const versions = [...new Set(events.map((event) => event.scriptVersion))];
    if (versions.length !== 1)
      throw new Error('measured events crossed multiple Worker versions');
    const allAddedP95 = Math.max(...replicates.map((item) => item.addedMs.p95));
    const allAddedP99 = Math.max(...replicates.map((item) => item.addedMs.p99));
    const allCandidateP95 = Math.max(
      ...replicates.map((item) => item.candidateMs.p95),
    );
    const cpu = summary(events.map((event) => event.cpuMs));
    const wall = summary(events.map((event) => event.wallMs));
    const isPass =
      allAddedP95 <= 25 &&
      allAddedP99 <= 50 &&
      allCandidateP95 <= 200 &&
      cpu.p95 <= 10;
    const result = {
      status: isPass ? 'PASS' : 'FAIL',
      sampleSizePerReplicate: config.n,
      warmPerReplicate: config.warm,
      replicateCount: config.replicates,
      region: config.region,
      d1Location: config.d1Location,
      colos: [...new Set(events.map((event) => event.colo))].toSorted(
        (left, right) => left.localeCompare(right),
      ),
      workerVersion: versions[0],
      replicates,
      workerCpuMs: cpu,
      workerWallMs: wall,
      gates: {
        addedP95Ms: { limit: 25, observed: allAddedP95 },
        addedP99Ms: { limit: 50, observed: allAddedP99 },
        candidateP95Ms: { limit: 200, observed: allCandidateP95 },
        workerCpuP95Ms: { limit: 10, observed: cpu.p95 },
      },
    };
    console.log(JSON.stringify(result));
    if (!isPass) process.exitCode = 1;
    return result;
  } finally {
    await stopTail(tail);
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    await run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
