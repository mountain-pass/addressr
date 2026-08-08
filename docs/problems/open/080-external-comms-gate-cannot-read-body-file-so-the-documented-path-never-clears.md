# Problem 080: The external-comms gate cannot read `--body-file`, so the documented path can never clear it

**Status**: Open — upstream-blocked (@windyroad/wr-risk-scorer), [#408](https://github.com/windyroad/agent-plugins/issues/408)
**Reported**: 2026-08-02
**Priority**: 8 (Medium) — Impact: Minor (2) × Likelihood: Almost certain (4). **Re-rated 2026-08-08 on recurrence.** Likelihood 3 to 4: no longer an estimate that it fires whenever the form is used. It recurred, and the extractor read confirms the deny is unconditional for the file forms, so every use fails by construction. Impact stays 2 (developer time), but the cost per instance is higher than captured, because the deny message points at the marker while the fault is in body extraction
**Origin**: internal
**Effort**: S — add the file-based forms to the extractor pattern list in `external-comms-gate.sh`, or correct the deny message to name the unsupported form. The `Write`/`Edit` branch already reads files, so the machinery exists
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

Reproduced again 2026-08-06 filing [#412](https://github.com/windyroad/agent-plugins/issues/412) for P087, on `wr-risk-scorer` 0.18.6, so the defect is live on the current version. Same misleading shape as the 2026-08-02 instance and in the same order: the first `--body-file` attempt was denied by the **voice-tone** gate while the risk gate cleared, and after the voice-tone review passed the second attempt was denied by the **risk** gate. Two different evaluators naming persistence, on a draft both had just returned PASS for. The cause was read directly out of `hooks/external-comms-gate.sh` this time rather than inferred: the extraction block's own comment states that when no inline body is present — it names `--body-file` explicitly — `DRAFT=""` is accepted, and `compute_external_comms_key` then hashes the empty string, which cannot match a marker keyed on the real draft. Confirming evidence: both evaluators' markers were present on disk under the **same** hash, so persistence was demonstrably fine and only the gate's own key differed. Filing succeeded on the quoted-heredoc form below.

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

## Recurrence 2026-08-08, with the extractor read directly

Hit again posting the [issue #375](https://github.com/mountain-pass/addressr/issues/375) correction for [P074](../verifying/074-p007-street-level-first-unfixed-for-half-of-sub-unit-addresses.md). Worth recording because the defect was traced to the exact source line rather than inferred from the symptom, and because it cost a full round of misdiagnosis first.

Two things this instance adds beyond the 2026-08-02 and 2026-08-06 records above, which already establish the cause and the workaround.

**The full pattern list, enumerated.** The extractor matches an ordered list and takes the first hit: a quoted heredoc, `--body 'TEXT'`, `--body "TEXT"`, `--field name='TEXT'`, `--field name="TEXT"`, `-m 'TEXT'`, `--message "TEXT"`. **`-F` is absent as well as `--body-file`** — the short form is not covered either, which the earlier records do not say. Identical in `wr-risk-scorer/0.13.3` and `wr-voice-tone/0.7.1`; their key libraries are byte-identical, so both gates fail the same way.

**How much the misleading deny message costs when you do not already know.** Before reading the extractor I re-ran both reviewers, checked evaluator ids against their `.conf` files, diffed the two plugins' key libraries, and inspected the session marker directory — while both markers sat on disk under the correct key (`…-risk-reviewed-a8dec0b0…` and `…-voice-tone-reviewed-a8dec0b0…`, matching the file's computed key exactly). Every one of those checks passed, which is what makes the message so expensive: it points at the marker, the marker is fine, and the fault is one layer earlier in extraction. That argues for the _smaller_ of the two fix options offered upstream in [#408](https://github.com/windyroad/agent-plugins/issues/408) — a deny message naming the unsupported form would have cost minutes rather than a diagnostic session.

**A second gate fired while writing this section**, which is [P086](086-text-matched-gates-commands-slip-past-documentation-trips-them.md) exactly: composing this ticket through a Bash heredoc tripped the external-comms gate, because the prose _describes_ an outbound-comment command and the extractor matches on text rather than intent. Documenting the defect was blocked by a sibling of the defect. Landed via the `Edit` tool instead.

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
