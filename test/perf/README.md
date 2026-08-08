# Measurement apparatus: relevance gates and primary-path invariants

Two unrelated families live here. Both exist so a claim is reproducible rather
than a number in a document.

- **Relevance gates** (ADR-043) — `street-level-first-probe.mjs`,
  `partial-prefix-recall-ladder.mjs`, `relevance-lib.mjs`. See the section at
  the end of this file.
- **Primary-path invariants** (ADR-031 / ADR-033) — `read-shadow-invariant-ab.mjs`,
  `sigv4-signing-bench.mjs`, plus the terminal `exact-vs-range-margin-probe.mjs`.
  Documented immediately below.

## Primary-path invariant harness (ADR-031 / ADR-033)

Measures the synchronous cost read-shadow adds to `/addresses`, against ADR-031's
**≤ 1 ms p95** primary-path invariant. Discharged the invariant on 2026-07-31 at
≤ ~0.1 ms; the measured figures and their reading live in ADR-031's
`### Quantification` section, which is the authority. This directory is the
apparatus, kept so the claim is reproducible rather than a number in a document.

Not wired into any npm script or CI job on purpose. It needs two OpenSearch
instances and a hand-driven server, runs for minutes, and answers a question
that is asked once per migration.

## Why not k6, and why not production

ADR-031 originally prescribed a back-to-back k6 pair against production. That
instrument cannot resolve the signal: production ALB p95 swings 50–200 ms in
15-minute buckets, so 1 ms sits roughly 50× below its resolution. Running the
shadow-off leg in production also costs two EB deploys and punches a mirroring
hole in a running soak.

The synchronous path decomposes exhaustively into base-Connection dispatch plus
SigV4 signing plus a sub-microsecond credential-expiry check, so the two scripts
here measure the two real terms separately, each where it can be resolved.

## The control that matters

`read-shadow-invariant-ab.mjs` must mirror to a **separate** OpenSearch
instance from the one the primary reads.

This is not fastidiousness. The first version of this measurement mirrored into
the same index the primary queried, and reported shadow-ON as **1.5 ms faster**,
reproducibly across repeats — because each mirror pre-warmed the cache entry the
next request needed. A reproducible "the change made it faster" result is the
signature of a broken A/B, not a win. Two instances, or the number is worthless.

## Running it

```bash
# Two engines: primary on 9200, shadow target on 9201.
docker run -d --name os-main   -p 9200:9200 -e discovery.type=single-node \
  -e plugins.security.disabled=true -e DISABLE_INSTALL_DEMO_CONFIG=true \
  opensearchproject/opensearch:3.5.0
docker run -d --name os-shadow -p 9201:9200 -e discovery.type=single-node \
  -e plugins.security.disabled=true -e DISABLE_INSTALL_DEMO_CONFIG=true \
  opensearchproject/opensearch:3.5.0

# Build the `test` index on 9200 (OT fixture), then copy it to 9201.
npm run test:nodejs:nogeo

# Shadow-off arm.
ES_INDEX_NAME=test PORT=6060 npx addressr-server-2 &
TARGET=http://localhost:6060 N=3000 WARM=400 node test/perf/read-shadow-invariant-ab.mjs

# Shadow-on arm. Restart the server with the shadow vars pointed at 9201.
ES_INDEX_NAME=test PORT=6060 ADDRESSR_SHADOW_HOST=localhost \
  ADDRESSR_SHADOW_PORT=9201 ADDRESSR_SHADOW_PROTOCOL=http npx addressr-server-2 &
TARGET=http://localhost:6060 N=3000 WARM=400 node test/perf/read-shadow-invariant-ab.mjs

# Signing cost, standalone — no engine or server needed.
node test/perf/sigv4-signing-bench.mjs
```

**Check `/debug/shadow-config` after every shadow-on run.** `successes` must
equal `attempts` with `failures: 0`. A mirror that fails at client construction
costs almost nothing and will happily produce a clean-looking A/B that measures
the failure path — this happened during the original run and cost real time.
Note that a construction failure reports `attempts: 0` alongside a large
`failures`, which is P035 BS-2; do not read `attempts: 0` as "not invoked".

Run several replicates per arm and discard the first — cold JIT dominates it.
Arms were blocked (all off, then all on) rather than interleaved in the original
run; interleaving would control drift better if you are chasing a tighter bound.

## `exact-vs-range-margin-probe.mjs` — TERMINAL, cannot run again

Two-arm probe comparing exact-address versus range-address ranking on blue
(`addressr5`, pre-ADR-041 analyzer) against green (`addressr6`). It produced the
evidence cited by P073, P074, P075 and P078 — most importantly the finding that
green is aggregate-neutral to blue rather than a regression, which is what
unblocked the ADR-041 cutover.

**It cannot be re-run.** `addressr5` was decommissioned 2026-08-02 (commit
`2e557b9`), so the blue arm does not exist. The probe now fails fast with that
reason rather than hanging on a dead tunnel. Its results are frozen in
`exact-vs-range-margin-probe.out`, against the sample frame in
`exact-vs-range-frame.json` — treat both as the terminal record.

Do not make the blue arm optional to get it running again. A green-only run
emits output shaped like a result while being no evidence at all, which is the
same trap the invariant harness above warns about.

## Relevance gates (ADR-043)

`street-level-first-probe.mjs` and `partial-prefix-recall-ladder.mjs` are the two
corpus-scale gates [ADR-043](../../docs/decisions/043-keyword-prefix-anchor-for-street-level-first-ranking.accepted.md)
pins in its Confirmation. They exist because the property they measure is
invisible at every smaller scale.

```bash
# Both require an explicit target. There is deliberately no production default.
export ADDRESSR_PROBE_HOST=search-xxxx.ap-southeast-2.es.amazonaws.com

# Gate 1 — street-level-first. Draws a fresh sample, asserts, exits non-zero.
node test/perf/street-level-first-probe.mjs --variant anchored --n 150

# Gate 2 — partial-prefix recall. Aborts unless the sensitivity gate passes.
node test/perf/partial-prefix-recall-ladder.mjs --variant anchored   # name the candidate

# Reproduce the 2026-08-06 measurement exactly. NON-DISCHARGING by design.
node test/perf/street-level-first-probe.mjs --variant baseline --frame test/perf/sample.json
```

### Fixture scale cannot discharge either gate

Quoting ADR-043 Confirmation criterion 3, because the next reviewer will be
standing here: fixture-scale Cucumber **cannot** discharge these gates and is
retained as non-regression only. The street-level-first property measured **0%**
violations on the OT fixture (5,186 docs) and on a full TAS load (375,613 docs)
while production measured **62.7%**. Cucumber runs against OT. A green Cucumber
run is not evidence about this property, and reading it as one is how the defect
survived two closures.

### The two instrument defects already baked out

Both were found the hard way on 2026-08-06/07. Reintroduce either and the gate
reports a confident number that means nothing.

- **The recall ladder measures at page level, not match level.** `hits.total` is
  identical across every candidate, because the `bool_prefix` clause matches
  regardless and the candidates only move score. A matching-level ladder reports
  zero effect for everything.
- **Its probes cut mid-word.** The effect only appears when the final token is a
  genuine partial with no exact term for the expansion to select. Cutting at a
  fraction of address length lands on word boundaries and measured 0 losses over
  360 probes, a vacuous null, while the same instrument reproduced the known
  losses every time.

The ladder carries a sensitivity gate that aborts unless it reproduces the four
losses P078 recorded for `max_expansions: 1`. Same discipline as the terminal
probe above: nothing below a failed gate is evidence.

### The sample is a record, not a frame

`sample.json` is the terminal record of the 2026-08-06 run: 150 street-level
addresses that also have sub-units, the frame behind the 62.7% baseline and the
0/150 anchored figure in ADR-043.

It is **not** the gate's input. The probe redraws per run, because ADR-043
Confirmation 1 says a frozen sample degenerates into the instance-pinning that
hid this defect for months. `--frame` reproduces a past measurement and labels
its own output non-discharging.

### Constraints

- **No production default.** `ADDRESSR_PROBE_HOST` is required with no fallback.
  A run that silently hits prod is the same class of defect as the green-only arm
  warned about above.
- **Credentials never on argv.** They resolve through `defaultProvider()`, the
  chain production uses under ADR-033. `assertNoCredsInArgv` refuses to run
  otherwise. This is enforced rather than documented because on 2026-08-07 a
  curl-based draft passed the secret key as an argument and a transport failure
  stringified the whole command into a session transcript, exposing a live key.
- **Least privilege.** The gates need `es:ESHttpGet` / `es:ESHttpPost` for
  `_search` and `_analyze` only. Admin credentials are not required, following
  the scoping precedent in ADR-034.
- **The baseline body is imported, never restated.** Every candidate is a delta
  on `src/build-search-body.js`. A hand-copied body is exactly what let the
  ADR-041 gate stay green while production diverged; this instrument must not
  become the next copy.
- **Do not run concurrently with a k6 baseline or an ADR-031 soak.** A full
  property run is roughly 150 addresses per variant; the ladder is ~268 probes
  per variant. Measurement runs punch holes in a running soak, as recorded above.
