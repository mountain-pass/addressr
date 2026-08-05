# Problem 087: The architect gate binds to the Edit/Write tool, so Bash-routed edits bypass it entirely

**Status**: Open — upstream-blocked (@windyroad/wr-architect), [#412](https://github.com/windyroad/agent-plugins/issues/412)
**Reported**: 2026-08-05
**Priority**: 8 (Medium) — Impact: Minor (2) × Likelihood: Likely (4) — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: S — derived at capture: the remediation is a `wr-architect` plugin change, so the local work is an upstream report plus any interim repo-side convention
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

The `wr-architect` PreToolUse gate (`architect-enforce-edit.sh`) is registered in the plugin's `hooks.json` under `"matcher": "Edit|Write"`. It therefore fires on the **tool name**, not on the predicate _"a file under `docs/decisions/` is being modified"_. Any edit routed through Bash — a `node` script, a `perl -pi`, a `sed -i` — modifies governed files with no gate firing at all.

Realised 2026-08-05 during P083 batch six. A node script invoked through Bash rewrote 141 link targets across 47 files, **including 14 ADR bodies**. **These are not R018's figures**, and the two are easy to conflate because they come from the same sitting: R018 counts **174 broken links across 50 files**, which is the defect being repaired; 141 across 47 is the subset the script actually rewrote in that pass. The number that matters to this ticket is neither of those, but the 14 ADR bodies among them (`docs/decisions/` 013, 019, 024, 025, 026, 027, 028, 029, 030, 032, 034, 036, 038, 039). No gate fired at any point. The gate then blocked the very next `Edit`-tool call against `docs/decisions/029` — which is the only reason the asymmetry was noticed.

The same `Edit|Write` scoping applies on the **PostToolUse** side, so `architect-refresh-hash.sh` and `architect-compendium-update-entry.sh` also did not fire for those 141 edits. Stated here as mechanism only, not as a second harm: per the correction below, the refresh hook staying silent after a Bash-routed edit is the safe direction rather than a defect.

**CORRECTED 2026-08-06 after reading the mechanism.** An earlier version of this paragraph said stored content hashes were left stale against the 14 edited ADR bodies and needed repair. That was wrong on every clause, and the error was assuming a per-file hash store this plugin does not have:

- **There are no per-ADR hashes.** `_substance_hash_path` (`hooks/lib/gate-helpers.sh`) computes **one** sha256 over every `docs/decisions/*.md` concatenated, README excluded, whitespace-normalised. One digest for the whole directory.
- **It is session-scoped and ephemeral**, at `/tmp/architect-reviewed-<SESSION_ID>.hash`. Nothing durable, nothing in the repo, nothing that survives the session that wrote it. The 2026-08-05 state is unreachable by construction.
- **Drift is self-healing.** The comparison lives in `hooks/lib/architect-gate.sh`, not in the enforce hook, which contains no hash logic at all. On mismatch it does `rm -f "$MARKER" "$HASH_FILE"` and denies with a re-delegate directive. A stale digest therefore cannot persist: the first Edit-tool touch that sees it clears it and buys exactly one review.
- **The refresh hook not firing on Bash is the SAFE direction, not the defect.** Had `architect-refresh-hash.sh` fired after those Bash edits it would have re-blessed the digest and erased the only remaining signal that they happened. Its `Edit|Write` scoping is doing the right thing by accident.

So the real consequence is narrower and worth stating precisely: **no architecture review was demanded before 141 edits landed, 14 of them in ADR bodies.** What the drift check buys afterwards is a whole-directory re-review triggered by the next Edit-tool touch, which is weaker than a pre-edit gate on the specific change but is not nothing. The gate firing on the very next `Edit` call against `docs/decisions/029` — read at the time as an asymmetry — was in part this check working.

### Why this is not an instance of P086

[P086](086-text-matched-gates-commands-slip-past-documentation-trips-them.md) is an incomplete command-position **grammar**: its anchor set `(^|;|&&|\|\|)` enumerates some command-introduction positions and misses others (`if`, `for`, `do`, pipes). Both of its proposed fixes — widen the anchors, or tokenise the command string — repair a matcher that exists and does fire.

Here there is no pattern to widen: **the matcher never subscribes to Bash at all.** Widening could not work either, because `node scripts/fix-links.mjs` carries zero information about which files it will write — the governed file set only exists _after_ execution. So the fix shape is PostToolUse-diff-based or commit-time, not detection-time.

Different defect, different fix, different owner: this is `wr-architect`, where P086 is `wr-risk-scorer` and is upstream-blocked on `windyroad/agent-plugins#410` with three symptoms already attached. Appending this there would let #410 close in full while this symptom stays wide open.

### The shared class

Both are instances of **a governance gate observing a proxy — the tool name, or the command text — instead of the governed action: a file being modified, or a command being invoked.** P086's own Root Cause Analysis already articulates that class, which makes it the family anchor without absorbing this as a member.

## Symptoms

- A bulk edit run through Bash modifies files under `docs/decisions/` and no architecture review is demanded.
- The next `Edit`-tool touch on a governed file blocks with a **decision-drift** message. Recorded here as a symptom because that is what the operator sees, but per the correction above it is the drift check working: it detects the Bash-routed edits after the fact and demands one whole-directory re-review.
- ~~The decisions compendium (`docs/decisions/README.md`) silently misses entries for ADRs edited that way.~~ **Withdrawn 2026-08-06, checked and false.** 41 ADRs on disk, 41 compendium entries, all 14 present. A compendium entry carries title, status, oversight and Related-ADR IDs, not body content, so a link-target rewrite inside an ADR body cannot change one. The compendium hook not firing was a no-op for this batch.

## Workaround

Consult `wr-architect:agent` voluntarily before any bulk edit that will touch `docs/decisions/`. That is what happened in the originating batch — two full review passes, both returning ISSUES FOUND and both materially changing the work. **This is not a control**: it depended entirely on the agent choosing to ask, which is exactly the property a gate exists to remove.

## Impact Assessment

- **Who is affected**: the maintainer, and the integrity of the governance record. No consumer, runtime, build or publish path — ADR bodies govern the deploy and release machinery but do not themselves execute.
- **Frequency**: every Bash-routed edit of a governed file. Bulk doc edits are a routine pattern in this repo.
- **Severity**: Minor. Unreviewed changes to governed artefacts enter the record. Same impact basis R018 uses for this artefact class. **Corrected 2026-08-06**: this bullet previously read "plus stale hashes and compendium drift", and both clauses are withdrawn by the correction in the Description. Recorded rather than silently deleted because the survival is the finding: the sentence was falsified by an edit two sections above it, in the same sitting, and the sweep that wrote that correction did not reach here. That is R028's claim-scoped-not-locality-scoped shape, realised in a problem ticket, where no invariant scans at all. Caught by the risk scorer on the commit, not by the sweep.
- **Analytics**: none collected. The originating instance was found by noticing the gate fire _after_ 141 ungated edits, not by any signal.

## Root Cause Analysis

The hook contract is expressed in terms of the **tool** that performs an action rather than the **effect** of the action. `hooks.json` can express "when the agent calls Edit or Write"; it cannot express "when a file matching `docs/decisions/**` changes". Bash is a general-purpose escape hatch from any tool-keyed predicate, and no amount of matcher-widening closes it, because the affected path set is not knowable from the command string before execution.

### Investigation Tasks

- [x] **Confirmed 2026-08-06 against the active plugin version, 0.20.2.** `architect-enforce-edit.sh` and `architect-oversight-marker-discipline.sh` are both `PreToolUse` `"matcher": "Edit|Write"`; `architect-refresh-hash.sh` and `architect-compendium-update-entry.sh` are both `PostToolUse` `"matcher": "Edit|Write"`. **The Bash channel is not missing — it is already wired on both sides**: `PreToolUse` `"matcher": "Bash"` runs `architect-readme-pairing-check.sh`, and `PostToolUse` `"matcher": "Agent|Bash|Skill"` runs `architect-slide-marker.sh`. So this is not an API limitation. The plugin subscribes to Bash for marker-sliding and for a README pairing check, and simply does not subscribe for governed-file detection, which makes the remediation materially cheaper than the ticket first assumed and gives the PostToolUse-diff option an existing hook to hang off.
- [ ] Determine whether a PostToolUse-on-Bash diff check is viable: after any Bash call, diff the working tree and demand review if governed paths changed. Assess the cost of running a diff after every Bash invocation.
- [ ] Assess the commit-time alternative — a pre-commit check that governed files in the staged set carry a fresh architect marker. Later than detection-time but path-complete, and it cannot be bypassed by choice of tool.
- [x] **Reported upstream 2026-08-06** as [issue #412](https://github.com/windyroad/agent-plugins/issues/412), separate from #410 per the reasoning above, and carrying the already-wired-Bash-channel finding so the fix shape is concrete rather than open-ended. Both external-comms gates cleared: the leak review passed first time; the voice-tone review **failed** the first draft on eight em-dashes and the banned `Happy to` closer, and passed after a rewrite. **P080 reproduced en route**: `gh issue create --body-file` was denied twice despite valid PASS markers, because the gate sets `DRAFT=""` when no inline body is present, so its key can never match the reviewer's. Filing succeeded only with an inline `--body "$(cat <<'EOF' ... EOF)"` heredoc, which the gate extracts ahead of the `--body` patterns. That is a live reproduction to attach to [#408](https://github.com/windyroad/agent-plugins/issues/408).
- [x] **Closed 2026-08-06: there is nothing to repair, and the task rested on a wrong model of the mechanism.** No per-ADR hash store exists anywhere — not in ADR frontmatter, not under `.claude/`, not in the repo. The single directory digest is session-scoped in `/tmp`, and on mismatch the gate deletes the marker and the hash and asks for one re-review, so a stale value cannot persist. Live check: 39 architect markers on disk carry exactly **one** `.hash` file between them, belonging to a session that ended, and the current session has a marker with no hash at all, which takes `architect-gate.sh`'s documented `No hash = old marker format, allow` branch. The compendium was verified complete at 41 of 41. **Second half of the task answered as asked**: the next Edit-tool touch does self-heal, by clearing both files and demanding a fresh review.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: upstream — the remediation is a `wr-architect` plugin change this repo cannot make.
- **Composes with**: P086, P080

## Related

- [P086](086-text-matched-gates-commands-slip-past-documentation-trips-them.md) — the family anchor for the shared "gate observes a proxy, not the action" class. **Not a parent**: different matcher, different fix shape, different plugin owner.
- [P080](080-external-comms-gate-cannot-read-body-file-so-the-documented-path-never-clears.md) — another gate whose observation surface does not match the action it governs.
- [P072](072-architect-issues-found-writes-no-marker-deadlocking-adr-edits.md) — the closest sibling and still distinct: P072 is about the _unblock condition_ of a gate that does fire; this is a gate that never subscribes to the channel doing the writing. Opposite directions.
- [P046](046-wr-architect-oversight-marker-multi-agent-sid-and-relative-path.md) — `wr-architect` marker **key computation**; the hook fires correctly there and simply cannot find a correctly-keyed marker. Already reported upstream at `windyroad/agent-plugins#393`, whose boundary this must not blur.
- [P031](../known-error/031-create-adr-skill-does-not-auto-satisfy-edit-gate-hooks.md) and [P066](066-architect-edit-gate-blocks-writes-to-untracked-scratchpad.md) — repo precedent that architect-gate defects get standalone tickets.
- **R018** (`docs/risks/R018-adr-links-problem-ticket-committed-before-ticket-exists.active.md`) — the register entry whose remediation surfaced this.

**Capture-time hang-off arbitration** (`wr-itil:hang-off-check`, 2026-08-05): verdict `PROCEED_NEW` against candidates P072, P046, P076 and P067. Rationale recorded: no candidate's root cause is the hook matcher's _subscription surface_ — each concerns a gate that does fire and then behaves wrongly, or concerns ADR content rather than hook mechanics. The arbiter added a sibling note for the next cluster pass: P072, P046 and this ticket are three surfaces of a `wr-architect` gate-mechanics parent that none of them is.

Origin: internal, surfaced 2026-08-05 while repairing 174 broken documentation links under P083 batch six / R018. Scored by `wr-risk-scorer:pipeline` at 8 inherent / 2 residual for that action, with the reviewer recording it as a catalog miss.
