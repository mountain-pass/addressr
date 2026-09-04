# Risk Policy

_Per ISO 31000 — Risk Management_

**Last reviewed:** 2026-09-04

> Reviewed quarterly — next review due 2026-10-06 (user-directed cadence, 2026-07-06)
>
> Amended 2026-09-04: the Outbound Credibility / Self-Own class and the Completeness of These Criteria rule were authored, and Impact rows 2 and 3 extended to hook them. This does not reset the quarterly cadence.
>
> Deliberately NOT authored in that amendment: an operational-weakness disclosure class, which [P142](docs/problems/open/142-the-credibility-axis-of-the-external-comms-gate-has-no-policy-so-it-cannot-fail.md) records as a second gap in this file. It is deferred rather than overlooked. The Completeness of These Criteria rule does not reach it — that rule governs only axes with a closed class list — so a reviewer meeting an operational-weakness disclosure today has no class to cite and no rule compelling a verdict, which is the same state the credibility axis was in before this amendment.

## Business Context

Addressr is an Australian Address Validation, Search and Autocomplete service published by Mountain Pass as the npm package `@mountainpass/addressr` and Docker image `ghcr.io/mountain-pass/addressr`. It validates addresses against the Geocoded National Address File (G-NAF), Australia's authoritative address file.

**Distribution channels:**

- **RapidAPI** (primary) — hosted API service accessed by consumers via RapidAPI gateway
- **npm package** — self-hosted installations via `npm install -g @mountainpass/addressr`
- **Docker image** — self-hosted container deployments

**Live service (AWS):**

- Deployed to AWS via Terraform with OpenSearch backend
- Fronted by a Cloudflare Worker edge proxy since the ADR 032 cutover (v2.6.12/13); the Worker injects the gateway auth header per ADR 016/024
- Serves the RapidAPI-listed API (v1, current)

This is a revenue-generating production service with paid and free-tier consumers relying on address validation for their own applications.

## Confidential Information

Business metrics — including but not limited to user counts, subscriber numbers, revenue figures, pricing tier details, and traffic volumes — are confidential and **must not** appear in any file committed to this repository. This repository is public; committing such data constitutes an information disclosure incident.

When writing governance documents, risk reports, or any committed file, use generic descriptions (e.g., "paid and free-tier consumers", "revenue-generating service") rather than specific numbers. Confidential metrics may be discussed in conversation but must never be persisted in the repository.

## Outbound Credibility / Self-Own

An outbound artefact **must not** assert something the repository's own committed record contradicts, state a count or enumeration that does not match the change, claim a coverage for which a counter-example survives, state more certainty than its evidence carries, or narrate what no future reader can retrieve. Each of those is worded as an OUTCOME a reader can test, never as a claim about what the author did or did not check, which is unobservable. This repository is public, and a history rewrite does not recall what has already been fetched, forked, mirrored or read. A rewrite is an available control — Impact row 3 requires one for a disclosure — but it bounds further spread rather than undoing the first reading, and for a credibility defect there is nothing to contain: the damage is that a reader saw a claim the change itself disproves. So such a claim is a **credibility defect**: an externally-visible statement, effectively permanent in the readers it has already reached, that a reader can disprove using the change that carries it.

This section exists because the `wr-risk-scorer:external-comms` agent is defined as reviewing outbound prose on two composing axes and, until 2026-09-04, this document authored only the first. With no class to cite, the second axis could not FAIL. Reviewers correctly reported it as dormant rather than inventing classes by analogy, and a reviewer honestly reporting its own inability to score reads, at a glance, exactly like a reviewer finding nothing wrong. See [P142](docs/problems/open/142-the-credibility-axis-of-the-external-comms-gate-has-no-policy-so-it-cannot-fail.md).

**Scope.** The outbound artefact itself: commit messages, changeset bodies, release notes, GitHub issue, pull-request, discussion and advisory text, and published package content. The Scoring surface table below is the authoritative enumeration; anything it lists is in scope and anything in scope has a level there. Not code, tests or internal notes in their own right — but a claim an artefact makes ABOUT code or tests is in scope for that artefact, and so is a disagreement between an artefact and the change it ships. Every example below is a defect in outbound prose, not in the file it describes.

**How an author complies.** Verify each checkable claim against the tree before writing it, not after. Where a claim cannot be verified within the change, hedge it explicitly or cut it — "reasoned, not measured" is a legitimate and useful state, and is not a defect. Prefer fewer, checked claims to more, plausible ones. Not because the score rises with their number — it does not, being fixed by surface and evidence — but because each one is an independent opportunity to be wrong, and a draft is found defective on its worst claim rather than its average.

### Classes

Cite **exactly one** class: the first in table order that fits. Table order IS precedence, so a defect matching several — and most do, since a wrong count is also a disagreement with the file — is cited as the narrowest, and `falsifiable-from-the-tree` is reached only when the three above it do not apply. The six sort by what evidence would settle them: a contradicting artefact exists (1-4), the evidence is silent (5), no evidence is possible (6).

| Class                       | Test                                                                                                                                                                                                                                                                                                                                                               | Example encountered 2026-09-04                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `count-not-taken`           | A count or enumeration in the artefact does not match the change it describes.                                                                                                                                                                                                                                                                                     | A changeset enumerating two removed items where four were removed; a message claiming a defect was corrected "at three sites" where it was four.                                                                                                                                                                                                           |
| `unswept-completeness`      | A claim the artefact makes about the COVERAGE OF ITS OWN WORK — that it corrected, checked or bounded every instance of something — for which at least one instance survives. Tested by finding the survivor, never by asking whether a sweep happened. A factual universal about the world is NOT this class; it is a false claim, and belongs to row 1 or row 4. | "The word is corrected wherever it appeared", with three live uses surviving in the same change. "Every fault the counter can return now has a case", where one of its returns had none. Both are every-instance claims about the author's own coverage; a claim that states a NUMBER of sites is a count and belongs to row 1, whichever way it is wrong. |
| `internal-contradiction`    | Two parts of the same shipped change disagree, or the artefact disagrees with the file it ships.                                                                                                                                                                                                                                                                   | A commit message asserting a bound was replaced while the code still asserted it; a message more careful than the file it commits.                                                                                                                                                                                                                         |
| `falsifiable-from-the-tree` | A claim the repository's own committed record contradicts, and which no narrower class above covers. Residual.                                                                                                                                                                                                                                                     | A commit message asserting withdrawn configuration "never reached the provider", when a ledger committed elsewhere in the repository recorded a hand-sent verification that did. A factual universal, not a coverage claim, so row 2 does not reach it; the contradicting artefact was outside the change, so Likelihood 4.                                |
| `overconfident-state`       | An assertion where the evidence is SILENT rather than contradicting, but where evidence COULD exist and be gone looking for. Where the artefact itself contradicts it, that is row 3; where a committed artefact does, row 4; where no evidence could settle it at all, row 6.                                                                                     | "The dependency check completes" stated unscoped, where one run was watched and never answered — silence, not a counter-example. A bound reported as working where it had been reasoned but never observed to fire.                                                                                                                                        |
| `unverifiable-narration`    | A claim about drafting, the session, or who noticed what, which a future reader cannot check against any committed artefact. Provenance is NOT this class where what it cites is RETRIEVABLE — a ticket, a commit, a run identifier, a named file. A bare date is not retrievable and does not exempt. Provenance that cites only the conversation is this class.  | "Two drafts of this message counted them and got a different wrong number each time" — unfalsifiable, in a message whose every other sentence was checkable.                                                                                                                                                                                               |

### Scoring

**Impact** is fixed by the surface alone, and is hooked into the Impact Levels table below rather than asserted here. Every surface named in Scope has a level, so none is unscoreable:

| Surface                                                                                      | Level                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Commit message, issue body, pull-request body, discussion text                               | 2 — reach is the repository's own history and its readers                  |
| Changeset body, release note, published package content (README and any file in the tarball) | 3 — reaches the changelog, the release page and every adopter who installs |
| Security advisory                                                                            | 3 — reaches every adopter who subscribes, and is read under time pressure  |

Impact does not depend on whether a particular reader would in fact be misled. That judgement belongs to Likelihood, and splitting it across both axes is what makes a table like this drift.

**Likelihood** combines two things: the strength and proximity of the DISCONFIRMING EVIDENCE the reviewer reached, and how readily a reader takes the claim at face value. It is not the general Likelihood Levels scale, which is authored in terms of the chance a CHANGE introduces a defect and so does not reach a defect already sitting in the draft. That mismatch is not peculiar to this axis — it applies to any finding about outbound prose, disclosure included, and the rule for those is stated below. The second element is why level 1 exists: a claim that survives verification but reads as more than it is still misleads, and it is scored here rather than nowhere.

| Level | For these classes                                                                                  |
| ----- | -------------------------------------------------------------------------------------------------- |
| 5     | The contradicting artefact is inside the same change, was read, and bears on what the change does. |
| 4     | Contradicted by a committed artefact elsewhere in the repository.                                  |
| 3     | The evidence is silent and the claim is unhedged.                                                  |
| 2     | Plausible, but the reviewer could not reach the evidence within the review.                        |
| 1     | Verified correct, but ambiguously worded.                                                          |

A defect contradicted by the same change, read there, and bearing on what the change does therefore scores 10 on a commit message and 15 on a changeset, both above the appetite of 5. That is deliberate: a section written to close a pass-by-construction defect must not leave the arithmetic able to pass by construction.

**Where a claim needs state the reviewer cannot reach**, score Likelihood 2 and say plainly what could not be checked. Do not omit the finding, and do not score it as though it had been verified.

**Confidential Information findings use the same axis**, read as the strength of the evidence that the content IS a confidential metric: 5 where the artefact states a figure whose kind is evident from the artefact itself, whether or not that kind appears in this document's enumeration — which is open by design; 3 where the kind is inferable but not stated; 2 where the reviewer suspects it and cannot establish the kind. Impact is 3 per the Impact Levels table.

The remediation Impact row 3 requires — a force-push or history rewrite — is **non-mitigating for scoring purposes**. It bounds further spread and does not reduce either factor, so the residual after controls equals the inherent score. Stated so a reviewer does not credit it against an appetite that residual risk is measured against.

That section prohibits confidential metrics in "any file committed to this repository". Read together with the surface table above, the prohibition extends to every surface named there, committed or not: a revenue figure posted only to a public discussion discloses exactly as much as one in a commit.

This axis is stated here because the general Likelihood scale does not reach a defect already present in a draft, and before this amendment it had an Impact and no reachable multiplier.

## Completeness of These Criteria

This rule governs any axis for which this document authors a CLOSED class list. Today that is **Outbound Credibility / Self-Own** alone. Within such an axis, a risk that no authored class covers is **not scoreable**, and scoring it by analogy to a class this document does not name is prohibited.

It does **not** govern ordinary risk, which is scored directly on Impact multiplied by Likelihood and needs no class to be citable. A dependency bump, a deployment, a refactor or a flaky test is scored from the tables below in the ordinary way. Read otherwise, this rule would make every review of every change a failure, which is the opposite of its purpose.

It does **not** govern Confidential Information either, and that exclusion is deliberate rather than an oversight. That section authors an OPEN enumeration — "including but not limited to" — which instructs a reviewer to extend it to unnamed kinds of business metric. An open list and a no-analogy rule cannot both hold, and the open list is the right instrument there: a metric nobody anticipated is still a metric, and the harm does not wait for the class to be written. Confidential Information findings are scored directly against Impact row 3.

Where a reviewer meets an unscoreable risk on such an axis, the verdict is **FAIL of the review**, not a pass with a note: the review has established that it cannot evaluate the draft, which is a different outcome from establishing that the draft is sound. The finding is raised as a defect in this policy, the missing class is authored, and the draft is re-reviewed against it.

This rule exists because an axis of the external-communications review was dormant — defined in the reviewing agent, unauthored here — and returned PASS on every draft it could not score. How long it had been so is not established; what is recorded, in [P142](docs/problems/open/142-the-credibility-axis-of-the-external-comms-gate-has-no-policy-so-it-cannot-fail.md), is three reviews on 2026-09-04, each reporting the axis unscoreable and each returning PASS. A gate that cannot fail is indistinguishable from a gate that found nothing.

## Risk Appetite

**Threshold: 5 (Medium)** — inclusive. A residual risk score of exactly 5 is within appetite; the gate blocks only scores strictly above 5.

Pipeline actions (commit, push, release) with a residual risk score above 5 (i.e. 6 or above) require remediation or explicit acceptance before proceeding. A residual of exactly 5/25 is within appetite and proceeds without remediation. This threshold reflects the product's status as a revenue-generating service with paying customers and active API consumers.

## Impact Levels

| Level | Label       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Negligible  | No user impact whatsoever. Changes to comments, documentation, formatting, or developer tooling configuration that do not affect the build, publish, or runtime paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2     | Minor       | No end-user impact; only developer experience or build tooling affected. Examples: ESLint or prettier config changes, CI workflow adjustments, dev dependency updates. The npm package, Docker image, and live AWS service continue functioning normally. Alternatively, a credibility defect (see Outbound Credibility / Self-Own) in an outbound artefact whose reach is the repository's own surfaces — a commit message, an issue body, a pull-request body or discussion text — which is permanent and externally visible, and is read by whoever seeks it out rather than delivered to adopters.                                                                                                                                                                                                      |
| 3     | Moderate    | npm publish pipeline, Docker image build, or AWS deployment pipeline disrupted — new versions cannot be released or deployed, but existing npm installations, running Docker containers, and the live RapidAPI service continue operating on their current version. Alternatively, confidential business metrics (revenue, user counts, pricing, traffic volumes) committed to the public repository — an information disclosure that requires immediate remediation (force-push or history rewrite) but does not affect service availability. Alternatively, a credibility defect (see Outbound Credibility / Self-Own) on a consumer-facing surface — a changeset body, a release note, an advisory, or published package content — which reaches adopters rather than only the repository's own history. |
| 4     | Significant | Address search, autocomplete, or API responses degraded for end users — RapidAPI consumers receive incorrect results, missing addresses, elevated error rates, or timeouts. Alternatively, the npm package or Docker image installs or starts but produces incorrect address data or fails for a subset of operations. Paid and free-tier consumers are affected.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 5     | Severe      | Complete service outage of the live RapidAPI API, G-NAF index corruption or OpenSearch data loss requiring re-indexing, security vulnerability exposed in the public npm package or Docker image, or loss of revenue-generating capability affecting paid subscribers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Likelihood Levels

| Level | Label          | Description                                                                                               |
| ----- | -------------- | --------------------------------------------------------------------------------------------------------- |
| 1     | Rare           | Change is trivial, isolated, and well-understood. Very low chance of introducing a defect.                |
| 2     | Unlikely       | Change is straightforward with a clear scope. Low chance of unintended side effects.                      |
| 3     | Possible       | Change has moderate complexity or touches multiple concerns. Reasonable chance of introducing an issue.   |
| 4     | Likely         | Change is complex, spans multiple modules, or alters behaviour in ways that are hard to predict.          |
| 5     | Almost certain | Change is high-complexity, touches critical paths, or modifies behaviour with wide-reaching dependencies. |

## Risk Matrix

Residual risk = Impact x Likelihood (after controls are applied).

| Impact \ Likelihood | 1 Rare | 2 Unlikely | 3 Possible | 4 Likely | 5 Almost certain |
| ------------------- | ------ | ---------- | ---------- | -------- | ---------------- |
| 1 Negligible        | 1      | 2          | 3          | 4        | 5                |
| 2 Minor             | 2      | 4          | 6          | 8        | 10               |
| 3 Moderate          | 3      | 6          | 9          | 12       | 15               |
| 4 Significant       | 4      | 8          | 12         | 16       | 20               |
| 5 Severe            | 5      | 10         | 15         | 20       | 25               |

### Label Bands

> This file bands 5 as **Medium**, where the shared scoring system bands 3-5 as Low. The divergence is deliberate and confined to the LABEL: the appetite is numeric and the gate blocks strictly above 5 under either banding, so no pass or fail turns on it. It is stated here rather than reconciled because moving the boundary would change how the appetite line reads and would reclassify problem-ticket severities, which is a decision of its own and not part of this amendment.

| Score Range | Label     |
| ----------- | --------- |
| 1-2         | Very Low  |
| 3-4         | Low       |
| 5-9         | Medium    |
| 10-16       | High      |
| 17-25       | Very High |

This risk matrix is referenced by both the **risk-scorer agent** (pipeline risk assessment) and the **problem management process** (problem severity classification via the `/problem` skill).
