# Decision Management Process

## Overview

This document defines how architectural and technical decisions are documented, managed, and evolved in projects using Claude Code's autonomous development approach. Decisions are living documents that capture significant choices, their context, and rationale using the MADR 4.0 (Markdown Any Decision Records) format.

## Core Principles

### 1. Innovation vs. Standardization Balance

Decisions represent standards that provide consistency while allowing innovation. The system should:

- Generate standards that teams follow
- Keep standards healthy and fresh through natural evolution
- Focus on the health of the decision-making system, not rigid enforcement
- Think of decision management as cultivation, not control

### 2. Decision Lifecycle Philosophy

**From the standards cultivation approach:**

- **Anyone can propose decisions** - In autonomous mode, Claude Code proposes decisions; in interactive mode, users propose decisions
- **Non-subjective criteria** - Decisions must be objective and measurable where possible
- **Easy to follow** - Decisions should be clear and actionable
- **Succinct titles** - Title should summarize the decision (e.g., "Use TypeScript for type safety" not "Programming language choice")
- **Document alternatives** - List options considered and explain why the chosen option was selected (critical for later deprecation)
- **List superseded decisions** - New decisions explicitly state what they deprecate
- **Reassessment criteria** - Include conditions that suggest when to reassess and possibly deprecate the decision

### 3. Natural Evolution

- **Endorse through production validation** - Decisions move from `proposed` to `accepted` only after successful production implementation
- **Graceful deprecation** - Old decisions are deprecated (not deleted) when better alternatives emerge
- **No retroactive enforcement** - Accepted decisions don't require updating all existing code - they apply to new implementations
- **Experimentation encouraged** - Teams can deviate with good reason, and successful experiments can become new proposed decisions
- **Periodic review** - System should prompt reassessment based on decision criteria and production experience

## Decision Statuses

Decisions progress through statuses reflected in the filename:

### Status Definitions

- **`proposed`** - New decision awaiting production validation
  - Filename: `NNN-decision-title.proposed.md`
  - Can be used in new implementations
  - Requires production implementation with positive track record before acceptance
  - May have competing proposed alternatives

- **`accepted`** - Decision validated through production use
  - Filename: `NNN-decision-title.accepted.md`
  - Must be followed in new implementations (unless exempted)
  - Has demonstrated success in production
  - Remains active until deprecated or superseded

- **`rejected`** - Decision evaluated and determined not suitable
  - Filename: `NNN-decision-title.rejected.md`
  - Should not be used in implementations
  - Captures why the decision was rejected to prevent re-proposing
  - Preserved for institutional knowledge

- **`deprecated`** - Decision no longer recommended but not yet superseded
  - Filename: `NNN-decision-title.deprecated.md`
  - Should not be used for new implementations
  - May still be in use in existing code
  - Usually indicates gradual phase-out without specific replacement

- **`superseded`** - Decision replaced by a newer decision
  - Filename: `NNN-decision-title.superseded.md`
  - File updated with "Superseded by" note referencing new decision
  - Should not be used for new implementations
  - Preserved for historical context and traceability

### Status Transitions

```
proposed → accepted (after production validation)
proposed → rejected (after evaluation determines unsuitability)
accepted → deprecated (when phasing out without specific replacement)
accepted → superseded (when replaced by newer decision)
deprecated → superseded (when specific replacement identified)
```

## Decision Structure

All decisions follow the MADR 4.0 format with Claude Code-specific extensions:

### Required Frontmatter

```yaml
---
status: 'proposed|accepted|rejected|deprecated|superseded'
human-oversight: 'confirmed|unconfirmed'
oversight-date: YYYY-MM-DD
date: YYYY-MM-DD
reassessment-date: YYYY-MM-DD
decision-makers: [list of makers]
consulted: [list of consulted resources/people]
informed: [list of informed parties]
---
```

**`human-oversight` is the ratification axis and is independent of `status`.** `status` records how far a decision has progressed toward production validation; `human-oversight` records whether a human ratified its substance, and `oversight-date` records when. The two move separately, and a decision can be ratified long before it is promoted — **counted 2026-08-09: 17 of the 38 in-force decisions are `proposed` and every one carries a confirmed marker**, several of them running in production (the OpenSearch SigV4 auth model since July; the native-ESM migration since v3.1.0). Dated because it is a claim about a moving corpus: promoting any single decision moves the 17 without moving the 38, which is the drift direction least likely to be noticed. Recount rather than quote it.

The field is **three-valued**: `confirmed`, `unconfirmed`, and **absent**. Absence is a distinct state, not a default — treat anything other than `confirmed` as not-ratified. New decisions must carry the key explicitly rather than omitting it. Write the pair adjacent and replace in place when updating; inserting a second copy mints a duplicate YAML key, which the frontmatter parser rejects.

`reassessment-date` schedules the periodic review below. It was carried by most decisions and specified here by nobody until 2026-08-09 — the same omission as `human-oversight`, one key over, and found the same way: by reading the corpus rather than the document.

### Required Sections

1. **Title** - Succinct summary of the decision
2. **Context and Problem Statement** - What problem does this solve?
3. **Decision Drivers** - Factors influencing the decision
4. **Considered Options** - All alternatives evaluated
5. **Decision Outcome** - Chosen option and why
6. **Consequences** - Good, neutral, and bad outcomes
7. **Confirmation** - How to verify implementation compliance
8. **Pros and Cons of the Options** - Detailed comparison

### Voder-Specific Sections

9. **Reassessment Criteria** (recommended) - When to review this decision
   - Time-based: "Review after 12 months"
   - Event-based: "When TypeScript 6.0 is released"
   - Metric-based: "If build time exceeds 5 minutes"
   - Technology-based: "When alternative frameworks reach 1.0"

10. **Supersedes** (if applicable) - List of decisions this deprecates
    - Format: `NNN-old-decision-title`

11. **Superseded By** (when superseded) - Reference to replacing decision
    - Format: `NNN-new-decision-title`
    - Date of supersession

## File Organization

### Naming Convention

```
NNN-decision-title-in-kebab-case.STATUS.md
```

- **NNN**: Three-digit sequential number (001, 002, 003, etc.)
- **decision-title**: Kebab-case descriptive title
- **STATUS**: One of: proposed, accepted, rejected, deprecated, superseded

### Directory Structure

```
docs/
  decisions/
    001-use-typescript.accepted.md
    002-use-express.proposed.md
    003-use-commonjs.superseded.md
    004-use-esm.accepted.md
    README.md  # Index of decisions
```

## Decision Creation

### Manual Creation (Interactive Mode)

When a user works with Claude Code via Copilot or Cursor:

1. User invokes `create-decision` prompt
2. Voder asks discovery questions one at a time
3. User responds to each question
4. Voder creates decision in `proposed` status
5. If decision conflicts with existing decision, Claude Code asks user how to proceed

### Autonomous Creation (Voder Mode)

When Claude Code runs autonomously:

1. Voder identifies need for decision during implementation
2. Voder creates decision document in `proposed` status
3. If decision conflicts with existing decision:
   - Voder creates new decision that supersedes old decision
   - Voder updates old decision with "Superseded by" note
   - Voder renames old decision file to `.superseded.md`

### Discovery Questions for New Decisions

When creating decisions, gather:

1. **Problem Context**: What specific problem or choice needs a decision?
2. **Scope**: What part of the system does this affect? (architecture, tooling, process, etc.)
3. **Options**: What alternatives exist? (minimum 2, ideally 3-5)
4. **Criteria**: What factors matter most? (performance, maintainability, cost, etc.)
5. **Production Evidence**: Has any option been tried? With what results?
6. **Constraints**: Any technical, business, or regulatory constraints?
7. **Reassessment**: What would trigger reconsidering this decision?

## Decision Validation and Promotion

### Proposed → Accepted

A decision moves to `accepted` status when:

1. It has been implemented in production code
2. Implementation has positive track record (define timeframe/success criteria)
3. No major issues or blockers identified
4. Team/Claude Code validates successful production use

**Process:**

1. Rename file from `.proposed.md` to `.accepted.md`
2. Update status in frontmatter to `accepted`
3. Add production validation evidence to decision
4. Deprecate any decisions it explicitly supersedes

### Proposed → Rejected

A decision moves to `rejected` status when:

1. Evaluation determines it's not suitable
2. Better alternative identified
3. Technical or business constraints prevent adoption
4. Production trial fails

**Process:**

1. Rename file from `.proposed.md` to `.rejected.md`
2. Update status in frontmatter to `rejected`
3. Document specific reasons for rejection
4. Preserve decision for institutional knowledge

## Decision Amendment, Deprecation and Supersession

Three treatments, ordered by scope: amending a claim inside a decision, replacing a decision with another, and retiring one with nothing in its place. Amendment comes first because it is by far the most frequently exercised of the three.

### Amending a Decision in Place: Retain-as-History vs Rewrite-in-Place

Most corrections are smaller than a supersession — a Confirmation criterion naming a command that no longer exists, a count that has drifted, a justification whose premise expired. Two treatments are available, and the boundary between them is a **lifecycle condition, not a matter of taste**:

| Treatment             | When                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rewrite in place**  | The decision is still being iterated: not ratified, or ratified and not yet implemented. Also all working material — code comments, notes on an unshipped proposal, drafts. |
| **Retain as history** | **REQUIRED** once the decision is ratified **AND** implemented in production. Quote the superseded wording verbatim, date it, and say what replaced it.                     |

Both conditions must hold for retention to be required. Ratified-but-unimplemented is still being iterated; implemented-but-unratified has nothing to preserve yet. **When in doubt, retain** — retention costs a sentence, and a silent rewrite is irreversible in the surface that matters.

**"Ratified" means the `human-oversight: confirmed` marker, NOT `status: accepted`.** The two axes are orthogonal (see Required Frontmatter above) and conflating them gets the scope wrong in the direction that matters: a `proposed` decision carrying a confirmed marker and running in production is fully in scope. A `status`-keyed rule would exempt the `proposed`-but-ratified population — 17 of 38 as counted above — including the production OpenSearch auth model and the native-ESM migration, which shipped in v3.1.0 and is `proposed` still.

That is not a drafting accident on this rule's part. Status Definitions and the Proposed → Accepted criteria above describe `accepted` as validated through production use, which if reliably exercised would collapse this trigger into `status: accepted`. Promotion is exercised sometimes and not dependably — **as of 2026-08-09** — so `status` under-reports what is actually running. This rule is keyed on the marker to route around that; the promotion-discipline gap is real and is a separate matter.

**Why retention, and why this trigger.** A shipped decision's record IS the audit trail — editing it so it reads as though it always said the right thing removes the evidence that it did not, and that evidence is the reason the record exists rather than the code alone. The sharper reason is what the marker attests to: `human-oversight: confirmed` attests to the substance **as it stood at `oversight-date`**, and an amendment afterwards neither re-runs the ratification nor clears the marker. A silent rewrite therefore makes the marker attest to text no human ever saw, quietly, with nothing able to detect it. Retention is what keeps the marker honest — which is why the field that records ratification is the field that scopes when the record freezes.

This also extends a principle the document already holds. Old decisions are deprecated, not deleted (Decision Lifecycle Philosophy); the Superseding Process below prescribes retain-as-history at file level — keep the file, mark it, date it, give a reason. This is the same shape at sub-file granularity.

**The rejected alternative: "git history is the audit trail, so rewrite freely."** It loses because git history is a different artefact with a different audience. A reader of a decision does not run `git log -p` on it, and a squashed or rewritten history carries no obligation to preserve prose. The audit trail has to be legible in the artefact being audited.

**Do not delete a superseded claim on the grounds that a false string stays greppable.** That argument is real and belongs to working material — a class-sweep whose instrument is a bare-token grep is defeated by quoting the very strings it hunts. The resolution is surface-specific rather than global: delete in the code comments, retain in the decision record. Where a sweep enumerates its surviving hits, quoted history in a decision record belongs in that enumeration as an excluded class.

**Scope limits.**

- **The generated compendium is out of scope.** `docs/decisions/README.md` is derived and is rewritten in place by definition; retain-as-history binds the per-decision body only. Do not hand-edit the compendium to preserve history — the standalone generator is destructive there.
- **Not retroactive.** This binds future amendments. Historic silent rewrites are not to be reconstructed: guessing at wording that can no longer be recovered manufactures a false audit trail, which is worse than an absent one.
- **"Implemented in production" is a judgement, not a mechanical check**, and inventing one would be its own defect. The evidence rule: a decision counts as implemented when its Confirmation criteria have been discharged against production, or the change is in a released version, or a runbook names it as live.

Recorded 2026-08-09 on maintainer direction, after two same-day corrections to shipped decisions got it backwards — one described the superseded wording instead of quoting it, and one changed a Confirmation criterion's command with no note at all. A `status`-keyed trigger would have caught only the first, and the one it missed is the one where the rewrite was fully silent. Both were corrected by a follow-up commit quoting what the first deleted, which is the shape this rule requires of itself.

### Natural Deprecation Flow

```
Someone wants to try alternative approach
  ↓
Request deviation (in interactive mode) or Claude Code creates experiment (autonomous)
  ↓
Implement and track results
  ↓
If successful: Propose new decision
  ↓
New decision explicitly lists what it supersedes
  ↓
When new decision is accepted: Update old decision as superseded
```

### Superseding Process

When decision NNN is superseded by decision MMM:

1. **Create new decision** (MMM) with:

   ```yaml
   supersedes: [NNN-old-decision-title]
   ```

2. **Update old decision** (NNN):
   - Rename file to `.superseded.md`
   - Update frontmatter status to `superseded`
   - Add section at top:
     ```markdown
     ## Superseded

     This decision has been superseded by [MMM-new-decision-title](./MMM-new-decision-title.accepted.md) on YYYY-MM-DD.

     Reason: [Brief explanation]

     ---
     ```

3. **Update decision index** (README.md) to reflect new status

### Deprecation Without Replacement

When decision NNN is deprecated without specific replacement:

1. Rename file to `.deprecated.md`
2. Update frontmatter status to `deprecated`
3. Add deprecation note explaining why
4. Update decision index

## Exemptions and Experimentation

### Requesting Exemptions (Interactive Mode)

Users can request exemptions to use different approaches:

1. Provide non-trivial reason for deviation
2. Commit to reporting results
3. If successful, propose new decision

### Autonomous Experimentation (Voder Mode)

Voder can deviate from accepted decisions when:

1. Clear technical or contextual reason exists
2. Experimentation is documented in decision log
3. Results are tracked for potential new decision proposal

## Periodic Review

### Review Triggers

Decisions should be reviewed when:

1. **Time-based**: Reassessment criteria date reached
2. **Technology-based**: New versions or alternatives available
3. **Metric-based**: Performance/quality metrics change significantly
4. **Problem-based**: Recurring issues suggest decision may need revision
5. **Request-based**: Team or Claude Code identifies need for review

### Review Process

1. Assess if decision still solves the original problem
2. Evaluate if better alternatives now exist
3. Check if consequences have changed
4. Determine if reassessment criteria are still valid
5. Decide: keep accepted, propose alternative, or deprecate

## Integration with Development Workflow

### When to Create Decisions

Create decisions when making choices about:

- **Architecture**: System structure, component organization, design patterns
- **Technology**: Languages, frameworks, libraries, tools
- **Process**: Development workflows, quality gates, deployment strategies
- **Standards**: Coding conventions, naming patterns, file organization
- **Infrastructure**: Hosting, databases, third-party services

### When NOT to Create Decisions

Don't create decisions for:

- **Temporary choices**: One-off implementation details
- **Obvious choices**: Decisions with only one viable option
- **Reversible choices**: Easy to change without significant impact
- **Local choices**: Decisions that only affect a single component or file

## Decision Index Maintenance

Maintain `docs/decisions/README.md` with:

1. **Active Decisions** - List of accepted decisions
2. **Proposed Decisions** - List of decisions under consideration
3. **Superseded/Deprecated** - Historical decisions (collapsed/expandable)
4. **Rejected** - Decisions not adopted (collapsed/expandable)

Format:

```markdown
# Decision Index

## Active Decisions

- [001 - Use TypeScript](./001-use-typescript.accepted.md)
- [004 - Use ESM](./004-use-esm.accepted.md)

## Proposed Decisions

- [002 - Use Express](./002-use-express.proposed.md)

<details>
<summary>Superseded Decisions</summary>

- [003 - Use CommonJS](./003-use-commonjs.superseded.md) - Superseded by 004

</details>

<details>
<summary>Rejected Decisions</summary>

- [005 - Use Flow](./005-use-flow.rejected.md)

</details>
```

## Decision Traceability

### Linking Decisions to Code

Code should reference relevant decisions:

```javascript
// @decision 001-use-typescript - Type safety for API contracts
export interface UserResponse {
  id: string;
  name: string;
}
```

### Linking Decisions to Stories

Stories should reference decisions that influenced implementation:

```markdown
## Related Decisions

- [001 - Use TypeScript](../../decisions/001-use-typescript.accepted.md)
- [004 - Use ESM](../../decisions/004-use-esm.accepted.md)
```

### Citing External Decision Records

The Windy Road plugins keep their own decision records, numbered from 001 in their own corpora. Those numbers **collide with this repo's** — a bare `ADR-042` or `ADR-056` in our prose points at a slot that either holds something unrelated or does not exist here at all. A reader following the reference finds nothing and cannot tell whether the citation is stale or the file is missing.

Qualify every external ADR with its owning plugin, in bold:

```markdown
Per **wr-risk-scorer ADR-042 Rule 1**, remediations auto-apply until residual is within appetite.
```

Not `ADR-042`, and not `` `wr-risk-scorer` ADR-042 `` — bold, plugin name first. Where the collision is live rather than merely possible, say so:

> **wr-architect ADR-026** — plugin-scoped. This repo's ADR-026 is Range-Number Address Expansion, an unrelated search-ranking decision.

Two reasons this is worth the keystrokes. The hook-generated `docs/decisions/README.md` compendium harvests inline `ADR-NNN` mentions into each entry's `**Related:**` line, so an unqualified external citation becomes a dangling intra-repo edge in the relationship graph architect review actually loads. And it has already bitten twice — `ADR-042` in ADR-037 and `ADR-056` across the risk register — which is why this is written down rather than left to judgement.

This is a citation style rule, not an architectural trade-off, so it lives here rather than consuming an ADR slot of its own.

## Tools and Automation

### Voder's Role

Voder assists with decision management by:

1. **Detecting decision needs** during autonomous development
2. **Creating decision documents** following MADR 4.0 format
3. **Identifying conflicts** with existing decisions
4. **Proposing supersession** when better alternatives emerge
5. **Tracking reassessment criteria** and prompting reviews
6. **Maintaining decision index** as decisions evolve
7. **Enforcing decision compliance** in new implementations

### Human's Role

Humans provide:

1. **Strategic judgment** on high-impact decisions
2. **Business context** that Claude Code may not have
3. **Approval** for superseding critical decisions
4. **Exemption requests** with rationale
5. **Production feedback** on decision outcomes

## Benefits

This decision management approach provides:

1. **Institutional Knowledge** - Captures why decisions were made
2. **Evolution Over Time** - Decisions can naturally improve
3. **Innovation Balance** - Standards exist but experimentation is encouraged
4. **Traceability** - Code links back to decision rationale
5. **Learning** - Rejected decisions prevent repeated mistakes
6. **Flexibility** - Exemptions allow context-specific choices
7. **Quality** - Decisions validated through production use
8. **Autonomy** - Voder can make and evolve decisions autonomously
9. **Transparency** - Clear process for how decisions change

## Related Processes

- **User Story Management** - Stories reference relevant decisions
- **Problem Management** - Problems may trigger decision reviews
- **Code Quality** - Decisions define quality standards
- **Testing Strategy** - Decisions guide testing approaches
