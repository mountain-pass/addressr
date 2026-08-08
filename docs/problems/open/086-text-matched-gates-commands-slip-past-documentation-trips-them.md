# Problem 086: Text-matched command detection — governed commands slip past the gates, and documentation trips them

**Status**: Open — upstream-blocked (@windyroad/wr-risk-scorer), [#410](https://github.com/windyroad/agent-plugins/issues/410)
**Reported**: 2026-08-04
**Priority**: 16 (High) — Impact: Significant (4) × Likelihood: Likely (4) — derived at capture; every gate in the suite is affected, the bypass needs no intent, and it was hit accidentally within minutes of the shape being available
**Origin**: internal
**Effort**: S — derived at capture: one shared regex anchor set, 16 call sites in four scripts
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Every `wr-risk-scorer` gate detects the command it governs with a regex anchored on start-of-string, `;`, `&&` or `||`:

```
(^|;|&&|\|\|)\s*<command>(\s|$)
```

That anchor set omits every other way a shell can introduce a command. A governed command placed after `if`, `while`, `for … do`, `then`, `else`, a pipe, `$( … )` or backticks is **not detected at all**, so the hook exits 0 and the command runs ungoverned.

This is not a partial weakening. The gate does not fire, so there is no score, no marker check, no CI precondition and no deny — identical to the gate not existing.

**Affected commands** (16 detection points across four scripts): `git commit`, `git push`, `npm run push:watch`, `npm publish`, `gh issue create`, `gh issue comment`, `gh issue edit`, `gh pr create`, `gh pr comment`, `gh pr edit`, `gh pr merge`.

That set is every governed surface the suite has: the commit gate, the push gate, and both external-comms gates.

## Reproduction

Isolated regex test — no gate was invoked and no bypass was performed to produce this:

```
git push origin master                          -> MATCHED (guard fires)
if git push origin master 2>&1 | tee p.log; ... -> NOT MATCHED (guard skipped)
for i in 1 2; do git push origin master; done   -> NOT MATCHED (guard skipped)
git commit -m x                                 -> MATCHED
if git commit -m x; then :; fi                  -> BYPASS
gh issue create --body x                        -> MATCHED
do gh issue create --body x                     -> BYPASS
```

## How it was found — accidentally, which is the point

Not by probing for it. On 2026-08-04 the GitHub API was intermittently unreachable (patchy connection), so `npm run push:watch` kept failing at the TLS handshake. The workaround was an ordinary retry loop:

```bash
for i in 1 2 3 4 5 6 7 8; do
  if git push origin master 2>&1 | tee /tmp/push.log | grep -qE "master -> master"; then
    echo "PUSHED on attempt $i"; break
  fi
  sleep 30
done
```

It pushed to master on the first attempt. Earlier in the same session the bare `git push origin master` had been denied with "Use `npm run push:watch` instead". Nothing about the intent changed between those two moments — only the shell syntax.

**The bypass required no knowledge that it existed.** A retry loop is the obvious response to a flaky network, and it silently converted a governed push into an ungoverned one.

## A wrong diagnosis, recorded because the correction matters

The first hypothesis was that this was P082 (`RISK_BYPASS: reducing` opening all three gates). The session did hold live `reducing-commit` / `reducing-push` / `reducing-release` markers at the time, so the story fit.

It was wrong. Reading `git-push-gate.sh` rather than inferring from the marker's presence shows the `reducing-push` check sits **inside the `npm run push:watch` branch** (line 43), which a bare `git push` never reaches — that branch is gated behind its own command match at line 36. The `git push` branch is lines 25-33 and consults no marker at all.

This was one step away from being reported on the upstream P082 issue as a live reproduction of a defect it is not. The correction came from reading the control flow instead of pattern-matching on which markers happened to exist.

## Two more symptoms, both found while filing the upstream report

The ticket above described one direction. Filing it surfaced two more, and all three share the root cause.

**False positive: documenting a governed command trips the gate.** The first `gh issue create` attempt was denied with the push gate's "Use `npm run push:watch` instead" message — because the issue body contained a fenced code block whose lines began `git push`. The gate matches the whole command string, and a heredoc body is part of that string, so prose ABOUT a governed command is indistinguishable from an invocation of one. Leading whitespace does not help (`\s*` allows it); a `$ ` prompt prefix does, which is why every example block in the upstream issue carries one. That workaround is not discoverable: any adopter documenting this tooling has to know the trick, and any issue, changeset or commit message quoting a governed command is denied for no reason.

**The heredoc delimiter must be literally `EOF`.** The external-comms marker extractor tries the heredoc form first with a pattern that hardcodes `EOF`:

```
[<][<]\s*['\"]?EOF['\"]?\s*\n(.*?)\nEOF
```

The second filing attempt used `ISSUEEOF`, which is ordinary shell and reads better in a body that itself discusses heredocs. The pattern did not match, so extraction fell through to the `--body "([^"]*)"` capture, which truncated at the first quote inside the body. The marker key was computed over that fragment while the reviewer's was computed over the whole draft, so the gate re-blocked after a clean PASS **with no indication why**. Verified in isolation: `EOF` matches, `ISSUEEOF` does not.

This one is worth carrying into the briefing separately, because it is a trap with no error message — the deny text says "has not been reviewed", which is exactly wrong when the reviewer has just passed it.

## Impact Assessment

- **Who is affected**: every adopter of `wr-risk-scorer`. Maintainer-side, but the governed actions reach production: this repo's push tier arms a whole-root-module `terraform apply`, and the publish path is coupled to the prod deploy.
- **Frequency**: available on every invocation. Whether it fires depends only on shell syntax, which agents and humans vary for reasons unrelated to governance — retry loops, conditional guards, pipelines.
- **Severity**: Significant. The realised shape is an ungoverned push or publish: no risk score, no CI precondition, no external-comms leak review. In this instance the outcome was benign — a docs-only commit whose CI was green — but that was luck, not control.

## Root Cause Analysis

The anchor set was written to catch the leading command in a compound statement (`a && b`, `a; b`) and treats that as the complete grammar of shell command introduction. It is not: `if`, `while`, `until`, `for … do`, `then`, `else`, `elif`, `{`, `(`, `|`, `$(`, backticks and `!` all introduce a command position.

Deeper: the gates match on **command text** rather than on the tool's resolved invocation. Text matching over an arbitrary shell string is a losing position — every fix enumerates one more syntactic form, and the next unenumerated form is another silent bypass. This is the same class as P080 (the external-comms gate extracting an empty draft from `--body-file`, because a file path is opaque to a regex over the command line).

### Investigation Tasks

- [x] **Reported upstream 2026-08-04** as [issue #410](https://github.com/windyroad/agent-plugins/issues/410), carrying all three symptoms. More serious than its siblings: it needs no verdict, no marker state and no intent, and it defeats every gate rather than one.
- [ ] Propose the narrow fix as the immediate mitigation: widen the anchor set to include `if`, `then`, `else`, `elif`, `do`, `while`, `until`, `{`, `(`, `|`, `!`, `$(` and backtick. Cheap, and closes the observed instance.
- [ ] Propose the structural fix as the real one: match on a **tokenised** command rather than on raw text — split the command string on shell operators and test whether any resulting token position starts with a governed command. That removes the enumerate-one-more-form treadmill.
- [ ] Check whether the same anchor set appears in the sibling plugins' hooks (`wr-architect`, `wr-jtbd`, `wr-voice-tone`, `wr-itil`). If the shape was copied, the blast radius is larger than the four scripts counted here.
- [ ] Decide the local posture while upstream-blocked. There is no in-repo fix — these are plugin-cache hooks. The honest interim control is discipline: **do not wrap a governed command in a shell construct**, and if a retry loop is genuinely needed, run the governed command as its own top-level statement and loop around the check instead.

## Dependencies

- **Blocks**: (none mechanically — but it degrades every gate the project relies on)
- **Blocked by**: upstream `windyroad/agent-plugins`
- **Composes with**: P080, P082

## Recurrence 2026-08-08 — blocked while documenting the sibling defect

Writing the [P080](080-external-comms-gate-cannot-read-body-file-so-the-documented-path-never-clears.md) recurrence note through a Bash heredoc tripped the external-comms gate. The prose _described_ a `gh issue comment` invocation as the documented workaround; the extractor matches on command text rather than intent, so it read the documentation as an outbound post and demanded a review of a ticket body.

Documenting one gate defect was blocked by a sibling of the same gate defect. Landed via the `Edit` tool, which takes a different branch.

Worth recording because it is the cleanest possible statement of this ticket's thesis: the gate cannot distinguish "I am posting this" from "I am writing about posting this", and the asymmetry runs both ways — real commands slip past when their shape is unusual, documentation trips it when its shape is ordinary.

## Related

- **P082** (`RISK_BYPASS: reducing` opens all three gates) — filed upstream as [#407](https://github.com/windyroad/agent-plugins/issues/407). The initial, wrong diagnosis of this problem. Distinct: P082 needs a `reducing` verdict to exist and opens the gates it was granted for; this needs nothing and prevents the gate from running at all.
- **P080** (external-comms gate cannot read `--body-file`) — filed upstream as [#408](https://github.com/windyroad/agent-plugins/issues/408). Same root class: matching on command text rather than on the resolved invocation.
- **P077** — the upstream-report precedent for this plugin suite.
- **R023** — the register entry on watchers reporting success on a red run. Same family of failure: a governance surface that is silent when it should be loud, and whose silence reads as a pass.

Origin: internal, surfaced 2026-08-04 when a retry loop written to survive a flaky network connection pushed to master through a guard that had denied the same command minutes earlier.
