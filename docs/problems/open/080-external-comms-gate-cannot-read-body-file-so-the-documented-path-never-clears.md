# Problem 080: The external-comms gate cannot read `--body-file`, so the documented path can never clear it

**Status**: Open — upstream-blocked (@windyroad/wr-risk-scorer), [#408](https://github.com/windyroad/agent-plugins/issues/408)
**Reported**: 2026-08-02
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Almost certain (3) — derived at capture; developer-time only, but deterministic whenever the `--body-file` form is used
**Origin**: internal
**Effort**: S — derived at capture: the fix is either a body-file read in the gate's Bash branch, or a corrected directive in the deny message
**JTBD**: JTBD-001
**Persona**: web-app-developer

## Description

`external-comms-gate.sh` derives its marker key as `sha256(DRAFT + '\n' + SURFACE)`. For a `Bash` tool call it extracts `DRAFT` by regex over the **command text**:

```
# Best-effort body extraction: --body 'TEXT' or --body "TEXT" or --field summary='TEXT'.
# When absent (npm publish, --body-file), DRAFT="" is acceptable: the agent will
```

So a `gh issue comment --body-file <path>` invocation yields `DRAFT=""`, and the gate hashes the EMPTY string. No reviewer marker can ever match, because the reviewer was given the real draft and its marker is keyed on the real draft's hash. The gate re-blocks indefinitely, and its own deny message directs you to do the thing you already did.

The comment says the empty draft is "acceptable" — that is true for the LEAK-SCAN half (an empty draft trivially passes the regex pre-filter) but not for the MARKER half, which is what actually gates the call.

## Symptoms

`gh issue comment --body-file X` (and `gh issue create --body-file X`) is denied by the external-comms gate no matter how many times the reviewer returns PASS. The deny message is identical each time and names no cause, so the natural diagnosis is that the marker did not persist — sending you after the P402 background-agent trap, or after trailing-whitespace theories, rather than at the extraction.

Observed 2026-08-02 closing issue #365: the voice-tone gate cleared (its marker matched) while the risk gate did not, which made it look like a per-evaluator persistence bug. It is not — both gates hash the same empty draft; the two just failed at different points in the retry sequence.

## Workaround

Use the **quoted-heredoc** form, `--body "$(cat <<'EOF' ... EOF)"`. This is the briefing's existing advice and it is correct. Confirmed working 2026-08-03 on both upstream filings (#407, #408) and on a `git commit -m` in the same session.

The gate's pattern list puts the heredoc first, ahead of `--body`/`-m`, and matches it **literally** — the comment in the source says as much, because the AI-canonical form is the quoted `<<'EOF'` heredoc whose body bash does not unescape. So it carries apostrophes, double quotes and backticks safely.

The single-quoted `--body '...'` form also works but is worse, and the earlier version of this section recommended it on thin evidence. The pattern is `--body[= ]'([^']*)'`, so the body cannot contain a single quote — which rules out ordinary English contractions. The double-quoted form is worse still: `-m "..."` is captured by `(?:-m|--message)[= ]"([^"]*)"`, and an escaped `\"` inside the body truncates the capture at the backslash, so the marker key diverges and the gate re-blocks after a PASS. That was observed 2026-08-03 on a commit message containing a quoted phrase.

## Impact Assessment

- **Who is affected**: anyone posting external comms through the gate. Maintainer-side only; no consumer impact.
- **Frequency**: deterministic. Every `--body-file` invocation, every time.
- **Severity**: Minor per RISK-POLICY Impact 2 — developer/agent time, no runtime, publish, or consumer path. It cost several diagnostic cycles on a session that was otherwise finished.
- **Analytics**: the briefing's Critical Points ALREADY carried this warning for the `gh issue create` case, and it was still walked into. That is signal about the failure being hard to recall at the moment of use rather than about the briefing being wrong — a deny message that named the cause would not need recalling.

## Root Cause Analysis

The gate extracts its draft from command text rather than from the tool's resolved input. A file path is opaque to a regex over the command line. The gate is an adopter-installed plugin surface (`wr-risk-scorer`), so the fix is upstream rather than in this repo.

### Investigation Tasks

- [x] **Confirmed on the newest cached version 2026-08-03.** `wr-risk-scorer/0.18.6/hooks/external-comms-gate.sh` still has exactly one occurrence of `body-file` and it is the comment quoted above, so the extraction gap is current and not an artefact of the stale 0.9.0 cache directory the gate happened to fire from.
- [x] **Upstream ask decided and filed** as [issue #408](https://github.com/windyroad/agent-plugins/issues/408) on 2026-08-03. Both options offered, with a stated preference for the smaller one: detect `--body-file` and deny with a directive that names it, rather than denying with a message that sends the reader after a marker-persistence bug that is not there. The version-skew observation went in as a note, since a fix needs a cache-invalidation story alongside it.
- [x] **Reported upstream** as [issue #408](https://github.com/windyroad/agent-plugins/issues/408) on 2026-08-03 per the P077 precedent, with a PR offered on whichever option they prefer.

Nothing further is owed in this repo; the remaining work is upstream. The Workaround section above was corrected in the same pass — the heredoc form is what to reach for, not the single-quoted one it previously recommended.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P077 — same upstream plugin suite, same report-then-PR path

## Related

- `external-comms-gate.sh` lines 134-135 (the comment quoted above) and line 229 (`KEY=$(printf '%s\n%s' "$DRAFT" "$SURFACE" | shasum -a 256 ...)`).
- **P402** (upstream) — the background-agent marker-persistence trap. Cited here only to distinguish it: the deny message points at P402, and P402 is NOT the cause when `--body-file` is used, which is what makes the misdirection expensive.
- **P077** — the upstream-report precedent for this plugin suite.
- The briefing's Critical Points entry on `gh issue create --body-file`, now extended in `external-comms-marker-mechanics.md`.

Origin: internal, surfaced 2026-08-02 while closing issue #365 with the ADR-041 fix detail.
