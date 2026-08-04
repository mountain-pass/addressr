# Project Briefing

Migrated from legacy `docs/BRIEFING.md` via `/wr-retrospective:migrate-briefing` on 2026-07-26.

## Critical Points (Session-Start Surface)

Re-derived 2026-08-04 by the signal-vs-noise pass. Terse by design (ADR-040 Tier 1, 2 KB) — each line names the trap and the topic file that explains it.

- **Production is the v2 API on AWS-managed OpenSearch.** Every `ELASTIC_*` name is historical. Read `what-you-need-to-know.md` before touching search or deploy.
- **External-comms gates hash the LITERAL draft from your command.** Use `-m "$(cat <<'EOF' ... EOF)"` — the extractor tries heredoc first and matches it literally. Escaped quotes inside `-m "..."` truncate the capture; `--body-file` extracts an empty draft and can never clear. Any edit after a PASS re-invalidates, and risk/voice-tone invalidate independently. Draft em-dash-free. `external-comms-marker-mechanics.md`.
- **Edit-gate markers match literal verdict strings**, and a commit spanning `docs/decisions/` + `docs/jtbd/` can deadlock the compendium gate. `markers-and-edit-gates.md`, `commit-time-gates.md`.
- **`git add` must be its own Bash call.** A gate-denied `git add X && git commit` never runs the add, so the retry commits the wrong tree. Verify with `git show --stat HEAD` AND `git diff HEAD -- <files>`. `git-staging-and-agent-io.md`.
- **Never trust a pipeline summary line.** Both watchers reported success on a red master. Verify: `gh run view <id> --json jobs --jq '.jobs[] | "\(.conclusion)\t\(.name)"'`. `ci-observability-and-perf.md`.
- **Compiling is not loading.** `npm run build` exits 0 on output that cannot be required. Pack the tarball and start it. `babel-esm-and-toolchain.md`.
- **A test that exists may never run**, and a config note explaining why something is impossible is a hypothesis, not a finding. Mutation-test new tests; re-check deferral notes before repeating them. `cucumber-profiles-and-tags.md`, `agent-and-workflow-patterns.md`.
- **Boolean `workflow_dispatch` inputs compare UNQUOTED**; a reusable workflow needs `concurrency:` off `${{ github.workflow }}`. Both fail GREEN. `releases-and-ci.md`.
- **Migrating OpenSearch? Read `docs/OPENSEARCH-MIGRATION-PLAYBOOK.md` first.** Sizing is empirical; re-measure. `opensearch-and-deploy-state.md`, `cutover-mechanics.md`.
- **Never commit an absolute request or read count.** Traffic volumes are confidential disclosure in commit messages and comments alike. Ratios and go/no-go only. `external-comms-content-rules.md`.

## Topic Index

Decomposed by subject 2026-07-28; rotated 2026-08-02 and again 2026-08-04 (Tier-3 budget — four new files split off on subtopic boundaries).

| File                                                                       | Subject                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [what-you-need-to-know.md](./what-you-need-to-know.md)                     | General project facts (API version, trunk-based dev, credentials, ADR index)   |
| [what-will-surprise-you.md](./what-will-surprise-you.md)                   | Domain-data + API-shape surprises (G-NAF, OpenSearch naming, WayCharter)       |
| [opensearch-and-deploy-state.md](./opensearch-and-deploy-state.md)         | Search topology, backends, sizing, the migration playbook                      |
| [cutover-mechanics.md](./cutover-mechanics.md)                             | What must happen for a cutover/rollback to take effect, and how each step lies |
| [search-relevance-and-scoring.md](./search-relevance-and-scoring.md)       | BM25 / analyzer internals behind ranking; reading the evidence correctly       |
| [markers-and-edit-gates.md](./markers-and-edit-gates.md)                   | Architect / JTBD edit-gate verdict + prompt literal-matching mechanics         |
| [oversight-markers.md](./oversight-markers.md)                             | The `human-oversight: confirmed` evidence gate and its resumed-session trap    |
| [commit-time-gates.md](./commit-time-gates.md)                             | Compendium-pairing, README-refresh, RISK-POLICY gates + git-staging traps      |
| [external-comms-marker-mechanics.md](./external-comms-marker-mechanics.md) | How the external-comms gate derives and matches its marker                     |
| [gate-command-detection.md](./gate-command-detection.md)                   | How gates detect governed commands: what slips past, what falsely trips        |
| [external-comms-content-rules.md](./external-comms-content-rules.md)       | What the gate rejects on content: em-dashes, absolute traffic counts           |
| [decisions-compendium.md](./decisions-compendium.md)                       | How `docs/decisions/README.md` is generated and why not to run it by hand      |
| [releases-and-ci.md](./releases-and-ci.md)                                 | Workflow traps (boolean inputs, concurrency, k6) and dependency freshness      |
| [changesets-and-release-flow.md](./changesets-and-release-flow.md)         | Changesets, the two manual approvals, the `published` gate, `release:watch`    |
| [push-guard-and-risk-gate.md](./push-guard-and-risk-gate.md)               | Red-master push guard and risk-scorer commit-gate behaviour at appetite        |
| [deploy-infra-and-caching.md](./deploy-infra-and-caching.md)               | EB deploys, Cloudflare/RapidAPI edge, HTTP caching, GHCR publishing            |
| [agent-and-workflow-patterns.md](./agent-and-workflow-patterns.md)         | Recurring assistant failure modes                                              |
| [itil-workflow-traps.md](./itil-workflow-traps.md)                         | Problem/ADR lifecycle traps: anchoring, README drift, Confirmation wording     |
| [testing-tdd-and-code.md](./testing-tdd-and-code.md)                       | The TDD hook, test anti-patterns, ESM/babel quirks                             |
| [babel-esm-and-toolchain.md](./babel-esm-and-toolchain.md)                 | Babel/ESM transpilation, the real vs declared Node floors, lockfile traps      |
| [cucumber-profiles-and-tags.md](./cucumber-profiles-and-tags.md)           | How profiles select scenarios, and how a feature can run never                 |
| [ci-observability-and-perf.md](./ci-observability-and-perf.md)             | Whether the pipeline is telling the truth; what the k6 harness can resolve     |
| [git-staging-and-agent-io.md](./git-staging-and-agent-io.md)               | How commits lose content; literal shapes agent/hook plumbing expects           |
