# Project Briefing

Migrated from legacy `docs/BRIEFING.md` via `/wr-retrospective:migrate-briefing` on 2026-07-26.

## Critical Points (Session-Start Surface)

Re-derived 2026-08-09. Terse by design — 2 KB budget. See Curation rules below. Budget is the wr-retrospective plugin's ADR-040 Tier 1, not this repo's ADR-040.

- **Production is the v2 API on AWS-managed OpenSearch;** every `ELASTIC_*` name is historical. `what-you-need-to-know.md`.
- **External-comms gates hash the LITERAL draft from your command.** Use a heredoc, not escaped quotes or `--body-file`. Any edit after a PASS re-invalidates; risk and voice-tone invalidate independently. Draft em-dash-free. `external-comms-marker-mechanics.md`, `external-comms-content-rules.md`.
- **Edit-gate markers match literal verdict strings**, and a commit spanning `docs/decisions/` + `docs/jtbd/` can deadlock the compendium gate. `markers-and-edit-gates.md`, `commit-time-gates.md`.
- **`git add` must be its own Bash call.** A gate-denied `git add X && git commit` never runs the add, so the retry commits the wrong tree. Verify with `git show --stat HEAD` AND `git diff HEAD -- <files>`. `git-staging-and-agent-io.md`.
- **A green run on a dirty tree proves nothing for git-state-dependent tests.** The risk-register fence passes by construction while files are dirty and reddens on commit. Commit locally, re-run, then push. `testing-tdd-and-code.md`.
- **Never trust a pipeline summary line.** Both watchers reported success on a red master. Verify: `gh run view <id> --json jobs --jq '.jobs[] | "\(.conclusion)\t\(.name)"'`. `ci-observability-and-perf.md`.
- **Passing tests is not shipping.** The published artefact breaks in ways local tests cannot see — a moved Docker `CMD` path, a generated file a clean checkout lacks. Pack the tarball and start it. `babel-esm-and-toolchain.md`, `testing-tdd-and-code.md`.
- **A test that exists may never run**, and a note explaining why something is impossible is a hypothesis, not a finding. Mutation-test new tests. `cucumber-profiles-and-tags.md`, `agent-and-workflow-patterns.md`.
- **Never commit an absolute request or read count** — traffic volumes are confidential in commits and comments alike. Ratios only. `external-comms-content-rules.md`.

## Curation rules for Critical Points

**What earns a slot**, restated 2026-08-09 because the previous criterion was wrong: an entry belongs here when it is NOT mechanised by a named test AND not reachable in one hop from the Topic Index. The criterion used before was "exercised this session", which is biased against exactly the entries most worth keeping — a fail-green trap is under-observed by construction, because the thing that would make you notice it is the thing it suppresses.

Two entries were demoted on 2026-08-09 under the corrected rule: the boolean `workflow_dispatch` trap, because `release-workflow-deploy-only.test.mjs` reddens if anyone re-quotes it, and the OpenSearch migration playbook, because it is pull-based reference you consult knowingly. Both remain in their topic files.

**The section runs over the 2 KB budget, deliberately.** Getting under would mean deleting a live trap to recover a few dozen tokens, which optimises the proxy over the thing it stands for. No byte figure is recorded: on 2026-08-09 two attempts to note one both shipped a wrong number, because a measurement asserted inside its own measurand is re-falsified by the edit that writes it. Nothing in this repo computes the figure; the criterion below governs, not a cardinal.

## Topic Index

Decomposed by subject 2026-07-28; rotated 2026-08-02 and again 2026-08-04 (Tier-3 budget — four new files split off on subtopic boundaries).

| File                                                                       | Subject                                                                             |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [what-you-need-to-know.md](./what-you-need-to-know.md)                     | General project facts (API version, trunk-based dev, credentials, ADR index)        |
| [what-will-surprise-you.md](./what-will-surprise-you.md)                   | Domain-data + API-shape surprises (G-NAF, OpenSearch naming, WayCharter)            |
| [opensearch-and-deploy-state.md](./opensearch-and-deploy-state.md)         | Search topology, backends, sizing, the migration playbook                           |
| [cutover-mechanics.md](./cutover-mechanics.md)                             | What must happen for a cutover/rollback to take effect, and how each step lies      |
| [search-relevance-and-scoring.md](./search-relevance-and-scoring.md)       | BM25 / analyzer internals behind ranking; reading the evidence correctly            |
| [markers-and-edit-gates.md](./markers-and-edit-gates.md)                   | Architect / JTBD edit-gate verdict + prompt literal-matching mechanics              |
| [oversight-markers.md](./oversight-markers.md)                             | The `human-oversight: confirmed` evidence gate and its resumed-session trap         |
| [commit-time-gates.md](./commit-time-gates.md)                             | Compendium-pairing, README-refresh, RISK-POLICY gates + git-staging traps           |
| [external-comms-marker-mechanics.md](./external-comms-marker-mechanics.md) | How the external-comms gate derives and matches its marker                          |
| [gate-command-detection.md](./gate-command-detection.md)                   | How gates detect governed commands: what slips past, what falsely trips             |
| [external-comms-content-rules.md](./external-comms-content-rules.md)       | What the gate rejects on content: em-dashes, absolute traffic counts                |
| [decisions-compendium.md](./decisions-compendium.md)                       | How `docs/decisions/README.md` is generated and why not to run it by hand           |
| [releases-and-ci.md](./releases-and-ci.md)                                 | Workflow traps (boolean inputs, concurrency, k6) and dependency freshness           |
| [changesets-and-release-flow.md](./changesets-and-release-flow.md)         | Changesets, the two manual approvals, the `published` gate, `release:watch`         |
| [push-guard-and-risk-gate.md](./push-guard-and-risk-gate.md)               | Red-master push guard and risk-scorer commit-gate behaviour at appetite             |
| [deploy-infra-and-caching.md](./deploy-infra-and-caching.md)               | EB deploys, Cloudflare/RapidAPI edge, HTTP caching, GHCR publishing                 |
| [agent-and-workflow-patterns.md](./agent-and-workflow-patterns.md)         | Recurring assistant failure modes                                                   |
| [itil-workflow-traps.md](./itil-workflow-traps.md)                         | Problem/ADR lifecycle traps: anchoring, README drift, Confirmation wording          |
| [testing-tdd-and-code.md](./testing-tdd-and-code.md)                       | The TDD hook, test anti-patterns, evidence discipline for git-state-dependent tests |
| [babel-esm-and-toolchain.md](./babel-esm-and-toolchain.md)                 | Babel/ESM transpilation, the real vs declared Node floors, lockfile traps           |
| [cucumber-profiles-and-tags.md](./cucumber-profiles-and-tags.md)           | How profiles select scenarios, and how a feature can run never                      |
| [ci-observability-and-perf.md](./ci-observability-and-perf.md)             | Whether the pipeline is telling the truth; what the k6 harness can resolve          |
| [git-staging-and-agent-io.md](./git-staging-and-agent-io.md)               | How commits lose content; literal shapes agent/hook plumbing expects                |
