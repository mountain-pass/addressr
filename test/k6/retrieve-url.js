// Which URL the probe should fetch for a search hit, extracted so it can be
// TESTED rather than pinned as source text.
//
// It got this wrong for the probe's whole life: it read
// `results[0].links.self.href`, which no served response has ever carried.
// The collection loader in waycharter-server.js maps each hit to
// { sla, ssla?, highlight, score, pid } and waycharter emits item links as
// RFC 5988 Link HEADERS, never as a `links` body key. So every iteration threw
// before issuing the retrieve request, and the retrieve threshold passed over
// an empty sample set.
//
// A k6 script cannot be exercised by the node suite, so the decision lives
// here where both can reach it. See P033 — a guard that reads source text
// proves the text, not the behaviour.

/**
 * @param {object} hit one item from the /addresses search response
 * @returns {string} the path to retrieve that address
 * @throws if the hit carries no pid — silently returning undefined is what
 *         produced a green probe measuring nothing.
 */
export function retrieveUrlFor(hit) {
  if (!hit || typeof hit.pid !== 'string' || hit.pid === '') {
    throw new TypeError(
      `search hit has no usable pid; got ${JSON.stringify(hit)}`,
    );
  }
  return `/addresses/${hit.pid}`;
}
