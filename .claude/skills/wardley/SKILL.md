---
name: wardley
description: Generate or update the project's Wardley Map by analyzing the codebase. Produces an OWM source file, SVG, and PNG.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Wardley Map Generator

Analyze the codebase and generate a Wardley Map of the project's value chain.

## Output files

- `docs/wardley-map.owm` (OWM source)
- `docs/wardley-map.svg` (rendered SVG)
- `docs/wardley-map.png` (rendered PNG)
- `docs/wardley-map.md` (analysis with embedded map image)

## Steps

### 1. Discover the user need

Read the project's README, homepage, main entry point, or package description to determine what need the project serves. The anchor must be a specific need, not a person. "Software delivery insight" not "Reader". "Real-time cricket stats" not "User". The anchor should distinguish this project from others.

**Self-test:** If two different projects could share this anchor, it is too generic. The anchor should answer "what does someone come to this project to get?" not "what topic does this project cover?"

**Need vs means:** The anchor should be an outcome the user *has* after they leave, not a capability the provider *offers*. If the anchor sounds like a service description (expertise, guidance, consulting), rewrite it as the result: "AI Delivery Expertise" becomes "Reliable AI-Built Software." "Analytics consulting" becomes "Data-driven decisions."

### 2. Inventory the codebase

Scan the project to identify components. Look for:

- **User-facing outputs**: UI, API endpoints, CLI commands, reports, pages
- **Content or data**: authored content, databases, data pipelines, models
- **Processing logic**: custom business logic, transformation pipelines, plugins
- **Quality enforcement**: testing, linting, review gates, compliance checks
- **Infrastructure**: hosting, CI/CD, build tools, deployment, monitoring
- **Dependencies**: frameworks, libraries, external services

Adapt the scan to the project type. A web app has pages and components. An API has endpoints and middleware. A CLI has commands and parsers. A library has modules and public API surface.

**Platform dependencies:** For each custom or genesis component, identify which platform or API it depends on that the project does not control. If that platform does not appear in the inventory, add it as a component.

### 3. Classify evolution

For each component, determine its evolution stage:

| Stage | Evolution (x) | Characteristics |
|-------|--------------|-----------------|
| Genesis | 0.00 to 0.17 | Novel, no off-the-shelf equivalent, high uncertainty |
| Custom-Built | 0.17 to 0.37 | Understood but bespoke, built for this project |
| Product | 0.37 to 0.63 | Standardised, configurable, multiple providers exist |
| Commodity | 0.63 to 1.00 | Utility, interchangeable, barely noticed when working |

### 4. Position on value chain

Visibility (y-axis): 1.0 = directly serves the user need, 0.0 = deep infrastructure the user never thinks about.

**Visibility reality check:** For each component, ask: "Does the user directly interact with this or see its output?" If yes (login screens, dashboards, error messages), visibility should be above 0.5 even if the component feels like infrastructure. Auth systems the user sees should not be positioned like databases the user never sees.

### 5. Decide what to split and merge

Aim for 8 to 12 components. Rules:

- **Split** when two things have different evolution positions (one custom, one commodity) or different strategic roles (one differentiates, one is plumbing).
- **Merge** when two things are at the same evolution stage and serve the same strategic purpose. **Test:** can you invest in A independently of B? If not, they are one component.
- Every component should earn its place. If removing it from the map loses no information, remove it.

**Hidden-but-critical check:** Look for components that are invisible to the user but gate or constrain visible components. CI/CD pipelines, compliance gates, and release processes may have low visibility but high strategic impact. If such a component can block a release or degrade quality, consider whether it needs a dependency link to the component it constrains — not just to the infrastructure it uses.

### 6. Identify evolution movement

For each component, ask: is this evolving? Signs of evolution:

- You are writing articles about it (moving from Genesis toward Custom-Built)
- Multiple projects now use the same pattern (moving toward Product)
- An off-the-shelf alternative has emerged (moving toward Commodity)
- You are considering replacing a custom solution with a standard one

Add `evolve` annotations for components that are actively moving.

**Inertia check:** For commodity components, note switching cost (high or low). For custom components, note whether competitors or the ecosystem are building similar things. Use these observations in the Risk section of the analysis.

### 7. Map dependencies

A->B means "A needs B to function." Not "A influences B" or "A produces B." Only draw links that represent real runtime or build-time dependencies. Fewer lines with clear meaning beats many lines that add noise.

**User-facing pair check:** For every pair of components with visibility above 0.7, ask: does one need the other to get traffic, data, or users? If articles drive traffic that service pages convert, that is a dependency even though both connect to the anchor.

### 8. Generate the OWM file

Write `docs/wardley-map.owm` using OWM syntax:

```
title Project Value Chain

anchor User Need [0.95, 0.55]

component Name [visibility, evolution]

evolve Component Name 0.45

From->To
```

### 9. Render

```bash
node ${CLAUDE_SKILL_DIR}/owm-to-svg.mjs
```

### 10. Verify

Read the generated PNG and check:

- No overlapping labels
- Dependencies flow logically
- Evolution positions match the phase boundaries
- Evolution arrows show meaningful movement
- The map tells a coherent story: where is the differentiation? What is evolving? What is commodity?

If the map has issues, adjust positions in the OWM file and re-render.

**Orphan check:** Look for components with only one inbound link and no outbound links. For each orphan, choose one:
1. Add a missing dependency that justifies it (e.g., a gate component should link to what it gates, not just what it reads from).
2. Remove it if it adds no strategic information.
Do not leave orphans unexplained — they confuse readers into thinking the component is disconnected from the value chain.

**Domain context check:** Can a reader unfamiliar with the domain understand *why* the anchor is hard to serve? If the challenge is non-obvious (real-time constraints, hostile environments, regulatory pressure), add a one-line OWM comment (`// context: ...`) above the anchor explaining the constraint. This comment will not render but documents intent for future updates.

### 11. Write the analysis

Write `docs/wardley-map.md` with the following structure:

```markdown
# Wardley Map

![Wardley Map](wardley-map.png)

## Analysis

### Differentiation
(Which components are custom/genesis? These are the competitive advantage. If multiple components depend on the same custom component, note that convergence is also concentration risk. State what would happen if that component became untenable.)

### Evolution
(What is moving? In which direction? What does that mean for investment? Check whether any evolving component has dependents that amplify its impact. If A depends on B and B is evolving, investment in B has a multiplier effect. Name the multiplier.)

### Risk
(Which custom components could be replaced by commodities? Which commodities could change?)

### Decisions
(Does the map surface any strategic choices the project should make?)
```

The image path should be relative to `docs/` since the PNG lives in the same directory. Keep the analysis concise and actionable. Each section should be 2 to 4 sentences.

**Analysis quality rules:**

- **No inventory.** Do not list component counts, script counts, or file counts. State what the position *means* for investment, risk, or action.
- **Name the phase correctly.** When describing a component's current position, use the phase name matching its current evolution value, not its evolve target. Check against the phase boundary table.
- **Risk needs triggers.** For each risk, name what would cause it (the trigger) and what breaks (the consequence). "Low risk" is not analysis.
- **At most two decisions.** The Decisions section should identify at most two strategic choices and state them as trade-offs. If two actions compete for the same resource, say so. Do not write a shopping list.
- **State evidence for recommendations.** If you recommend an action (e.g. "ready to be packaged"), say what evidence supports it and what would need to be true first.
- **End with implications.** Every section must end with a sentence stating what the project owner should do differently, protect, or watch as a result. Description without implication is not analysis.
- **Include internal risk.** The Risk section must include at least one risk the project owner controls, such as underinvestment in a differentiating component. External risks (API changes, pricing shifts) are not sufficient alone. Internal risk triggers must include a number and a time window. "Output drops" is not a trigger. "Fewer than N per month for M consecutive months" is.
- **Observable triggers.** Each decision's trigger must be observable and specific: a number, an event, or a condition you could check. "When external interest validates" is not observable. "When three people outside this project ask to reuse the pattern" is. Each decision should have both a go trigger (what would make you act) and a reassess trigger (what would make you reconsider the strategy if the go trigger never fires).
- **Cover visible dependencies.** Every dependency between components with visibility above 0.7 must be mentioned in the analysis. If a link appears on the map but not in the text, either remove the link or explain why it matters.
- **Cover all custom components in Differentiation.** Every component in the custom-built or genesis phase must appear in the Differentiation section. Do not highlight some custom components while silently omitting others. If a custom component has fragile internals (non-standard APIs, complex state, platform-specific workarounds), name that fragility.
- **Cover commodity risk.** The Risk section must include at least one commodity-layer risk (pricing changes, service discontinuation, API deprecation). State the trigger, the affected components, and the fallback. Do not treat commodities as zero-risk simply because they are interchangeable today.
- **Triggers must be measurable today.** Each trigger must be something you can check with tools or data the project already has. If the trigger requires building new infrastructure to measure (a test suite that does not exist, a monitoring system not yet deployed), say so explicitly and name the prerequisite. A trigger you cannot currently observe is a hypothesis, not a trigger.
- **No project-specific names in decisions.** Decision triggers and reassess triggers must be stated generically. Do not name specific external projects, people, or organisations. Use descriptions like "a second project" or "an external adopter" instead of proper nouns. The analysis should remain valid if read by someone outside the immediate team.

## Updating an existing map

If `docs/wardley-map.owm` already exists, read it first. Compare against the current codebase:

- Add components for things that have been added to the project
- Remove components for things that no longer exist
- Adjust evolution positions for things that have matured
- Add or update `evolve` arrows for things in motion
- Preserve the user's positioning choices where the codebase has not changed
