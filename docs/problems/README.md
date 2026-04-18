# Problem Backlog

> Last reviewed: 2026-04-19T00:00:00Z
> Run `/wr-itil:manage-problem review` to refresh.

## WSJF Rankings

| WSJF | ID   | Title                                                 | Severity   | Status      | Effort | Notes                                                    |
| ---- | ---- | ----------------------------------------------------- | ---------- | ----------- | ------ | -------------------------------------------------------- |
| 12.0 | P022 | CLAUDE.md missing Risk Gate / Verification guardrails | 6 (Medium) | Known Error | S      | Add two short sections to AGENTS.md/CLAUDE.md            |
| 9.0  | P006 | RapidAPI CI sync deferred                             | 9 (Medium) | Known Error | M      | Both approaches failed; GraphQL path unexplored          |
| 9.0  | P021 | `git push origin master` not risk-gated               | 9 (Medium) | Known Error | M      | Add PreToolUse hook + helper script                      |
| 8.0  | P012 | G-NAF loader dumps full JSON to CI logs               | 4 (Low)    | Known Error | S      | 2-line fix in `service/address-service.js:790-799`       |
| 7.5  | P016 | External comms missing voice/tone and risk checks     | 15 (High)  | Open        | M      | Process gate needed — VOICE-AND-TONE.md now exists       |
| 6.0  | P001 | Stale Dockerfile                                      | 6 (Medium) | Open        | S      | Docker channel broken; EB/RapidAPI unaffected            |
| 6.0  | P003 | npm version lockfile drift                            | 6 (Medium) | Open        | S      | Workaround: `npx -y npm@10 install`                      |
| 12.0 | P019 | No deploy-time smoke check for root Link header rels  | 6 (Medium) | Known Error | S      | Fix released 2026-04-19; awaiting verify on next publish |
| 6.0  | P020 | Orphan `test/js/*.test.js` — no npm script runs them  | 3 (Low)    | Known Error | S      | Add `test:js` script, wire to pre-commit                 |
| 4.5  | P014 | Invalid address ID returns 500 not 404                | 9 (Medium) | Open        | M      | Error handling exists but untested; null-check gap       |
| 8.0  | P004 | release:watch script reports false negative           | 4 (Low)    | Known Error | S      | Fix released 2026-04-19; awaiting verify on next release |
| 4.0  | P024 | Architect agent misses performance implications       | 8 (Medium) | Open        | M      | Governance tooling blind spot                            |
| 3.0  | P015 | Range-number addresses not findable by base number    | 12 (High)  | Open        | L      | Hypothesis only; needs OpenSearch explain investigation  |
| 2.5  | P023 | Cross-origin root `/` not browser-cached              | 10 (High)  | Open        | L      | Multi-layer (origin CORS + RapidAPI gateway + SDK)       |

## Parked

| ID   | Title                                     | Reason                                                  | Parked since |
| ---- | ----------------------------------------- | ------------------------------------------------------- | ------------ |
| P013 | Loader second run fails on cloud clusters | Cannot reproduce on supported config                    | 2026-04-15   |
| P018 | Root `/` cache TTL too long               | Long-lived root cache is intentional per user direction | 2026-04-18   |
| P005 | TDD hook does not recognise Cucumber      | Blocked on upstream windyroad TDD plugin fix            | 2026-04-19   |

## Review notes (2026-04-19)

**Auto-transitioned Open → Known Error** (per review step 9b.10 — confirmed root cause + workaround documented):

- P005 — root cause in upstream windyroad TDD plugin confirmed; workaround (wrapper `.test.js` file) documented
- P006 — both integration approaches investigated and proven defunct/unversioned; manual-sync workaround documented
- P012 — root cause pinpointed to `service/address-service.js:790-799`; scrolling past noise documented
- P020 — root cause (no npm script) confirmed; `node --test <file>` manual workaround documented
- P021 — gap in enforcement confirmed; user-manual-inspection workaround documented
- P022 — CLAUDE.md gap confirmed; per-session reinforcement workaround documented

**WSJF changes from prior review**:

- P005: 8.0 → 16.0 (status ↑ Known Error)
- P006: 4.5 → 9.0 (status ↑ Known Error)
- P012: 4.0 → 8.0 (status ↑ Known Error)
- P020, P021, P022: new problems (added 2026-04-18) now ranked
- P019: new problem (added 2026-04-18) now ranked
- P023, P024: new problems (added 2026-04-18) now ranked

No priority (Impact × Likelihood) values changed — only Status multipliers applied.
