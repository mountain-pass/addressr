# Problem 048: external-comms commit-message marker hash-exactness forces re-review round-trips

**Status**: Known Error
**Reported**: 2026-07-15
**Transitioned to Known Error**: 2026-07-15 (review — confirmed root cause + documented workaround)
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2)
**Origin**: internal (pipeline-instability / hook friction)
**Effort**: M
**WSJF**: 4.0

## Description

The external-comms gate marker for a `git-commit-message` surface is keyed on a hash of the **verbatim full message including the `Co-Authored-By` + `Claude-Session` trailers**. Any change to the message after review — even scrubbing a single figure — invalidates the marker, and `git commit` re-blocks until `wr-risk-scorer:external-comms` is re-run against the exact final text.

During the 2026-07-14 v2 cutover this cost three round-trips: (1) PASS on an initial draft; (2) FAIL because a mirrored-read count was flagged as a traffic-volume disclosure (figure omitted here — the count itself is the disclosure); (3) re-review of the scrubbed message — which itself first failed to match because the reviewed draft omitted the trailers, so a fourth review of the complete message (trailers included) was needed before the commit cleared.

## Symptoms

- `git commit` blocked with "draft has not been reviewed by wr-risk-scorer:external-comms" despite a prior PASS, because the message text changed.
- The hash includes trailers, so a review of the message _body_ alone does not clear the gate.

## Workaround

When the commit message changes at all after an external-comms PASS, re-run `wr-risk-scorer:external-comms` with the **complete final message, trailers included**, before retrying `git commit`. Captured in `docs/BRIEFING.md` "What Will Surprise You".

## Impact Assessment

- **Who is affected**: any operator who refines a commit message after external-comms review (common when scrubbing a flagged figure).
- **Frequency**: 3 round-trips in one commit this session; recurs on any post-review message edit.
- **Severity**: low-moderate — friction + wasted review cycles, not a wrong outcome.

## Root Cause Analysis

The marker's hash key spans the entire message including auto-appended trailers, so the reviewed text must be byte-identical to what `git commit` receives. Refining prose (or reviewing body-only) breaks the match. Related content lesson (separate concern, captured in BRIEFING not ticketed): the gate correctly flags absolute traffic/read counts (e.g. mirrored-read counts) as confidential traffic-volume disclosure — describe soak/traffic qualitatively in committed prose.

### Investigation Tasks

- [ ] Confirm the marker-hash construction in the external-comms hook (does it need to include trailers?)
- [ ] Consider hashing the message body sans standard trailers, or surfacing the exact text to review
- [ ] Re-rate Priority and Effort at next review

## Dependencies

- **Blocks**: (none)
- **Blocked by**: upstream — fix lives in the `wr-risk-scorer` external-comms hook, not this repo

## Related

- Captured via session retrospective 2026-07-15 (OpenSearch 3.5 migration).
- `docs/BRIEFING.md` "What Will Surprise You" — external-comms marker + traffic-count caveats.
- Sibling tooling-friction tickets: P004, P005, P047.
- **Reported upstream**: https://github.com/windyroad/agent-plugins/issues/361 (2026-07-18)

## Reported Upstream

- **URL**: https://github.com/windyroad/agent-plugins/issues/361
- **Reported**: 2026-07-18
- **Template used**: problem-report.yml (problem-shaped structured body)
- **Disclosure path**: public issue
- **Cross-reference confirmed**: yes (issue body records the P048 downstream reference; extended with fresh gh-issue-create shell-escaping evidence hit this session)
