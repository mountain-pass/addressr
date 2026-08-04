# Risk R018: Doc links embed a mutable lifecycle segment, so every transition breaks them

**Status**: Active
**Category**: operational (ISO 31000) — governance audit trail
**Identified**: 2026-07-26
**Owner**: addressr-maintainer
**Last reviewed**: 2026-08-05
**Next review**: 2027-02-05
**Curation**: curated 2026-08-05 (superseding the auto-scaffolded pending-review state of 2026-07-26); re-scoped — the original framing was wrong

## Description

Cross-artefact documentation links in this repo embed a **mutable** path segment, so any lifecycle transition silently breaks every inbound link pointing at the artefact. Two directions, both live:

- **Problem tickets carry their state as a directory** — `docs/problems/open/` → `verifying/` → `known-error/` → `closed/` → `parked/`. Every ADR, RFC or risk linking `../problems/open/NNN-slug.md` breaks the moment the ticket advances.
- **ADRs carry their status as a filename suffix** — `NNN-slug.proposed.md` → `.accepted.md` → `.superseded.md`. Every inbound link breaks on promotion. This half is live-loaded right now: ADR-001, ADR-037, ADR-039 and ADR-040 are all still `proposed`, and promoting any of them breaks links held by risk entries, problem tickets and the docker changelog.

Nothing notices, because **a stale link renders identically to a live one** in every markdown viewer. The only way to find them is to resolve them.

### The original framing was wrong

This entry was raised as "ADR-039 references `docs/problems/open/067-...` in four places and no P067 file exists". The file existed the whole time — it had moved to `docs/problems/verifying/`. The defect was never a forward reference landing ahead of its target; it was a link embedding a directory that changes. Re-scoped accordingly.

### Measured, not estimated

A full resolve of every relative link under `docs/**` on 2026-08-05 found **174 broken link instances across 50 files** — 68 with the wrong relative depth and 106 pointing at a moved or renamed target. The original entry named 4 of them.

The lifecycle-directory scheme is **not ours to change**: `docs/problems/README.md` describes a dual-tolerant glob driven by an upstream `wr-itil` migration window, so "restructure so tickets don't move" was never an available treatment.

## Inherent Risk

Impact × Likelihood _before_ controls.

- **Impact**: 2 (Minor) — degrades navigation and, more importantly, the traceability of the governance record: an ADR whose cited problem ticket cannot be reached is a weaker audit artefact. No service, security or data impact.
- **Likelihood**: 5 (Almost certain) — realised 174 times before anyone looked, and it recurs on every ticket transition and every ADR promotion.
- **Inherent Score**: 10
- **Inherent Band**: High

## Controls

- **`test/js/__tests__/doc-links-resolve.test.mjs`** — resolves every relative link target under `docs/**` and fails with the full list of offenders. **Evidenced**, not procedural: it runs in the unit suite in CI, and it was mutation-tested at introduction (flipping one ADR link from `.superseded.md` to `.accepted.md` made it fail and name that exact link). Enumerating all offenders in one failure is deliberate — it is what makes the repair mechanical rather than a hunt.

  This follows the precedent ADR-001's 2026-07-27 amendment set for exactly this artefact class: _"the prerequisite is enforced in test, not left to a human grep."_

- **One-time repair of all 174 instances** (2026-08-05) — the control starts from a clean tree rather than an allowlist, so no baseline of known-broken links is quietly exempted.

## Residual Risk

Impact × Likelihood _after_ controls.

- **Impact**: 2 (Minor) — unchanged; the control detects rather than prevents.
- **Likelihood**: 1 (Rare) — a break now fails CI on the commit that causes it, so it cannot accumulate. Not zero, because the repair is still manual once the test points at it.
- **Residual Score**: 2
- **Residual Band**: Very Low
- **Within appetite?**: **Yes** (appetite 5, inclusive)

### What the control does not cover

A link that **resolves but points at the wrong artefact**. Link text reading "ADR 003" against a target inside `docs/problems/` resolves cleanly and looks confirmed to a resolution check — worse, a number-keyed repair tool will happily "confirm" it. This class is invisible to R018's control and is not currently measured. Recorded here rather than left implied; it is the residual's honest ceiling.

## Treatment

**Mitigate.** Detection was chosen over removing the hazard.

The alternative — referencing artefacts by bare ID (`P067`, `ADR-039`) so there is no path to break — removes the hazard outright but costs the clickable link, and it is a repo-wide convention change across four doc trees that would itself need an ADR. `docs/risks/README.md` already invites ID-form cross-references, but actual practice across ADRs, problems, risks and RFCs is overwhelmingly path-form. A single resolution test covers both broken classes for materially less cost than the convention change.

## Monitoring

- **Trigger to re-assess**: the test starts being skipped or its failures routinely waived; or the wrong-target class above is observed causing a real misreading, which would justify extending the control.
- **Metrics**: broken-link count at each run (expected: 0).

## Related

- Criteria: `RISK-POLICY.md`
- Realised-as: no problem ticket — the 174 instances were found and repaired in one pass under P083.
- Treatment precedent: [ADR 001](../decisions/001-risk-gated-release-process.proposed.md) amendment 2026-07-27 — evidenced-over-procedural control on the same artefact class.
- Personas affected: [addressr-maintainer](../jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md)

## Evidence Log

Auto-populated from `.risk-reports/` via Phase 2b drain.

- 2026-07-26T10:23:23Z: fired in `.risk-reports/2026-07-26T10-23-23-commit.md` (reason: user-stated-precondition)

## Change Log

- 2026-07-26: Auto-scaffolded by Phase 2b drain (ADR-056). Pending human curation.
- 2026-08-05: Curated under P083 and **re-scoped**. The original framing ("no P067 file exists") was factually wrong — the file had moved, not been omitted. Widened to the general class after the architect flagged the ADR-status half as the larger of the two. Measured at 174 instances, repaired, and a resolution test landed as an evidenced control. Scored 10 inherent / 2 residual, within appetite.
