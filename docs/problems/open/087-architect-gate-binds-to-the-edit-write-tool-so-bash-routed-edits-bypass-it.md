# Problem 087: The architect gate binds to the Edit/Write tool, so Bash-routed edits bypass it entirely

**Status**: Open
**Reported**: 2026-08-05
**Priority**: 8 (Medium) — Impact: Minor (2) × Likelihood: Likely (4) — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: S — derived at capture: the remediation is a `wr-architect` plugin change, so the local work is an upstream report plus any interim repo-side convention
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

The `wr-architect` PreToolUse gate (`architect-enforce-edit.sh`) is registered in the plugin's `hooks.json` under `"matcher": "Edit|Write"`. It therefore fires on the **tool name**, not on the predicate _"a file under `docs/decisions/` is being modified"_. Any edit routed through Bash — a `node` script, a `perl -pi`, a `sed -i` — modifies governed files with no gate firing at all.

Realised 2026-08-05 during P083 batch six. A node script invoked through Bash rewrote 141 link targets across 47 files, **including 14 ADR bodies** (`docs/decisions/` 013, 019, 024, 025, 026, 027, 028, 029, 030, 032, 034, 036, 038, 039). No gate fired at any point. The gate then blocked the very next `Edit`-tool call against `docs/decisions/029` — which is the only reason the asymmetry was noticed.

The same `Edit|Write` scoping applies on the **PostToolUse** side, so `architect-refresh-hash.sh` and `architect-compendium-update-entry.sh` also did not fire for those 141 edits. Stored architect content hashes are consequently stale against the 14 edited ADR bodies. That failure direction is a spurious **block** on the next Edit-tool touch rather than a silently-accepted change, so it fails safe — but it is drift, and it is drift the operator will experience as an unexplained gate refusal.

### Why this is not an instance of P086

[P086](086-text-matched-gates-commands-slip-past-documentation-trips-them.md) is an incomplete command-position **grammar**: its anchor set `(^|;|&&|\|\|)` enumerates some command-introduction positions and misses others (`if`, `for`, `do`, pipes). Both of its proposed fixes — widen the anchors, or tokenise the command string — repair a matcher that exists and does fire.

Here there is no pattern to widen: **the matcher never subscribes to Bash at all.** Widening could not work either, because `node scripts/fix-links.mjs` carries zero information about which files it will write — the governed file set only exists _after_ execution. So the fix shape is PostToolUse-diff-based or commit-time, not detection-time.

Different defect, different fix, different owner: this is `wr-architect`, where P086 is `wr-risk-scorer` and is upstream-blocked on `windyroad/agent-plugins#410` with three symptoms already attached. Appending this there would let #410 close in full while this symptom stays wide open.

### The shared class

Both are instances of **a governance gate observing a proxy — the tool name, or the command text — instead of the governed action: a file being modified, or a command being invoked.** P086's own Root Cause Analysis already articulates that class, which makes it the family anchor without absorbing this as a member.

## Symptoms

- A bulk edit run through Bash modifies files under `docs/decisions/` and no architecture review is demanded.
- The next `Edit`-tool touch on a governed file may then block with a **decision-drift** message, because the stored content hash was never refreshed for the Bash-routed edits.
- The decisions compendium (`docs/decisions/README.md`) silently misses entries for ADRs edited that way.

## Workaround

Consult `wr-architect:agent` voluntarily before any bulk edit that will touch `docs/decisions/`. That is what happened in the originating batch — two full review passes, both returning ISSUES FOUND and both materially changing the work. **This is not a control**: it depended entirely on the agent choosing to ask, which is exactly the property a gate exists to remove.

## Impact Assessment

- **Who is affected**: the maintainer, and the integrity of the governance record. No consumer, runtime, build or publish path — ADR bodies govern the deploy and release machinery but do not themselves execute.
- **Frequency**: every Bash-routed edit of a governed file. Bulk doc edits are a routine pattern in this repo.
- **Severity**: Minor. Unreviewed changes to governed artefacts enter the record, plus stale hashes and compendium drift. Same impact basis R018 uses for this artefact class.
- **Analytics**: none collected. The originating instance was found by noticing the gate fire _after_ 141 ungated edits, not by any signal.

## Root Cause Analysis

The hook contract is expressed in terms of the **tool** that performs an action rather than the **effect** of the action. `hooks.json` can express "when the agent calls Edit or Write"; it cannot express "when a file matching `docs/decisions/**` changes". Bash is a general-purpose escape hatch from any tool-keyed predicate, and no amount of matcher-widening closes it, because the affected path set is not knowable from the command string before execution.

### Investigation Tasks

- [ ] Confirm the hook registration against the installed plugin version (`architect-enforce-edit.sh` under `"matcher": "Edit|Write"`), and check whether a PostToolUse Bash matcher is available in the hook API at all.
- [ ] Determine whether a PostToolUse-on-Bash diff check is viable: after any Bash call, diff the working tree and demand review if governed paths changed. Assess the cost of running a diff after every Bash invocation.
- [ ] Assess the commit-time alternative — a pre-commit check that governed files in the staged set carry a fresh architect marker. Later than detection-time but path-complete, and it cannot be bypassed by choice of tool.
- [ ] Report upstream to `windyroad/agent-plugins` as a separate issue from #410, per the reasoning above. Route the draft through `/wr-risk-scorer:assess-external-comms` first.
- [ ] Repair the stale architect content hashes for the 14 ADR bodies edited on 2026-08-05, or confirm the next Edit-tool touch self-heals them.

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
