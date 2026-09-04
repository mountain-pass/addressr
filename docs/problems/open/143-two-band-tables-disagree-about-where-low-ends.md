# Problem 143: Two band tables disagree about where Low ends, and the boundary is the appetite threshold

**Status**: Open
**Reported**: 2026-09-04
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2). Impact 2: no gate behaviour turns on it, because the appetite is numeric and blocks strictly above 5 under either banding; the harm is that a reader of one table reaches a different label from a reader of the other, on the one number that matters. Likelihood 2: it needs someone to reason from a label rather than the number, which the tooling never does and a human might.
**Origin**: internal
**Effort**: S — the edit is two lines. The work is deciding which table is authoritative and accepting the knock-on.
**WSJF**: 4.0 — (4 × 1.0) / 1
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

`RISK-POLICY.md` bands residual scores as **3-4 Low, 5-9 Medium**. The shared scoring system bands them as
**3-5 Low, 6-9 Medium**. The disagreement is at exactly 5, which is the appetite threshold.

Found during the 2026-09-04 authoring of the credibility class, by the validator reviewing that amendment.
It is pre-existing and was not introduced by it.

## Why it was not fixed in that amendment

Three reasons, all from the validator, and recorded because they are the argument a future reader needs:

1. **It is coupled to the appetite line.** `RISK-POLICY.md` reads "Threshold: 5 (Medium)", which is only true
   under its own bands. Adopt the shared bands and it must read "5 (Low)", which changes how the appetite
   reads to every future reviewer.
2. **It has a second consumer.** The matrix drives problem-ticket severity. Moving 5 from Medium to Low
   reclassifies existing and future tickets.
3. **Nothing is broken today.** The gate consumes the number, not the label, so no pass or fail turns on it.

Bundling a semantic change with a second consumer into an amendment about outbound credibility would have
produced a commit that over-claimed its own scope — which is, precisely, one of the classes that amendment
authored.

## Interim state

`RISK-POLICY.md` now **declares** the divergence rather than leaving it silent: a note under Label Bands says
the override is deliberate, confined to the label, and not reconciled here because the reconciliation is a
decision of its own. So the contradiction is documented rather than resolved. That is the smaller defect, not
none.

## Investigation Tasks

1. Decide which table is authoritative. The shared system's bands are the wider convention; this file's bands
   are the ones its own appetite line is written against.
2. Whichever way it goes, change the band row and the appetite label in the same edit — they are one fact in
   two places, which is the shape that produced this.
3. Establish what reclassifying 5 does to open problem tickets, before changing it rather than after.
4. Consider whether the appetite is better stated without a label at all. "Threshold: 5, inclusive" is
   complete, and carries no band that can drift.

## Related

- [P142](142-the-credibility-axis-of-the-external-comms-gate-has-no-policy-so-it-cannot-fail.md) — the
  amendment during which this was found. Different defect, same file, deliberately not bundled.
- `RISK-POLICY.md` — the file the fix lives in, along with the shared scoring system's band definition.

## Notes

Inflow discipline: checked against the open backlog before capture. P142 is the nearest and was rejected as a
parent on subject — that ticket is about an axis that cannot fail, this one is about a label that disagrees
with itself, and they share only the file. No other open ticket touches the band tables.
