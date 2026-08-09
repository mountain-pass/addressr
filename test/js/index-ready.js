// @jtbd JTBD-400 (Ship releases reliably from trunk)
//
// P097 readiness gate. `waitport` waits on the TCP port; the port accepts
// connections well before the index answers a query, so `BeforeAll` used to hand
// cucumber a search backend that was up and not yet useful. Three instances on
// 2026-08-08/09 — both engine versions, both tiers — each an
// `expected [] not to be empty` inside a step definition at ~0.1 s.
//
// WHY COUNT ALONE IS NOT THE CHECK. `count` reads the Lucene index; `search`
// reads the searcher, which only sees segments a refresh has published. Those
// diverge for exactly the interval this gate exists to cover, so a count-only
// wait would return green in the middle of the race. Both, or neither.
//
// The error messages are the deliverable as much as the waiting is. The symptom
// this replaces — an empty list asserted deep in a step — is consistent with an
// absent index, an empty one, and an unrefreshed one, and three instances
// produced no diagnosis between them because nothing distinguished those. Each
// exit below names which one happened and what to look at.

import debug from 'debug';

const logger = debug('test');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reject once `ms` has elapsed.
 *
 * The timer is `unref`'d so a race won by the probe does not hold the event loop
 * open for the remainder of the deadline — this gate runs in `BeforeAll` and the
 * process has a whole cucumber suite to get on with afterwards.
 */
const rejectAfter = (ms) =>
  new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(PROBE_TIMEOUT)), ms).unref?.();
  });

const PROBE_TIMEOUT = 'probe exceeded the readiness deadline';
const isProbeTimeout = (error) => error?.message === PROBE_TIMEOUT;

const isMissingIndex = (error) =>
  error?.meta?.statusCode === 404 ||
  /index_not_found_exception/.test(error?.message ?? '');

/**
 * How many documents the SEARCHER can see, which is not the same question as
 * `count`: `count` reads the Lucene index, `search` reads the searcher, and the
 * two diverge until a refresh publishes the segments. That divergence is the
 * window this module exists to close, so the two probes stay separate.
 */
async function countVisibleHits(withinDeadline, client, index) {
  const searched = await withinDeadline(
    client.search({ index, body: { size: 0, query: { match_all: {} } } }),
  );
  return searched?.body?.hits?.total?.value ?? 0;
}

/**
 * Block until `index` holds at least one document AND a search can see it.
 *
 * @returns {Promise<{count: number}>} the document count observed at the moment
 *   the gate opened — logged so a leg that passes against a partial load leaves
 *   a number behind rather than only a green tick.
 * @throws if the window closes first, with a message naming which of the three
 *   states it ended in.
 */
export async function awaitIndexReady({
  client,
  index,
  timeoutMs = 60_000,
  intervalMs = 250,
  now = () => Date.now(),
}) {
  const deadline = now() + timeoutMs;
  // Carried out of the loop so the failure message can report the LAST thing
  // seen rather than re-probing after the deadline — a re-probe would sometimes
  // succeed and produce an error message contradicting its own error.
  let lastCount = 0;
  let wasIndexSeen = false;
  // Distinct from the three index states below. A probe that never answered
  // tells us nothing about the index, so reporting one of the three would be a
  // confident wrong answer — the exact conflation this module exists to remove,
  // one level in.
  let didProbeStall = false;
  // Whether a 404 was ACTUALLY OBSERVED, as opposed to inferred from never
  // having seen the index. The two differ exactly when the deadline arrives
  // mid-probe, and that difference is what produced the wrong message below.
  let wasIndexMissing = false;

  // The deadline is only tested BETWEEN probes, so a probe that never settles
  // would sail past it and consume the whole `BeforeAll` budget (240s) instead
  // of the gate's own. That trades the three specific messages below — the
  // entire point of this module — for a generic cucumber hook timeout, which is
  // the diagnosis-free outcome P097 already has. Racing each probe against the
  // time left keeps the failure inside this function.
  // A probe starting with NO budget left is not raced at all. Observed against a
  // real OpenSearch on 2026-08-09: pointing the gate at a missing index reported
  // "did not answer within 60s" instead of "does not exist". The client threw a
  // clean 404 every time, but on the LAST poll `remaining` was 0, `rejectAfter(0)`
  // fired before the response landed, and a legitimate answer lost a race it
  // should never have been in. The stub could not have caught this — it encodes
  // the same assumption it is meant to test, which is why the gate was run
  // against the real client before landing.
  const withinDeadline = (promise) => {
    const remaining = Math.max(0, deadline - now());
    if (remaining === 0) return promise;
    return Promise.race([promise, rejectAfter(remaining)]);
  };

  for (;;) {
    try {
      const counted = await withinDeadline(client.count({ index }));
      wasIndexSeen = true;
      lastCount = counted?.body?.count ?? 0;

      if (lastCount > 0) {
        const hits = await countVisibleHits(withinDeadline, client, index);
        if (hits > 0) {
          logger(`index ${index} ready: ${lastCount} documents, searchable`);
          return { count: lastCount };
        }
      }
    } catch (error) {
      // A probe that ran out of time falls THROUGH to the diagnostic block
      // rather than propagating: the caller needs to know which of the three
      // states the index was in, and "probe exceeded the deadline" is not one
      // of them — it is how we stopped looking, not what we found.
      if (isProbeTimeout(error)) {
        didProbeStall = true;
        break;
      }
      if (!isMissingIndex(error)) throw error;
      wasIndexSeen = false;
      wasIndexMissing = true;
    }

    if (now() >= deadline) break;
    await sleep(intervalMs);
  }

  // Sub-second budgets appear in the tests; `Math.round(ms / 1000)` renders
  // those as "0s", which reads as a gate that never waited.
  const waited =
    timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)}s` : `${timeoutMs}ms`;
  // ANY observation beats a stall, and this rule was written from live evidence
  // rather than from the stub. Pointed at a missing index against a real
  // OpenSearch on 2026-08-09, the gate reported "did not answer within 60s" when
  // the client had in fact thrown a clean 404 on every one of ~240 polls — the
  // last probe simply raced the arriving deadline and lost. Reporting a stall
  // there discards 240 answers in favour of one lost race, and points the reader
  // at container health instead of the index name. So a stall is reported only
  // when the loop learned NOTHING: no count, and no 404 either.
  if (didProbeStall && !wasIndexSeen && !wasIndexMissing) {
    throw new Error(
      `P097 readiness gate: a probe against index "${index}" did not answer within ${waited}. ` +
        `The search backend accepted the connection and then stopped responding, so this ` +
        `says nothing about whether the index exists or is populated. Look at the ` +
        `OpenSearch container's health and logs, not at the loader.`,
    );
  }
  if (!wasIndexSeen) {
    throw new Error(
      `P097 readiness gate: index "${index}" does not exist after ${waited}. ` +
        `The load did not run, or it ran against a different ES_INDEX_NAME. ` +
        `Check the loader step's exit status and its resolved index name — ` +
        `this is not the refresh race.`,
    );
  }
  if (lastCount === 0) {
    throw new Error(
      `P097 readiness gate: index "${index}" exists but holds 0 documents after ${waited}. ` +
        `The loader ran and wrote nothing. Note it can report success while doing ` +
        `this — see R012 on the silently-miscounting file-selection branch, which ` +
        `the absent Counts.csv routes into on every fixture run. Not the refresh race.`,
    );
  }
  throw new Error(
    `P097 readiness gate: index "${index}" holds ${lastCount} documents but they are ` +
      `not yet searchable after ${waited}. This IS the refresh race — the documents ` +
      `are written and the searcher has not picked them up. Raise the timeout or ` +
      `force a refresh after the load.`,
  );
}
