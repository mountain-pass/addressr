// COVERED_STATES parsing + G-NAF detail-file state derivation. Extracted
// from address-service.js (babel-only, not raw-node importable) so the
// behavioural tests in test/js/__tests__/covered-states.test.mjs can import
// it directly — same pattern as ./gnaf-package-fetch.js (P033).
//
// Entries are normalised to uppercase (P034): G-NAF file/state names are
// uppercase (NSW_ADDRESS_DETAIL_psv.psv), so a lowercase or mixed-case
// COVERED_STATES value used to match nothing and the loader silently
// indexed zero documents.
import path from 'node:path';

export function getCoveredStates() {
  const covered = process.env.COVERED_STATES || '';
  return covered === ''
    ? []
    : covered
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
}

// State code from a detail file path, verbatim casing (downstream file
// lookups must match the dataset's own casing); uppercase at comparison
// sites when checking membership against getCoveredStates() entries.
export function detailFileState(detailFile) {
  return path.basename(detailFile, path.extname(detailFile)).replace(/_.*/, '');
}

// True when a G-NAF filename belongs to one of the covered states, matched
// case-insensitively on the leading `<STATE>_` prefix (e.g. covered state
// 'nsw' matches 'NSW_ADDRESS_DETAIL_psv.psv'). `coveredStates` is expected to
// already be uppercased (getCoveredStates() output).
export function matchesCoveredStatePrefix(file, coveredStates) {
  const base = path.basename(file).toUpperCase();
  return coveredStates.some((s) => base.startsWith(`${s}_`));
}

// Should-throw signal (P034): true when a COVERED_STATES filter is set and
// there are address-detail files to load, but none belong to a covered state
// — i.e. the filter would silently index zero documents (typically a
// spelling/case error). Pure boolean predicate; the caller performs the throw
// so this stays trivially unit-testable.
export function hasNoCoveredDetailMatch(addressDetailFiles, coveredStates) {
  return (
    coveredStates.length > 0 &&
    addressDetailFiles.length > 0 &&
    !addressDetailFiles.some((f) =>
      coveredStates.includes(detailFileState(f).toUpperCase()),
    )
  );
}
