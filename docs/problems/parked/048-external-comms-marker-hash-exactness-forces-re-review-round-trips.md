# Problem 048: external-comms commit-message marker hash-exactness forces re-review round-trips

**Status**: Parked
**Reported**: 2026-07-15
**Transitioned to Known Error**: 2026-07-15 (review — confirmed root cause + documented workaround)
**Parked**: 2026-07-19 (upstream-blocked — fix belongs in `@windyroad/risk-scorer`)
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

**Confirmed at source 2026-07-19** (installed plugin v0.17.0, `hooks/lib/external-comms-key.sh` + `hooks/external-comms-gate.sh`): for the `git-commit-message` surface the gate extracts the DRAFT as the **entire `git commit -m` heredoc body** — trailers included when they appear in the `-m` text — and keys the marker as `sha256(normalize(draft) + '\n' + surface)`. The only normalization is whitespace-class (CRLF→LF, per-line rstrip, whole-draft rstrip — the P276 substance-aware pass); there is **no body-sans-trailers carve-out**, and numeral/prose edits are deliberately substantive (the leak-detection guarantee depends on re-firing review when content changes). So the reviewed `<draft>` must be byte-identical (modulo whitespace) to the complete final message, trailers included. The fix — hashing sans standard trailers, or surfacing the exact text to review — is an upstream design decision in `@windyroad/risk-scorer`; nothing in addressr can change the key construction (the hook ships inside the plugin).

### Investigation Tasks

- [x] Confirm the marker-hash construction in the external-comms hook — **confirmed**: full message incl. trailers is hashed; only whitespace-class normalization (P276); no trailer carve-out in v0.17.0. See "Confirmed at source" above.
- [x] Consider hashing the message body sans standard trailers, or surfacing the exact text to review — **handed upstream** in [windyroad/agent-plugins#361](https://github.com/windyroad/agent-plugins/issues/361); the trade-off (trailer carve-out vs leak-detection guarantee) belongs to the plugin owner.
- [x] Re-rate Priority and Effort at next review — parked 2026-07-19 (excluded from WSJF ranking); re-rate on un-park.

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

## Parked

- **Reason**: upstream-blocked — the marker-key construction lives in `@windyroad/risk-scorer`'s external-comms hook (`hooks/lib/external-comms-key.sh`, synced from `packages/shared/`), not in this repo. Verified 2026-07-19: installed/latest plugin release 0.17.0 hashes the full `git commit -m` message (trailers included, no carve-out), and upstream issue [windyroad/agent-plugins#361](https://github.com/windyroad/agent-plugins/issues/361) is open with no response (0 comments as of 2026-07-19). Nothing in addressr can change the key construction.
- **Un-park trigger**: windyroad/agent-plugins#361 closes, or a `@windyroad/risk-scorer` release ships a trailer-aware key (or exact-text-to-review surfacing) — then verify the workaround note in `docs/BRIEFING.md` "What Will Surprise You" can be retired and close.
- **Date parked**: 2026-07-19
