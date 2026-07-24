// @jtbd JTBD-001 (Search and Autocomplete Addresses — defends the "results
//   within 200 ms" desired outcome against silent p95 regressions)
// @jtbd JTBD-400 (Ship Releases Reliably From Trunk — the addressr-maintainer
//   CI-cadence vehicle that runs this probe; see P032 / RFC-007)
//
// Small, DETERMINISTIC perf-regression probe — distinct from the 38-minute
// stress profile in ./script.js (which stays for on-demand "find the breaking
// point" runs). This one answers a different question: "did the search /
// retrieve p95 regress since the last commit?" It is short, fixed-sequence
// (no Math.random, so runs are comparable across commits) and gated by
// conservative p95 thresholds sized to survive GitHub-hosted-runner variance
// while still catching a gross regression. Run locally with
// `npm run test:perf:regression` against a loaded OT fixture on :6060, or in
// CI via .github/workflows/perf-regression.yml (nightly + workflow_dispatch).
//
// Thresholds are a deliberate FIRST CUT (P032 Investigation Task: "characterise
// runner-noise variance; pick thresholds that survive routine variance without
// flapping"). Tighten them once a few real nightly runs establish the runner's
// baseline spread — do NOT tighten from local-dev numbers, which are quieter
// than the hosted runner.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.ADDRESSR_BASE_URL || 'http://localhost:6060';

// A 15 s warm-up scenario (untracked by thresholds) lets the JVM/OpenSearch
// caches and the Node process settle before the measured window, so cold-start
// latency does not inflate the p95 we gate on. The `regression` scenario is the
// measured one — 5 constant VUs for 60 s, tagged phase:main.
export const options = {
  scenarios: {
    warmup: {
      executor: 'constant-vus',
      exec: 'probe',
      vus: 2,
      duration: '15s',
      tags: { phase: 'warmup' },
    },
    regression: {
      executor: 'constant-vus',
      exec: 'probe',
      vus: 5,
      duration: '60s',
      startTime: '15s',
      tags: { phase: 'main' },
    },
  },
  thresholds: {
    // Only the measured (phase:main) window gates the job. k6 exits non-zero on
    // a breach, which fails the CI step.
    'http_req_duration{phase:main,name:search}': [
      { threshold: 'p(95)<1500', abortOnFail: false },
    ],
    'http_req_duration{phase:main,name:retrieve}': [
      { threshold: 'p(95)<1000', abortOnFail: false },
    ],
    'checks{phase:main}': [{ threshold: 'rate>0.95', abortOnFail: true }],
  },
};

// Fixed OT-fixture queries known to return results (Christmas Island streets in
// the slim OT G-NAF fixture the CI workflow loads). A deterministic index keeps
// the request sequence identical run-to-run.
const QUERIES = [
  'CHRISTMAS ISLAND',
  'MURRAY RD',
  'GAZE RD',
  '19 MURRAY RD',
  '101 GAZE RD',
  'MURRAY RD CHRISTMAS ISLAND',
  'GAZE RD CHRISTMAS ISLAND',
  'CHRISTMAS ISLAND OT 6798',
];

export function probe() {
  const query = QUERIES[(__VU * 7 + __ITER) % QUERIES.length];
  const url = http.url`${BASE_URL}/addresses?q=${query}`;
  const response = http.get(url, { tags: { name: 'search' } });
  check(response, { 'search is status 200': (r) => r.status === 200 });

  if (response.status === 200) {
    const results = JSON.parse(response.body);
    if (results.length > 0) {
      // Retrieve the first hit — deterministic (no random index), so the
      // retrieve metric measures the same document class each run.
      const nextUrl = results[0].links.self.href;
      const retrieve = http.get(`${BASE_URL}${nextUrl}`, {
        tags: { name: 'retrieve' },
      });
      check(retrieve, { 'retrieve is status 200': (r) => r.status === 200 });
    }
  }
  sleep(1);
}
