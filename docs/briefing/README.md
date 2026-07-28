# Project Briefing

Migrated from legacy `docs/BRIEFING.md` via `/wr-retrospective:migrate-briefing` on 2026-07-26.

## Critical Points (Session-Start Surface)

Seeded manually 2026-07-26 (the `run-retro` skill has no bin shim in adopter repos — P049, upstream-blocked — and the Skill tool errors in AFK subprocesses). The next `/wr-retrospective:run-retro` signal-vs-noise pass should re-derive this list properly per ADR-040.

- **Production runs the v2 API (`addressr-server-2`) on OpenSearch, not the v1 API on Elasticsearch.** `client/elasticsearch.js` and every `ELASTIC_*` env var are historical names from before the fork. Read `what-you-need-to-know.md` before touching search or deploy paths.
- **External-comms gates are marker-hash-exact, and the commit gate hashes the LITERAL `-m` text from your bash command.** Write commit messages apostrophe-free and pass them as a single `-m`; never `-m "$(cat file)"`. Any edit after a reviewer PASS invalidates the marker, and the risk and voice-tone gates invalidate independently. Draft external prose em-dash-free — the voice-tone gate FAILs on em-dashes every time. Full detail in `what-will-surprise-you.md`; this family has cost round-trips on at least six occasions.
- **Edit-gate markers match a LITERAL verdict string and a LITERAL reviewer-prompt shape.** The external-comms commit gate needs a prompt starting `SURFACE: git-commit-message` with the message wrapped in `<draft>...</draft>`; the architect marker wants `**Architecture Review: PASS**` (an `ALIGNED (PASS)` heading leaves the gate closed — assert manually per the block text, and never upgrade a verdict via `SendMessage`); `wr-jtbd:agent` writes PASS/FAIL to `/tmp/jtbd-verdict`. Also: a commit spanning `docs/decisions/` and `docs/jtbd/` can deadlock the compendium-pairing gate — escape with the `RISK_BYPASS: architect-compendium-deferred` trailer, and expect it to invalidate any external-comms PASS you already hold. Detail in `what-will-surprise-you.md`.
- **`gh issue create --body-file` can never clear the external-comms gate** (it extracts an empty draft). Use the quoted-heredoc `--body "$(cat <<'EOF' ... EOF)"` form. Always inline the draft in the reviewer prompt — a `/tmp` path fails closed because the reviewer cannot read outside the working dir.
- **Boolean `workflow_dispatch` inputs must be compared UNQUOTED in `if:`.** `inputs.x == 'true'` silently never matches and the run goes GREEN with the gated step skipped.
- **A workflow gaining `workflow_call` must move `concurrency:` off `${{ github.workflow }}`** — in a callee that resolves to the CALLER's name, so caller and callee land in one group and deadlock.
- **Migrating OpenSearch? Read `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md` FIRST.** Two full blue/green runs are complete; sizing is empirical, re-measure rather than assume.
- **Never commit an absolute request or read count.** The external-comms gate treats traffic volumes as confidential disclosure, in commit messages and code comments alike. Describe soaks qualitatively. Dataset sizes and latency figures are fine.

## Topic Index

Decomposed by subject on 2026-07-28 (Tier-3 budget — the two original files exceeded 2× the per-file ceiling).

| File                                                                   | Subject                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [what-you-need-to-know.md](./what-you-need-to-know.md)                 | General project facts (API version, trunk-based dev, credentials, ADR index)  |
| [what-will-surprise-you.md](./what-will-surprise-you.md)               | Domain-data + API-shape surprises (G-NAF, OpenSearch naming, WayCharter)      |
| [opensearch-and-deploy-state.md](./opensearch-and-deploy-state.md)     | Current search topology, SigV4/health/cutover mechanics, migration playbook   |
| [markers-and-edit-gates.md](./markers-and-edit-gates.md)               | Architect / JTBD / oversight marker mechanics + recovery incantations         |
| [commit-time-gates.md](./commit-time-gates.md)                         | Compendium-pairing, README-refresh, RISK-POLICY gates + git-staging traps     |
| [external-comms-and-compendium.md](./external-comms-and-compendium.md) | External-comms / voice-tone commit gates + the decisions-compendium generator |
| [releases-and-ci.md](./releases-and-ci.md)                             | Changesets, workflow traps, the push guard, the risk-appetite commit gate     |
| [deploy-infra-and-caching.md](./deploy-infra-and-caching.md)           | EB deploys, Cloudflare/RapidAPI edge, HTTP caching, GHCR publishing           |
| [agent-and-workflow-patterns.md](./agent-and-workflow-patterns.md)     | Recurring assistant failure modes + ITIL workflow traps                       |
| [testing-tdd-and-code.md](./testing-tdd-and-code.md)                   | The TDD hook, test anti-patterns, ESM/babel quirks                            |

## Preamble

# Project Briefing

This file is injected into every Claude Code session. It contains institutional knowledge that isn't obvious from the code alone. Maintained by the `/retrospective` skill.
