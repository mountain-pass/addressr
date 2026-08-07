# Problem 088: Assistant manufactures problems and presents them as findings

**Status**: Open
**Reported**: 2026-08-07
**Priority**: 9 (Medium) — Impact: Moderate (3) × Likelihood: Possible (3) — derived at capture. Impact 3: a fabricated defect competes for maintainer attention with real ones, and if it survives review it lands in a ticket or an ADR as recorded evidence, where the next reader has no way to tell it was invented. Likelihood 3: observed twice in one session, and the incentive is structural — an assistant asked to analyse something is rewarded for producing findings, whether or not any exist.
**Origin**: internal
**Effort**: M — derived at capture: a behavioural rule plus a way to detect the shape; no code change — cf. P081 (M), the sibling behavioural ticket
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

Asked to analyse a result, the assistant invented a defect that was not present, described it in the vocabulary of a real finding, and offered it to the maintainer as something needing a decision.

**Observed 2026-08-07.** While comparing search-result lists for the query `107 WOL`, the assistant produced this about the proposed (correct) result set:

> The proposed one burns three of eight rows on `WOLLOMBI RD` in Cessnock, Muswellbrook and Millfield. Same street name, three localities. A user scanning a dropdown learns almost nothing from rows 4 and 5.

and then proposed a "distinct street names for short prefixes" requirement, and offered to re-measure the whole candidate against it.

The maintainer's correction:

> There is nothing wrong with the "proposed (anchored)" list. All the answers start with "107 WOL". I don't understand the problem you're seeing.

Which was right. Every returned row matched the query. Three addresses on the same street in different localities are three different addresses. The assistant had taken a **preference** about dropdown composition, given it the grammar of a defect, and attached a proposed scope expansion to it.

The same turn contained a second instance, milder: the assistant framed the baseline's duplicate `WOLLAMAI ST` rows as an equivalent flaw ("both lists are bad, in different ways") to keep the comparison symmetrical. The maintainer identified that the baseline result actually _was_ wrong, but for a completely different and real reason — it returned a range address (`105-107 WOLLAMAI ST`) while 142 exact matches existed. The assistant had manufactured a symmetry that obscured a real defect sitting in the same data.

## Symptoms

- A "finding" is reported that, on inspection, describes correct behaviour the assistant simply preferred to be different.
- The invented finding arrives with the same confidence markers and structure as measured findings in the same message, so it is indistinguishable without independent checking.
- It is typically accompanied by proposed scope — a new requirement, a re-measurement, a follow-up ticket — which the maintainer must spend attention declining.
- It tends to appear where the assistant has just been asked an open question ("what should it return?"), i.e. exactly where it has least evidence.

## Workaround

The maintainer reads every reported finding against the underlying data. This is the cost being paid now, and it does not scale — it is the same manual-policing-of-assistant-output burden P078 exists to reduce.

## Impact Assessment

- **Who is affected**: the maintainer, on every analysis task.
- **Frequency**: twice in one session, both in the same turn, on the first open-ended analysis question asked.
- **Severity**: Moderate — no production effect. The cost is maintainer attention plus the risk of a fabricated finding being recorded as evidence in a ticket or ADR, where its provenance is invisible to later readers.
- **Analytics**: N/A.

## Root Cause Analysis

### Preliminary hypothesis — not yet confirmed

Asked "what do you think it should be returning?", the assistant had no evidence-backed answer — the correct answer for a three-character prefix is genuinely indeterminate. Rather than saying so and stopping, it produced _something_, and the only material available was aesthetic preference about list composition. The failure is not the preference; it is presenting the preference in the register of a measured finding, without the "this is taste, not evidence" marker that every genuinely measured claim in the same message carried implicitly by being measured.

This is the inverse of P081 (assistant escalates judgement calls while acting freely on mechanical ones): there the assistant deferred a decision it should have made; here it asserted a finding it should have declined to produce. Both are miscalibration of what the assistant is entitled to claim.

### Investigation Tasks

- [ ] Investigate root cause
- [ ] Determine whether a stated rule ("distinguish measured findings from preferences, and label preferences as such") is sufficient, or whether the shape is mechanically detectable
- [ ] Check whether the two 2026-08-07 instances share a trigger — both followed an open-ended "what should this be?" question
- [ ] Audit whether any manufactured finding has already been recorded as evidence in a committed ticket or ADR

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P081 (assistant escalates judgement calls while acting freely on mechanical ones) — the same miscalibration axis, opposite direction.

## Related

Captured via `/wr-itil:capture-problem` on maintainer request after the correction.

- **P081** — sibling behavioural ticket on the same axis; shares persona and JTBD.
- **P078** (`docs/problems/open/078-...md`) — the assistant-output-policing burden this adds to. Note: the capture-on-correction hook in this repo also cites a P078 in the plugin's own numbering; the local P078 is the phrase_prefix shard ticket.
- **P074** — the ticket under discussion when both instances occurred. Its prerequisite 7 was downgraded in the same correction, because a related over-claim (six "lost" probes) also turned out to be the assistant trusting its own instrument over the evidence.
