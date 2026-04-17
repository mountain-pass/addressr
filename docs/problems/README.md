# Problem Backlog

> Last reviewed: 2026-04-17T00:00:00Z
> Run `/wr-itil:manage-problem review` to refresh.

## WSJF Rankings

| WSJF | ID   | Title                                                      | Severity   | Status      | Effort | Notes                                                                  |
| ---- | ---- | ---------------------------------------------------------- | ---------- | ----------- | ------ | ---------------------------------------------------------------------- |
| 16.0 | P007 | Search scoring ranks exact address below sub-unit variants | 16 (High)  | Known Error | M      | Fix released v2.2.0 — awaiting production verification                 |
| 12.0 | P010 | CLI2 cucumber cannot mutate origin env                     | 6 (Medium) | Known Error | S      | Guardrail done; retrospective BRIEFING.md note remaining               |
| 8.0  | P005 | TDD hook does not recognise Cucumber feature files         | 8 (Medium) | Open        | S      | Fix is in windyroad TDD plugin (external repo) — limited actionability |
| 7.5  | P016 | External comms missing voice/tone and risk checks          | 15 (High)  | Open        | M      | Process gate needed in CLAUDE.md / skill                               |
| 6.0  | P001 | Stale Dockerfile                                           | 6 (Medium) | Open        | S      | Docker channel broken; EB/RapidAPI unaffected                          |
| 6.0  | P003 | npm version lockfile drift                                 | 6 (Medium) | Open        | S      | Workaround: npx npm@10 install                                         |
| 4.5  | P006 | RapidAPI CI sync deferred                                  | 9 (Medium) | Open        | M      | Both automated approaches failed; GraphQL path unexplored              |
| 4.5  | P014 | Invalid address ID returns 500 not 404                     | 9 (Medium) | Open        | M      | Error handling exists but untested; null-check gap                     |
| 4.0  | P004 | release:watch script reports false negative                | 4 (Low)    | Open        | S      | Cosmetic; workaround documented                                        |
| 4.0  | P012 | G-NAF loader dumps full JSON to CI logs                    | 4 (Low)    | Open        | S      | 2-line fix; confirmed root cause                                       |
| 3.0  | P015 | Range-number addresses not findable by base number         | 12 (High)  | Open        | L      | Root cause hypothesis only; needs investigation                        |

## Parked

| ID   | Title                                     | Reason                               | Parked since |
| ---- | ----------------------------------------- | ------------------------------------ | ------------ |
| P013 | Loader second run fails on cloud clusters | Cannot reproduce on supported config | 2026-04-15   |

## Priority corrections applied in this review

- P005: priority field was absent — added 8 (Medium): Impact Minor (2) × Likelihood Likely (4)
- P006: likelihood was recorded as "Possible (2)" — corrected to Possible (3); priority 6→9 (Medium)
- P010: likelihood was recorded as "Possible (2)" — corrected to Possible (3); priority 4→6 (Low→Medium)
- P014: arithmetic error in file — 3×3 was recorded as 6; corrected to 9 (Medium)
