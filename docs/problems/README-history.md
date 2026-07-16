# Problem Backlog README History

> Forward-chronology archive of displaced "Last reviewed" fragments per P134 truncation discipline.

## 2026-05-03

Last reviewed: 2026-05-03 — P035 opened (read-shadow soak validation has multiple blind spots — silent failures across creds, deletion, and firing). Backlog has accumulated tickets since 2026-04-19 (P027–P035 not yet ranked); next `/wr-itil:review-problems` invocation will perform a full re-rank and proper render. Last full WSJF review: 2026-04-19.

## 2026-05-11

Last reviewed: 2026-05-11 — **README reconciled** — 17 drift entries corrected: P003/P012/P020/P022 (closed), P016/P021/P024 (parked), P025/P026/P027/P029/P030/P031/P032/P033/P034 (missing open), P028 (missing known-error). Reconciliation contract per P118 + ADR-014 amended ("Reconciliation as preflight robustness layer"). WSJF values for newly-added rows are deferred estimates pending next `/wr-itil:review-problems` full re-rank.

## 2026-05-12

Last reviewed: 2026-05-12 — **README reconciled** — 1 drift entry corrected: P036 (missing open). Reconciliation contract per P118 + ADR-014 amended ("Reconciliation as preflight robustness layer"). WSJF deferred pending next `/wr-itil:review-problems`.

## 2026-05-14

Last reviewed: 2026-05-14 — ADR 029 Phase 1 rolled back; P036 + P038 parked as superseded by the decommission. P037 stays open (loader fix applies to v1 path too). WSJF deferred pending next `/wr-itil:review-problems`.

Last reviewed: 2026-05-14 **README reconciled** — 3 drift entries corrected: P039, P040, P041 (all missing open). Reconciliation contract per P118 + ADR-014 amended ("Reconciliation as preflight robustness layer"). WSJF for new rows is a deferred estimate (3/M=1.5); next `/wr-itil:review-problems` will re-rate.

Last reviewed: 2026-05-14 — P040 → Known Error (RCA corrected — Cloudflare Worker `safeIps` strict-equality bug + UR IP drift, not ADR 024 origin enforcement; Referer-header workaround documented; WSJF 1.5 → 20.0). P042 captured (version-control the worker via Terraform — closes ADR 018 line 50/63). ADR 016 amended to require the Referer header in Confirmation; BRIEFING.md line 65 misattribution corrected; release.yml gains worker-vs-origin smoke probes.

## 2026-07-06

Last reviewed: 2026-05-25 — P042 → Verification Pending (Cloudflare Worker cut over to Terraform, ADR 032, v2.6.12/13 deployed + verified live); P044 captured (changesets swallows publish failure → deploy silently skips). P040 + P042 share the 24h UptimeRobot observation gate before close. WSJF re-rank deferred to next `/wr-itil:review-problems`.

Last reviewed: 2026-07-06 **P045 captured** — RISK-POLICY staleness window hardcoded at 14 days conflicts with the quarterly review cadence (lightweight aside via /wr-itil:capture-problem)

Last reviewed: 2026-07-06 **ADR 029 Phase 1 re-attempt begins** — P036 un-parked (trigger fired: re-attempt approved; audit logs shipped in ADR 030 module); P037 fix released ahead of populate (initIndex fast-path + snapshot retry); ADR 029/030/031 re-attempt amendments landed. WSJF re-rank deferred to next `/wr-itil:review-problems`.

Last reviewed: 2026-07-07 **P037 verification pending** — initIndex fast-path + snapshot retry released in v2.6.14 (PR #488); verification = first clean 9-of-9 populate against the ADR 029 Stage 2 v2 domain. Stage 0 of the re-attempt complete (audit-log module, parity dashboard, refreshed k6 baseline: gate ≤ ~1,443 ms).

## 2026-07-15

Last reviewed: 2026-07-15 **P047 + P048 captured** — session retro after the OpenSearch 2.19→3.5 migration (cutover + v2 decommission complete; ADR-035 accepted). Two upstream wr-risk-scorer frictions ticketed (appetite-misstatement, external-comms marker hash-exactness).

> Last reviewed: 2026-07-15T06:43Z **full re-rank** — P028 (OpenSearch 1.3.20 debt) **CLOSED** (production migrated to 3.5, ADR-035; v1 decommissioned). Auto-transitioned Open→Known Error: P036 (FGAC clobber — ADR-033 structural fix shipped), P041, P047, P048. Re-rated all deferred tickets to concrete Impact×Likelihood/Effort/WSJF. P014 corrected Open→Known Error (README drift). Relevance-close evaluator produced only false positives this pass (every flagged file exists) — no relevance-closes fired.

> Last reviewed: 2026-07-15 **P001 verification pending** — Stale Dockerfile fix (Node 22-alpine base + `addressr-server-2` CMD, commit 1a68e6e, released 2026-04-19) confirmed on origin/master; ticket moved Known Error → Verifying per ADR-022. Verify via local `docker build`.

> Last reviewed: 2026-07-15 **P049 captured** — wr-retrospective retro scripts (check-ask-hygiene / check-briefing-budgets / check-tickets-deferred-cause) lack ADR-049 bin shims in adopter repos; retro passes degrade fail-open (lightweight aside via /wr-itil:capture-problem).

> Last reviewed: 2026-07-15 **P019 verification pending** — root `Link` header rel-completeness probe confirmed shipped in `.github/workflows/release.yml` (commit 98a0ca9, 2026-04-19); ticket moved Known Error → Verifying per ADR-022. Verify via green rel-completeness probe on the next published release run.

## 2026-07-16

> Last reviewed: 2026-07-15 **batch transition** — P014 verifying (404-not-500 fix, commit fda4e3b), P004 verifying (release:watch step-level query, commit e800b05), P036 verifying (FGAC clobber structurally removed — ADR-033 IAM/SigV4 in production, FGAC-off v3 domain per ADR-035; addressr4 decommissioned). All three Known Error → Verification Pending per ADR-022.

> Last reviewed: 2026-07-16 **P030 known error** — triage complete: non-breaking `npm audit fix` cleared 21/48 findings (lockfile-only, build green, changeset queued); remaining 27 chain to swagger-tools (prod — ADR-003 reassessment queued for user) + istanbul-middleware/npm-check (dev-only). Re-rated 16 → 12, Effort M → XL, WSJF 3.0.
> Last reviewed: 2026-07-16 **P034 verification pending** — loader COVERED_STATES filter now case-insensitive (parser extracted to `service/covered-states.js`, all three comparison sites normalised) + fail-loud when the filter matches zero G-NAF detail files; TDD unit tests 4/4, RFC-001 captured, changeset queued; ships with next npm publish.

> Last reviewed: 2026-07-16 **P044 verification pending** — release.yml `release` job now fails loud when a publish was swallowed (package.json ahead of npm while `published != 'true'`, e.g. expired NPM_TOKEN) instead of green-skipping Deploy + Smoke; RFC-002 captured (fix-time, I13); workflow-only, no changeset — verify on next release run.
