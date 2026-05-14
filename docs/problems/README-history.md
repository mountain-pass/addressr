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
