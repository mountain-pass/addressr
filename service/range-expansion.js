// ADR 026: range-number address expansion via multi-valued text alias field.
// Pure helper — no I/O, no OpenSearch dependency. Invoked by `mapToMla` in
// `service/address-service.js` when a G-NAF address has NUMBER_LAST set.
// See docs/problems/015-range-number-addresses-not-searchable-by-base-number.open.md
// for the range-distribution measurements that justify SPAN_CAP = 20.

export const SPAN_CAP = 20;

export function expandRangeAliases(first, last, streetPart, localityPart) {
  if (!Number.isInteger(first) || !Number.isInteger(last)) return [];
  if (first <= 0 || last <= 0) return [];
  if (first >= last) return [];
  if (last - first > SPAN_CAP) return [];

  const aliases = [];
  for (let n = first; n <= last; n++) {
    aliases.push(`${n} ${streetPart}, ${localityPart}`);
  }
  return aliases;
}
