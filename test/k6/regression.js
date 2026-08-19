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
import { retrieveUrlFor } from './retrieve-url.js';

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
    // Only the measured (phase:main) window is REPORTED on — nothing here gates
    // a release. k6 exits 99 on a breach; the CI step routes 99 to a ::warning::
    // plus a job-summary entry and keeps the job green, while any other nonzero
    // exit fails that job loudly (P032 — advisory on perf AND on validity
    // failures that surface as a check-rate breach; loud only when k6 itself
    // fails to run. Content-based routing of the wrong-measurement class is a
    // named residual on P032).
    //
    // `abortOnFail` is deliberately absent everywhere. The first real nightly
    // (run 30103898200) aborted 1 s into the measured window on a 0% check rate
    // and threw away the whole p95 series — exactly the data P032's open
    // "characterise runner-noise variance" task needs before these first-cut
    // thresholds can be tightened. A complete 75 s run beats an early exit.
    'http_req_duration{phase:main,name:search}': [
      { threshold: 'p(95)<1500', abortOnFail: false },
    ],
    'http_req_duration{phase:main,name:retrieve}': [
      { threshold: 'p(95)<1000', abortOnFail: false },
    ],
    // A LATENCY THRESHOLD CANNOT FAIL ON AN EMPTY SAMPLE SET. p(95) of nothing
    // is 0s, which satisfies p(95)<1000, so k6 prints a tick against a metric
    // it never collected — which is exactly what it did for this probe's whole
    // life while the retrieve request was never issued at all.
    //
    // So the count is gated separately from the latency. This is the floor
    // that makes "measured nothing" a breach rather than a pass, and it also
    // catches a throw anywhere before the retrieve call without needing to
    // detect the throw itself: no requests, no count, breach.
    //
    // 500 is deliberately far below the ~21,000 a healthy 60 s window produces
    // and far above zero. It is a did-this-run-at-all floor, not a throughput
    // target — tightening it toward observed throughput would make it flap on
    // runner variance, which is the mistake the latency thresholds already
    // warn about above.
    //
    // BOTH legs are declared, and the declaration is load-bearing beyond the
    // floor itself: k6 only emits a tagged submetric into --summary-export
    // when a threshold names it. An undeclared leg is simply ABSENT from the
    // summary, which scripts/perf-validity.mjs reads as zero — so omitting a
    // leg here would make the validity check fail every run, including a
    // healthy one. `perf-validity-covers-declared-legs.test.mjs` ties the two
    // files together so they cannot drift apart.
    'http_reqs{phase:main,name:search}': [
      { threshold: 'count>500', abortOnFail: false },
    ],
    'http_reqs{phase:main,name:retrieve}': [
      { threshold: 'count>500', abortOnFail: false },
    ],
    'checks{phase:main}': [{ threshold: 'rate>0.95', abortOnFail: false }],
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
  // encodeURIComponent is LOAD-BEARING: every query above contains a space.
  // k6's `http.url` tagged template does NOT percent-encode its interpolated
  // values, so the original `http.url`${BASE_URL}/addresses?q=${query}`` put a
  // raw space in the request line and Node answered a bare 47-byte
  // "400 Bad Request" — 35 of them in run 30103898200, which is where that
  // run's 100% http_req_failed and 1.6 kB data_received came from. The probe
  // was timing an error path, not the search path. A plain template literal is
  // enough here: the `name: 'search'` tag below already does the URL grouping
  // that `http.url` would otherwise provide.
  const response = http.get(
    `${BASE_URL}/addresses?q=${encodeURIComponent(query)}`,
    { tags: { name: 'search' } },
  );
  check(response, {
    'search is status 200': (r) => r.status === 200,
    // Status alone is not enough to prove the probe is measuring anything: an
    // empty result set is a valid 200 AND is faster than a real search, so a
    // fixture-load or index-name regression would make p95 look BETTER while
    // the probe stayed green. Under the advisory posture a barren query
    // surfaces as a checks-rate breach → ::warning::, never a red master.
    'search returns results': (r) =>
      r.status === 200 && JSON.parse(r.body).length > 0,
  });

  if (response.status === 200) {
    const results = JSON.parse(response.body);
    if (results.length > 0) {
      // Retrieve the first hit — deterministic (no random index), so the
      // retrieve metric measures the same document class each run. The path is
      // built from the hit's `pid`, which is what the collection loader
      // actually returns; the previous `links.self.href` read matched nothing
      // any response has ever carried and threw on every iteration. Not
      // re-encoded: a pid is already URL-safe.
      const nextUrl = retrieveUrlFor(results[0]);
      const retrieve = http.get(`${BASE_URL}${nextUrl}`, {
        tags: { name: 'retrieve' },
      });
      check(retrieve, { 'retrieve is status 200': (r) => r.status === 200 });
    }
  }
  sleep(1);
}
