---
human-oversight: confirmed
oversight-date: 2026-07-27
status: 'proposed'
date: 2026-07-26
decision-makers: [Tom Howard]
consulted: [Claude Code]
informed: []
supersedes: [019-session-learning-briefing-system]
reassessment-date: 2027-01-26
---

# ADR 038: Per-Topic Briefing Tree Surfaced at Session Start

> Captured mid-session during the P062 fix iteration (2026-07-26) at the user's explicit direction to supersede ADR 019 before landing the migration. Records shipped reality observed live, not a forward-looking design proposal.

## Context and Problem Statement

This ADR supersedes [ADR 019](019-session-learning-briefing-system.superseded.md) (Session Learning and Briefing System).

ADR 019 recorded a single committed `docs/BRIEFING.md` injected into every conversation by a `UserPromptSubmit` hook. That mechanism has been retired upstream. The briefing surface is now owned by the `@windyroad/wr-retrospective` plugin, and at the version installed here (0.27.0) it works differently in every particular that matters:

- It is a **`SessionStart`** hook (`session-start-briefing.sh`, `matcher="startup"`), not `UserPromptSubmit`.
- It reads **only** `${CLAUDE_PROJECT_DIR}/docs/briefing/README.md`. It never reads `docs/BRIEFING.md`.
- It `awk`-extracts the section under the literal heading `## Critical Points (Session-Start Surface)`, up to the next H2, and emits it under a `CROSS-SESSION BRIEFING — critical points` banner.
- Every miss is a **silent `exit 0`** — absent tree, absent file, absent heading, or empty section all produce no output and no warning.

Because addressr never migrated its content into `docs/briefing/`, the hook has been silent-exiting since the plugin changed: **no briefing content has reached any session**, interactive or AFK. That is [P062](../problems/parked/062-afk-iter-subprocess-sessions-missing-briefing-md-content.md), whose confirmed root cause is exactly this record-vs-reality gap, and whose fix (the `docs/BRIEFING.md` to `docs/briefing/` migration) was parked pending this reconciliation.

The supersession is **pre-authorised by ADR 019's own Reassessment Criteria**: "BRIEFING.md growing too large (> 2000 tokens)". The legacy file is 45 KB — roughly 8-11k tokens, 4-5x that ceiling.

## Decision Drivers

- The decision record must describe the mechanism that actually runs, or it is worse than no record — P062 is the demonstrated cost.
- The injection surface is **plugin-owned**. This repo cannot edit, version, or test `session-start-briefing.sh`.
- The failure mode is silent. Whatever is recorded must be mechanically checkable, because nothing will warn us.
- Institutional knowledge must survive across sessions without manual re-derivation.

## Considered Options

1. **Adopt the plugin's per-topic tree contract; own the content side only** — migrate to `docs/briefing/`, record the contract and its version pin, treat the hook as an external dependency.
2. **Amend ADR 019 in place** — edit the confirmed record to describe the new mechanism.
3. **Repo-local briefing hook** — write our own injector so addressr owns the whole surface.
4. **Abandon cross-session briefing** — delete the corpus, rely on CLAUDE.md, ADRs, and memory files.

## Decision Outcome

**Option 1: adopt the plugin's contract; own the content side.**

Following the [ADR 001](001-risk-gated-release-process.proposed.md) precedent for plugin-owned governance surfaces — this repo cannot edit or test the gate, so the decision is about _how we conform to it_, not about the gate's design. Contrast [ADR 011](011-license-compliance-precommit.accepted.md), a repo-local hook this repo does own and can change.

The split:

| Side      | Owner                                  | Contents                                                                                                                          |
| --------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Injection | `@windyroad/wr-retrospective` (0.27.0) | `SessionStart` hook, heading extraction, banner                                                                                   |
| Content   | this repo                              | `docs/briefing/<topic-slug>.md` per topic, `docs/briefing/README.md` index + `## Critical Points (Session-Start Surface)` roll-up |

`docs/briefing/README.md`'s Critical Points section is the only content injected at session start; per-topic files are read on demand when context warrants. The roll-up is curated by `/wr-retrospective:run-retro`; the initial tree is produced from the legacy file by `/wr-retrospective:migrate-briefing`, which retires the legacy file to `docs/BRIEFING.md.migrated-<date>`.

Option 2 was rejected: the mechanism changed wholesale (different hook event, different path, different extraction), so an in-place amendment would erase the record of what was previously decided and why it stopped being true. Option 3 was rejected as duplicating a maintained plugin surface for no gain. Option 4 was rejected — the P062 recurrences (#368, #370) are direct evidence the corpus has value.

### Consequences

- Good: the recorded design matches the running mechanism; P062 unblocks.
- Good: per-topic files keep the injected surface small (Critical Points only) while the full corpus stays available on demand — directly addressing ADR 019's token-budget reassessment trigger.
- Neutral: the briefing corpus moves from one file to a tree, so **live** references to `docs/BRIEFING.md` go stale. Live surfaces to update as they are next touched: `CLAUDE.md` (the `/retrospective` row still names `BRIEFING.md` — imprecise rather than wrong; the shipped skills are `/wr-retrospective:run-retro` and `:migrate-briefing`), P031, P061, P062, and `docs/risks/R011`. Closed problem tickets, `docs/problems/README-history.md`, and `docs/retros/` entries reference the legacy path as **correct historical record and must not be rewritten**.
- Bad: this repo now depends on an unversioned external contract — a literal heading string in a plugin we do not control. Mitigated only by the reassessment trigger below.
- Bad: the Critical Points roll-up is an additional committed disclosure surface for briefing content. See R011 (`docs/risks/`) — the migration copies the whole legacy corpus into the tree, carrying that risk with it.
- Bad: the supersession blockquote on ADR 019 links `038-...proposed.md`, a status-bearing filename that breaks if ADR 038 is later promoted to `.accepted.md`. Inherent to the repo's naming convention (ADR 026's note has the same latent break); fix the link at promotion time.

### Confirmation

Mechanically checkable, all four required — any one failing means a silent no-op:

1. `docs/briefing/README.md` exists.
2. It contains the exact H2 `## Critical Points (Session-Start Surface)` — character-for-character; the hook's `awk` matcher is literal.
3. That section is non-empty (an empty section is an `exit 0`, indistinguishable from an absent tree).
4. Legacy content is retired to `docs/BRIEFING.md.migrated-<date>`, not left at `docs/BRIEFING.md`.

End-to-end: a fresh session emits the `CROSS-SESSION BRIEFING — critical points` block. That is P062's verification criterion.

### Reassessment Criteria

- **The `wr-retrospective` SessionStart briefing hook changes its source path, its extracted heading string, or is retired.** Observed contract pinned at **`wr-retrospective` 0.27.0**, `hooks/session-start-briefing.sh`. This trigger is the one ADR 019 lacked: it went stale because a plugin this repo does not own retired the mechanism, and nothing in the record was watching for that. Re-verify the hook body on each `wr-retrospective` major/minor upgrade. This ADR is itself the only in-repo record of the observed version — `.claude/settings.json` pins no `wr-retrospective` version — so the trigger is a discipline, not an automated check. Accepted deliberately: a repo-local version assertion would be one more unwatched surface, and the Confirmation checks below fail loudly enough (empty briefing block at session start) to catch a contract break in practice.
- The Critical Points roll-up grows past the injected-context budget the plugin's briefing-budget check enforces.
- Briefing content becoming stale despite `/wr-retrospective:run-retro` passes.

## Related

- [ADR 019](019-session-learning-briefing-system.superseded.md) — superseded by this ADR
- [ADR 001](001-risk-gated-release-process.proposed.md) — precedent for plugin-owned governance surfaces this repo cannot edit or test
- [ADR 011](011-license-compliance-precommit.accepted.md) — contrast case: a repo-local hook this repo does own
- [P062](../problems/parked/062-afk-iter-subprocess-sessions-missing-briefing-md-content.md) — the driving ticket; confirmed root cause and un-park trigger
- R011 — active risk over briefing content in committed docs; the migration carries it into the tree
- JTBD-400 (Ship releases reliably from trunk) — "checkable artefacts, not memory". The trace is thematically sound but imprecise: the harm here is per-session institutional-context loss, not release non-determinism. A future `addressr-maintainer` job along the lines of "each working session starts with the institutional context it needs" would be the precise home; noted as a future consideration only, not authored here.
