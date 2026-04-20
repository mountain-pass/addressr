// ADR 028 (supersedes ADR 026): endpoint-only range-address expansion.
// Pure helper — no I/O, no OpenSearch dependency. Invoked by `mapToMla` in
// `service/address-service.js` when a G-NAF address has NUMBER_LAST set.
//
// For a G-NAF range like `103-107 GAZE RD` (NUMBER_FIRST=103, NUMBER_LAST=107),
// emit exactly two aliases — the first and last endpoints — and nothing else.
// Mid-range numbers (104, 105, 106) do NOT match the range document:
//
//   - Even-indexed mid-range numbers (104, 106) typically belong to properties
//     on the opposite side of the street under Australian addressing convention.
//   - Odd-indexed mid-range numbers (105) could be separate properties the
//     range record absorbed, or a single contiguous frontage — G-NAF does not
//     tell us which. Returning a range doc for a mid-range query would be a
//     false positive either way.
//
// See ADR 028 and P015 / #367 reporter comments 2022-06-24 (`138-144`) and
// 2022-07-10 (`225-245`). The earlier full-interpolation approach from ADR 026
// shipped in v2.3.0 produced these false positives and is superseded.

export function expandRangeAliases(first, last, streetPart, localityPart) {
  if (!Number.isInteger(first) || !Number.isInteger(last)) return [];
  if (first <= 0 || last <= 0) return [];
  if (first >= last) return [];

  return [
    `${first} ${streetPart}, ${localityPart}`,
    `${last} ${streetPart}, ${localityPart}`,
  ];
}
