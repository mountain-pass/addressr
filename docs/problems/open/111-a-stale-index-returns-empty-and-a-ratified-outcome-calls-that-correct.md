# Problem 111: A stale index returns empty, and a ratified outcome calls that correct

**Status**: Open
**Reported**: 2026-08-20
**Priority**: 12 (High) — Impact: 4 × Likelihood: 3. Impact 4: the failure writes real addresses into downstream systems marked invalid, with a confidence score and an audit trail attesting it, so the bad record outlives the staleness that produced it. Likelihood 3: the loaders run quarterly and their silent-stop is undetected (P101); no instance is on record, and nothing exists that would have surfaced one.
**Origin**: internal
**Effort**: S — the remedy is a wording repair to one Desired Outcome plus a persona pain point, both requiring human ratification rather than an autonomous edit.
**JTBD**: JTBD-100
**Persona**: data-quality-analyst

## Description

**A real address missing from a stale index returns empty, and the ratified outcome for this job says an
empty result is the CORRECT answer.** The failure is camouflaged by a documented correctness guarantee.

`docs/jtbd/data-quality-analyst/JTBD-100-validate-addresses-against-gnaf.validated.md` states, verbatim:

- Every result includes a confidence score
- Structured address output matches G-NAF format
- **Invalid addresses return empty results (not false positives)**

The parenthetical is what does the damage. `(not false positives)` scopes the promise to ONE direction —
never assert an address that does not exist. It says nothing about the other direction, so an empty result
for an address that DOES exist reads as the outcome being satisfied rather than breached.

**Where a stale index comes from**: the nine quarterly `update-*` state loaders write the sole production
search domain. If they silently stop firing — which P101 records as undetected, with a blind window of
months and a GitHub auto-disable at 60 days of repository inactivity — new subdivisions and streets from the
quarterly G-NAF release never enter the index.

**Nobody complains, and that is structural rather than lucky.** People do not report the address they did
not search for. There is no inbound signal, so consumer complaint is not a fallback detection path.

### The counterpart job is NOT camouflaged, and the distinction is the useful part

`docs/jtbd/web-app-developer/JTBD-001-search-autocomplete-addresses.validated.md` states, verbatim:

- Results appear within 200 ms of input
- **Correct address appears in the first page of results for reasonable queries**
- Typos and abbreviations (e.g., "ST" vs "STREET") still match

That second outcome is **falsified** by a stale index, not satisfied by it. It names the correct address
appearing and conditions only on the shape of the query, not on the state of the index. So JTBD-001 is the
corpus's one existing detection surface for this failure and needs no wording repair — only a persona pain
point. An earlier framing of this finding lumped the two jobs together as both disguising the failure; that
was wrong, and the correction is what makes the remedy shape clear: repair JTBD-100's wording, leave
JTBD-001's alone.

### No pain point in either persona names this direction

Six pain points across the two personas, none of them the false-negative case:

- `web-app-developer`: "Inaccurate results that surface non-existent or wrong addresses" — the verb
  _surface_ fixes it to the false-positive direction.
- `data-quality-analyst`: "Inconsistent address formats across input sources"; "Lack of confidence scoring
  (everything looks \"valid\" or \"not\")"; "Geocoding services that disagree with the authoritative dataset".

A real address going missing is named nowhere.

## Symptoms

1. A newly built address returns empty and is indistinguishable, at the API, from an address that does not
   exist.
2. A batch validation run marks real addresses invalid, attaches a confidence score, and writes an audit
   trail asserting the verdict. The bad record persists after the index is refreshed.
3. No alert, no complaint, no test fails. Index currency is asserted nowhere.

## Impact Assessment

- **Who is affected**: `data-quality-analyst` primarily — batch mode, structured output feeding downstream
  systems, audit trail. `web-app-developer` secondarily, and JTBD-100's frontmatter already carries
  `secondary-personas: [web-app-developer]`, so this ticket reaches both through a relationship the ratified
  corpus already asserts rather than one invented at capture.
- **Frequency**: continuous while an index is stale.
- **Severity**: High on durability rather than on blast radius. For a web developer a missing address is
  noticed immediately — a user cannot complete a form, and it is recoverable. For an analyst it is silent,
  written down, and outlives its cause.

## Root Cause Analysis

**Index currency is not stated as an outcome anywhere in the job corpus.** The only occurrence of staleness
in all eight job files is JTBD-002 line 38, under _Current Solutions_: "Hard-coded postcode/suburb lists that
go stale" — staleness documented as a weakness of the alternative, never as something Addressr promises to
avoid. JTBD-001 and JTBD-100 both say "authoritative"; neither says "current".

So the outcome that would have caught this was never written, and the outcome that WAS written happens to
license the failure. That ordering matters: this is not a guarantee that decayed, it is a gap that a
neighbouring guarantee papers over.

### Investigation Tasks

- [ ] **Repair JTBD-100's third Desired Outcome so it distinguishes "no such address exists" from "the index
      does not contain it yet".** This is SUBSTANCE on an artefact carrying `human-oversight: confirmed`, so
      it needs human ratification via `/wr-jtbd:confirm-jobs-and-personas` and MUST NOT be edited
      autonomously (ADR-049).
- [ ] Add a false-negative pain point to `web-app-developer` and to `data-quality-analyst`. Same
      ratification constraint.
- [ ] Consider an index-currency Desired Outcome, on the reasoning that currency must be asserted upstream
      of the query rather than inferred from it — a query cannot distinguish the two cases, which is this
      ticket's whole point.
- [ ] Decide whether anything should ASSERT index currency mechanically, constrained by ADR-051: it must act
      or be agent-read, never a notification to the maintainer.

## Dependencies

- **Blocks**: nothing.
- **Blocked by**: nothing. The first task needs a ratification conversation, not a prerequisite.
- **Composes with**: P101 — that ticket owns "the loaders can stop silently"; this one owns "and when they
  do, the symptom reads as correct behaviour". Sibling, not duplicate: fixing detection leaves the wording
  defect, and fixing the wording leaves the detection gap.

## Related

- **[P101](101-scheduled-workflow-loud-failure-has-no-reader.md)** — the detection half. Its staleness
  detector covers the quarterly loaders whose silent stop produces the stale index this ticket is about.
- **[ADR-051](../../decisions/051-a-check-with-no-reader-but-the-maintainer-is-not-a-control.proposed.md)** —
  constrains what any remedy for the last task may look like.
- **[ADR-049](../../decisions/049-amendment-scoped-by-whether-a-human-would-ratify-it.proposed.md)** — why
  the outcome repair is routed to a ratification surface rather than done here. A new or changed Desired
  Outcome is substance, and substance may not inherit a ratification nobody granted it.
- **JTBD-100** (Validate Addresses Against G-NAF), persona `data-quality-analyst` — the defective wording,
  and where the fix lands.
- **JTBD-001** (Search and Autocomplete Addresses), persona `web-app-developer` — the counterpart, falsified
  rather than disguised by the same failure. Named here so a ratification run sees both halves at once.
