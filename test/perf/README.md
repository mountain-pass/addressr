# Primary-path invariant harness (ADR-031 / ADR-033)

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
