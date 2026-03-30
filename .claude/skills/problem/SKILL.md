---
name: problem
description: Create or update a problem ticket per PROBLEM-MANAGEMENT.md. Supports creating new problems, updating root cause analysis, transitioning status, and closing problems.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# Problem Management Skill

Create, update, or transition problem tickets following an ITIL-aligned problem management process. This skill is the authoritative definition of the problem management workflow — no separate process document is needed.

## Operations

- **Create**: `problem <title or description>` — creates a new open problem
- **Update**: `problem <NNN> <update details>` — updates an existing problem (add root cause, evidence, fix strategy)
- **Transition**: `problem <NNN> known-error` — moves to known-error when root cause is confirmed
- **List**: `problem list` — shows all open problems sorted by priority
- **Work**: `problem work` — runs a review first, then begins working the highest-WSJF problem
- **Review**: `problem review` — re-assess all open problems: update priorities per RISK-POLICY.md, estimate effort, calculate WSJF, and update files

**Closing problems:** Problems are closed ONLY after the user verifies the fix in production — not when the fix is committed or released. The workflow:
1. When the fix is released: add a `## Fix Released` section to the known-error file (e.g., `Deployed in v0.26.X. Awaiting user verification.`). Keep the file as `.known-error.md`.
2. When the user explicitly confirms ("it's fixed", "verified", "working"): `git mv` to `.closed.md`, update the Status field, and reference the problem in the commit message (e.g., "Closes P008").
3. Never assume the fix works — always wait for explicit user confirmation before closing.

## Problem Lifecycle

| Status | File suffix | Meaning | Entry criteria |
|--------|-----------|---------|----------------|
| **Open** | `.open.md` | Reported, under investigation | New problem identified |
| **Known Error** | `.known-error.md` | Root cause confirmed, fix path clear | Root cause documented, reproduction test exists, workaround in place |
| **Closed** | `.closed.md` | Fix verified in production | Fix released AND user explicitly confirms it works |

**Test-driven resolution:** When root cause is identified, create a failing test that reproduces the problem. Skip/disable the test if a feature-disabling workaround is applied. Re-enable the test when the permanent fix is implemented — the test passing confirms resolution.

## WSJF Prioritisation

Problems are ranked using Weighted Shortest Job First (WSJF):

**WSJF = (Severity × Status Multiplier) / Effort**

**Severity** = Impact × Likelihood (1-25) from `RISK-POLICY.md`. Read the impact levels, likelihood levels, and risk matrix from the policy — do not hardcode them here.

**Status Multiplier** (known-errors have confirmed root cause and clear fix path — higher value per unit of work):

| Status | Multiplier |
|--------|-----------|
| Known Error | 2.0 |
| Open | 1.0 |

**Effort** (estimated fix size — smaller effort = higher priority):

| Effort | Divisor | Description |
|--------|---------|-------------|
| S | 1 | < 1 hour, single file, quick fix |
| M | 2 | 1-4 hours, few files, moderate change |
| L | 4 | > 4 hours, multiple files, significant change |

**Example**: A Known Error with severity 8 (Impact 4 × Likelihood 2) and Small effort:
WSJF = (8 × 2.0) / 1 = **16.0** — do this first.

An Open problem with severity 6 (Impact 3 × Likelihood 2) and Large effort:
WSJF = (6 × 1.0) / 4 = **1.5** — lower priority despite medium severity.

When estimating effort, read the problem's root cause analysis and fix strategy. If effort is unknown, default to M (2).

## Working a Problem

What "work" means depends on the problem's status:

**Open problem (no confirmed root cause):**
1. Read the problem description and any preliminary hypotheses
2. Investigate the root cause — read relevant source code, run experiments, query prod data. Do NOT guess.
3. Document findings in the Root Cause Analysis section with evidence
4. Create a failing reproduction test (can be skipped/disabled)
5. Identify a workaround (even "delete and re-enter" counts)
6. Update the problem file with all findings
7. **Transition to Known Error immediately** — once root cause and workaround are documented, `git mv` the file to `.known-error.md` and update the Status field. Do not wait for a separate review.
8. If the fix is small enough, continue straight to implementing it (becoming a Known Error → Closed flow in one session)

**Known Error (root cause confirmed, fix path clear):**
1. Read the root cause analysis and fix strategy
2. Implement the fix following the project's development workflow (plan if needed, architect review, tests, etc.)
3. Include the problem doc closure in the fix commit (`git mv` to `.closed.md`, update Status)
4. Push, create changeset, release per the lean release principle

**In both cases:** After completing work on one problem, run `problem work` again to pick up the next highest-WSJF problem. Keep going until the user says stop or no more problems are actionable.

## Steps

### 1. Parse the request

Determine the operation from `$ARGUMENTS`:
- If arguments start with a number (e.g., "011"), this is an update or transition
- If arguments contain "list", show a summary of all open problems
- If arguments contain "work", run a **review** first (step 9), then begin working the highest-WSJF problem
- If arguments contain "review", run the review (step 9) only
- Otherwise, this is a new problem creation

### 2. For new problems: Check for duplicates FIRST

Before creating, search existing problems for similar issues. The user may not know a problem already exists.

1. Extract keywords from the description/title (e.g., "foul drawn", "checkpoint", "delete", "stuck saving")
2. Search all files in `docs/problems/` for those keywords using Grep
3. Read the title and status of each match
4. If matches are found, present them to the user via `AskUserQuestion`:
   - "I found existing problems that may be related: P011 (stuck saving, CLOSED), P023 (foul drawn garbled, OPEN). Would you like to: (a) Update an existing problem, (b) Create a new problem anyway, (c) Cancel?"
5. If the user chooses to update, switch to the update flow for that problem ID
6. If no matches found, proceed to create

**Search strategy**: Search problem filenames AND file content. A match on the filename (kebab-case title) or the Description/Symptoms sections counts. Cast a wide net — false positives are cheap (user chooses), but false negatives mean duplicate problems.

### 3. For new problems: Assign the next ID

Scan `docs/problems/` for existing files. Extract the highest numeric ID and increment by 1. Zero-pad to 3 digits.

```bash
ls docs/problems/*.md 2>/dev/null | sed 's/.*\///' | grep -oE '^[0-9]+' | sort -n | tail -1
```

### 4. For new problems: Gather information

If the arguments contain a description, extract what you can. For anything missing, use `AskUserQuestion` to gather:

- **Title**: Short kebab-case-friendly description
- **Description**: What is happening? What should happen instead?
- **Priority**: Impact (1-5) × Likelihood (1-5) per RISK-POLICY.md

Do NOT ask for fields that can be inferred:
- **Reported date**: Use today's date
- **Status**: Always "Open" for new problems
- **Symptoms**: Infer from description if possible
- **Workaround**: Default to "None identified yet." unless obvious from context

### 5. For new problems: Write the problem file

**File path**: `docs/problems/<NNN>-<kebab-case-title>.open.md`

**Template**:

```markdown
# Problem <NNN>: <Title>

**Status**: Open
**Reported**: <YYYY-MM-DD>
**Priority**: <score> (<label>) — Impact: <label> (<n>) x Likelihood: <label> (<n>)

## Description

<description>

## Symptoms

<bullet list of observable symptoms>

## Workaround

<workaround or "None identified yet.">

## Impact Assessment

- **Who is affected**: <personas>
- **Frequency**: <when/how often>
- **Severity**: <High/Medium/Low — reason>
- **Analytics**: <data source or N/A>

## Root Cause Analysis

### Investigation Tasks

- [ ] Investigate root cause
- [ ] Create reproduction test
- [ ] Create INVEST story for permanent fix

## Related

<links to related files, problems, ADRs>
```

### 6. For updates: Edit the existing file

Find the file matching the problem ID:
```bash
ls docs/problems/<NNN>-*.md 2>/dev/null
```

Apply the update — this could be:
- Adding root cause evidence to the "Root Cause Analysis" section
- Checking off investigation tasks
- Adding a "Fix Strategy" section
- Adding "Related" links
- Updating priority based on new information

### 7. For status transitions

**Open → Known Error** (rename file, update content):

Pre-flight checks before allowing transition:
- [ ] Root cause is documented (not just "Preliminary Hypothesis")
- [ ] At least one investigation task is checked off
- [ ] A reproduction test exists or is referenced
- [ ] A workaround is documented (even if "feature disabled")

If any check fails, report which checks failed and ask the user to address them before transitioning.

```bash
git mv docs/problems/<NNN>-<title>.open.md docs/problems/<NNN>-<title>.known-error.md
```

Update the "Status" field in the file to "Known Error".

**Closing** requires user verification in production — see "Closing problems" above. When the fix is released, add a `## Fix Released` section but keep as `.known-error.md`. Only close when the user confirms.

### 8. For list: Show summary

Read all `.open.md` and `.known-error.md` files in `docs/problems/`. Extract ID, title, priority, and status. Sort by priority (highest first). Display as a markdown table.

### 9. For review: Re-assess all open problems

This is a batch operation that reviews every open/known-error problem and updates it.

**Step 9a: Read the risk framework**

Read `RISK-POLICY.md` to get the current impact levels (1-5), likelihood levels (1-5), risk matrix, and label bands. These are the authoritative definitions — do not use outdated scales.

**Step 9b: For each open/known-error problem:**

1. Read the problem file
2. Read the codebase context — check if the problem's root cause has been investigated, if there are related fixes in git history, or if the problem is stale
3. **Re-assess Impact** (1-5) using the product-specific impact levels from RISK-POLICY.md. Ask: "If this problem occurs during a live game, what is the worst business consequence?"
4. **Re-assess Likelihood** (1-5) using the likelihood levels from RISK-POLICY.md. Ask: "Given the current codebase, how likely is this to affect the user?"
5. **Calculate Severity** = Impact × Likelihood
6. **Look up Label** from the risk matrix label bands
7. **Estimate Effort** (S/M/L) by reading the root cause analysis and fix strategy. Consider: how many files, how complex, does it need planning?
8. **Calculate WSJF** = (Severity × Status Multiplier) / Effort Divisor
9. **Update the Priority line** in the problem file if the score changed
10. **Auto-transition to Known Error**: If an open problem has confirmed root cause AND a workaround documented (even "feature disabled"), automatically transition it to known-error:
    - `git mv docs/problems/<NNN>-<title>.open.md docs/problems/<NNN>-<title>.known-error.md`
    - Update the Status field to "Known Error"
    - This happens automatically — do not ask the user

**Step 9c: Present summary**

After reviewing all problems, present a WSJF-ranked table:

| WSJF | ID | Title | Severity | Status | Effort | Notes |
|------|-----|-------|----------|--------|--------|-------|

Highlight:
- Problems whose priority changed (↑ or ↓)
- Problems that were auto-transitioned to known-error
- Problems that may be stale (reported > 2 weeks ago with no investigation progress)
- Problems that have been fixed but not closed (check git history for fix commits)
- Known errors with a `## Fix Released` section (pending user verification)

**Step 9d: Check for pending verifications**

For each known-error that has a `## Fix Released` section, use `AskUserQuestion` to ask the user if the fix has been verified in production. If the user confirms, close the problem (`git mv` to `.closed.md`, update Status). If the user says no or is unsure, leave it as known-error.

**Step 9e: Update files**

Edit each problem file where the priority changed. Do not commit — the user will commit when ready.

### 10. Quality checks

After creating or updating a problem file, verify:

- **ID uniqueness**: No duplicate IDs in `docs/problems/`
- **Naming convention**: File matches `<NNN>-<kebab-case>.<status>.md`
- **Required sections**: Description, Impact Assessment, and Investigation Tasks exist
- **Priority calculation**: Score = Impact × Likelihood, label matches score
- **No orphaned references**: If the problem references other problems by number, verify those files exist
- **Status consistency**: The Status field in the frontmatter matches the filename suffix

**Priority label mapping**: Read the label bands from `RISK-POLICY.md` — do not hardcode them here.

### 11. Report

After any operation, report:
- The file path created/modified
- The problem ID and title
- The current status
- Any quality check warnings

Do not commit. The user will commit when ready.

$ARGUMENTS
