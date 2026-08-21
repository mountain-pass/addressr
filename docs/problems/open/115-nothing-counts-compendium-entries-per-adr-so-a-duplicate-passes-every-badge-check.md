# Problem 115: Nothing counts compendium entries per ADR, so a duplicate passes every badge check

**Status**: Open
**Reported**: 2026-08-20
**Priority**: 4 (Low) — Impact: 2 × Likelihood: 2. Impact 2: the compendium is the architect agent's routine load surface per ADR-077, so a duplicate entry is read as two decisions and can strip a neighbour's cross-references. Likelihood 2: it needs a hand-edit racing the refresh hook, which is now discouraged in the briefing — but it happened on the first attempt.
**Origin**: internal
**Effort**: S — one assertion in an existing test file.
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

**`docs/decisions/README.md` carried TWO `### ADR-051` entries and the whole suite stayed green.**

On 2026-08-20 ADR-051 was added to the compendium by hand _and_ by the pre-commit refresh hook. Both copies
landed. `decisions-invariants.test.mjs` checks status badges against frontmatter, supersession site-counts,
reverse badges, count claims against the filesystem, and that every `ADR-NNN` in a Related line resolves —
**and passed on all of them**, because none of them counts entries per ADR.

The duplicate was found by eye, one commit later.

**It also stripped a neighbour.** The hand-written insert anchored on ADR-050's `**Confirmation:**` line and
appended after it — capturing ADR-050's trailing `**Related:** ADR-040, ADR-039, ADR-049` line into the new
entry. So ADR-050 lost its cross-references and the duplicate carried the wrong ones. Neither is detectable
by any current assertion.

**The count checks pass by construction here.** `Total ADRs: 51 (45 in-force, 6 historical)` and the
`_45 ADRs._` section subheading are both derived from the **filesystem**, not from the compendium's entry
list. Two entries for one file still counts as one file. The check that looks most likely to catch this is
structurally incapable of it.

## Symptoms

1. Two `### ADR-NNN` headings for the same ADR; the suite is green.
2. A neighbouring entry silently loses its `**Related:**` line to the duplicate.
3. The filesystem-derived counts agree with themselves and with disk throughout.

## Workaround

Let the pre-commit hook author the entry; hand-fix only the count lines. Verify after committing:

```
git show HEAD:docs/decisions/README.md | grep -c '### ADR-051'
```

Expect exactly 1. This is recorded in `docs/briefing/decisions-compendium.md`, and the briefing already
warned that the documented standalone generator is destructive against hook-authored entries — the failure
here is the mirror case, a hand-edit racing the hook rather than a generator run.

## Root Cause Analysis

Every existing assertion is **per-ADR-file** or **aggregate**: it iterates the filesystem and asks what the
compendium says about each file. None iterates the **compendium** and asks whether it says anything twice.
A duplicate is invisible to a check keyed on the thing being duplicated.

The `**Related:**` capture is a second, independent gap: no assertion ties an entry's Related line to the ADR
body's own Related section, so a line can migrate between entries undetected.

### Investigation Tasks

- [ ] Assert each `### ADR-NNN` heading appears **exactly once** in `docs/decisions/README.md`. One line, in
      the existing `decisions-invariants.test.mjs`. Mutation-test it by duplicating an entry.
- [ ] Consider asserting every in-force entry carries a `**Related:**` line when its ADR body has a Related
      section — this is what would have caught ADR-050's stripped line.
- [ ] Confirm the assertion also fires on the reverse shape: an entry for an ADR file that no longer exists.

## Fix Strategy

**Kind**: `improve`. **Shape**: test fixture (repo-local).

**Target file**: `test/js/__tests__/decisions-invariants.test.mjs`.
**Observed flaw**: no assertion counts compendium entries per ADR, so a duplicate passes every check.
**Edit summary**: add an exactly-one-heading-per-ADR assertion, mutation-tested by duplicating an entry.
**Evidence**: two `### ADR-051` entries committed 2026-08-20 in `a425c260`, green suite; repaired in
`ff74257a`, which also restored ADR-050's stripped `**Related:**` line.

## Related

- **ADR-077** — the compendium as the architect agent's routine load surface. A duplicate is read as two
  decisions by the agent this surface exists to serve.
- **[P033](../closed/033-source-inspection-tests-anti-pattern.md)** — a check that cannot fail on the case it looks
  most likely to cover. The filesystem-derived counts here are that shape.
- **[P114](114-governance-checks-that-cannot-fail-pre-check-on-shape-drain-on-unbounded-evidence-measure-the-wrong-tree.md)**
  — the upstream siblings of this class, found the same day.
