---
name: risk-policy
description: Create or update the project's RISK-POLICY.md per ISO 31000 and the risk-scorer agent. Examines the project to derive business-specific impact levels.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Agent
---

# Risk Policy Generator

Create or update `RISK-POLICY.md` per ISO 31000, tailored to this project's business context. The risk-scorer agent reads this file to score pipeline actions (commit, push, release).

## What belongs in RISK-POLICY.md (single source of truth)

- **Risk appetite** -- the residual risk threshold for pipeline actions
- **Impact levels** -- business consequences of failure, specific to this product and its users
- **Likelihood levels** -- descriptions of how likely a risk is to materialise
- **Risk matrix** -- Impact × Likelihood score table and label bands (Low/Medium/High/Critical)
- **Last reviewed date** -- when the policy was last reviewed or updated

The risk-scorer agent, problem management skill, and any other process that needs to assess risk severity reads these definitions from RISK-POLICY.md.

## What does NOT belong in RISK-POLICY.md (lives in the risk-scorer agent)

- Assessment rules, back-pressure, control discovery (scoring mechanics)

## Steps

### 1. Read the risk-scorer agent contract

Read `.claude/agents/risk-scorer-pipeline.md` to understand what the scorer expects from `RISK-POLICY.md`. Extract:

- What fields the agent reads from the policy (look for "Read `RISK-POLICY.md`" in "Your Role")
- The impact level labels used in the agent's risk matrix (look for the "Product Reference Table")
- The label bands and their score ranges (look for "Label Bands")
- The gate threshold the agent uses (look for "risk appetite" references)

Use this contract to guide drafting. Do not hardcode assumptions about the number of levels, their labels, or the appetite threshold -- derive them from the agent definition.

### 2. Discover project context

Examine the project to understand what it does and who uses it. Adapt to the project type -- do not assume any particular framework or language.

**Find the project manifest** (first match wins):
- `package.json` (Node/JS/TS)
- `pyproject.toml` or `setup.py` (Python)
- `go.mod` (Go)
- `Cargo.toml` (Rust)
- `Gemfile` (Ruby)
- `pom.xml` or `build.gradle` (Java/Kotlin)

**Find the project description**:
- `README.md` or `README.*`
- The `description` field in the manifest
- A homepage or docs index

**Discover user-facing features** by scanning for:
- Route/endpoint definitions (scan for directories named `routes/`, `pages/`, `api/`, `handlers/`, `controllers/`, or grep for route decorators/annotations)
- UI entry points (`.html`, `.svelte`, `.tsx`, `.jsx`, `.vue`, `.astro` files)
- CLI commands or public API surface

**Discover infrastructure**:
- Deployment config (`Dockerfile`, `docker-compose.*`, `fly.toml`, `app.yaml`, `serverless.yml`, `*.tf`, cloud config)
- CI/CD workflows (`.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`)
- Database or storage config

Build a mental model of: what does this product do, who are its users, and what would hurt them?

**Check repository visibility**:
- Run `gh repo view --json isPrivate` or check for other visibility indicators
- If the repository is **public**, confidential business metrics (revenue, user counts, pricing, traffic volumes) must not appear in any committed file. Note this for step 5 — the policy must include a "Confidential Information" section and information disclosure must be covered in the impact levels.

### 3. Check for existing policy

If `RISK-POLICY.md` already exists, read it. Identify:

- Whether impact levels still reflect the current product (features may have been added/removed)
- Whether the risk appetite is still appropriate
- Whether the last reviewed date is stale (> 2 weeks)

### 4. Check for recent incidents

If `docs/problems/` exists, scan for open or known-error problems (files ending in `.open.md` or `.known-error.md`). For each:

- Read the problem to understand its business impact
- Consider whether the impact levels adequately cover this kind of failure
- Flag any gap (e.g., a problem caused data corruption but the impact levels don't mention data integrity)

If recent incidents suggest the impact levels need updating, note this for step 6 (user confirmation). ISO 31000 requires risk criteria to be reviewed after incidents, not just on a schedule.

### 5. Draft impact levels, likelihood levels, and risk matrix

**Impact levels** must describe **business consequences** (ISO 31000 context establishment), not categories of files changed. Each level answers: "What happens to users/business if this goes wrong?"

Use 5 levels (Negligible to Severe). Tailor descriptions to this specific product:

- **Negligible**: No user impact at all
- **Minor**: No user impact; only developer/build affected
- **Moderate**: Deployment/publishing disrupted; users can't get updates. For public repositories: confidential business metrics (revenue, user counts, pricing, traffic volumes) committed to the repository — an information disclosure requiring immediate remediation but not affecting service availability.
- **Significant**: User-facing features degraded or inaccessible
- **Severe**: Data integrity, trust, or availability destroyed

Reference specific product features, user workflows, and infrastructure by name. Generic descriptions like "application logic affected" are wrong -- say what breaks and for whom.

**Likelihood levels** describe how likely a risk is to materialise. Use 5 levels (Rare to Almost certain). These are universal — not product-specific:

- **Rare (1)**: Requires specific, unusual conditions. Extensive test coverage or architectural safeguards make occurrence very unlikely.
- **Unlikely (2)**: Could happen but controls (tests, CI gates, review hooks) significantly reduce probability.
- **Possible (3)**: Moderate complexity or limited test coverage. Could happen under normal conditions.
- **Likely (4)**: High complexity, many code paths, or limited controls. Expected to occur without intervention.
- **Almost certain (5)**: Known gap, no controls in place, or previously observed failure mode.

**Risk matrix**: Include the Impact × Likelihood multiplication table (5×5 = scores 1-25) and the label bands:

| Score Range | Label |
|-------------|-------|
| 1-4 | Low |
| 5-9 | Medium |
| 10-14 | High |
| 15-25 | Critical |

The risk matrix is used by both the **risk-scorer agent** (pipeline risk assessment) and the **problem management process** (problem severity via `/problem` skill).

### 6. Confirm with the user

You MUST use the AskUserQuestion tool (not plain text output) to collect user confirmation. Do not proceed to step 7 until you have received answers via AskUserQuestion.

Call AskUserQuestion with a single message that presents:

1. The drafted impact levels (as a table) and asks whether they accurately reflect what matters most
2. The risk appetite threshold -- present the label bands from the agent contract (step 1) and recommend a threshold based on project maturity. Ask the user to confirm or adjust. A prototype with no real users may tolerate higher risk than a production system with paying users or compliance requirements
3. Whether any business context is missing (e.g., compliance requirements, SLAs, user base size)

### 7. Validate draft with risk-scorer agent

Before writing the policy file, invoke the risk-scorer agent to validate the draft. This is the gate -- the enforce hook will only allow writes to RISK-POLICY.md after the scorer returns PASS.

Run the risk-scorer agent (subagent_type: "risk-scorer") with this prompt:

> Review this draft risk policy for ISO 31000 compliance. Validate it.
>
> [paste the full draft policy content here]

The risk-scorer will check:
- Impact levels describe business consequences (not file categories)
- Impact labels match the risk matrix (Negligible, Minor, Moderate, Significant, Severe)
- Risk appetite defines a numeric threshold
- Business context is present
- Last reviewed date is present

It ends its output with `RISK_VERDICT: PASS` or `RISK_VERDICT: FAIL`. The PostToolUse hook reads this from the agent output and sets the edit marker on PASS.

- **If PASS**: proceed to step 8 (write)
- **If FAIL**: fix the issues the scorer identified, then re-run this step

### 8. Write RISK-POLICY.md

Write the policy using the structure derived from the agent contract (step 1). The output must include:

- The ISO 31000 header and "Last reviewed" date (today's date)
- Business context section
- **Confidential Information section** (for public repositories): stating that business metrics must not appear in committed files, with examples of what is confidential and guidance to use generic descriptions instead
- The risk appetite threshold confirmed by the user in step 6
- The impact levels with project-specific descriptions from step 5
- The likelihood levels (universal 1-5 scale)
- The risk matrix (Impact × Likelihood table) and label bands
- A note that both the risk-scorer agent and problem management process reference this policy

## Updating an existing policy

When updating rather than creating:

- Preserve the existing risk appetite unless the user wants to change it
- Compare current impact levels against the current state of the project
- Flag levels that reference features or infrastructure that no longer exist
- Flag new features or infrastructure not covered by existing levels
- Update the "Last reviewed" date to today
- Show the user a diff of what changed

$ARGUMENTS
