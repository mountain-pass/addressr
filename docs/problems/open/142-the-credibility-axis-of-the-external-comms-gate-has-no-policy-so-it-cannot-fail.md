# Problem 142: The credibility axis of the external-comms gate has no policy, so it cannot fail

**Status**: Open
**Reported**: 2026-09-04
**Priority**: 8 (High) — Impact: Moderate (3) × Likelihood: Likely (4). Impact 3: the gate's whole job is to stop a careless or self-damaging statement reaching a permanent public surface, and half of it is inert; the harm is reputational rather than to service or data, so not 4. Likelihood 4: it is not a latent condition waiting on a trigger. It fired three times in one session, on three separate drafts, and downgraded real findings to prose every time.
**Origin**: internal
**Effort**: S — author one section in a policy file. The work is deciding the classes, not writing them.
**WSJF**: 8.0 — (8 × 1.0) / 1
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

The `wr-risk-scorer:external-comms` agent is defined as reviewing external-facing prose "on two composing
axes per RISK-POLICY.md — confidential-information leaks AND outbound credibility / self-own errors (asking
for already-held info, restating prior as new, careless mistakes)".

`RISK-POLICY.md` authors no `## Outbound Credibility / Self-Own` section. Its headings are Business Context,
Confidential Information, Risk Appetite, Impact Levels, Likelihood Levels and Risk Matrix.

Because a finding must cite an authored class, the second axis has nothing to cite. It cannot FAIL. The gate
therefore passes on that axis by construction, for every draft, forever.

## It is not theoretical — measured on 2026-09-04

Three external-comms reviews ran on three drafts in one session. All three reported the axis dormant. Between
them they reported, **as prose rather than as findings**:

- A commit message asserting that withdrawn configuration "never reached the provider", when the project's
  own committed ledger recorded a hand-sent verification message that did. Falsifiable from the repository,
  in permanent public history.
- The same message claiming a ledger recorded a gate as MISSING when its class column read PARTIAL.
- A changeset enumerating two removed items where the change removed four — on the changeset surface, which
  reaches CHANGELOG, the release PR, the GitHub release page and every published tarball.

Each was corrected, because the reviews reported them in prose and a human-directed correction pass acted on
that prose. **None of them would have been corrected by the gate**, which returned PASS all three times.

## Why the reviewers were right to refuse

Every review declined to score by analogy, and said so explicitly: "the fix is to author the class in
`RISK-POLICY.md`, not to have a reviewer invent it". That is correct behaviour and it is not the defect. A
reviewer inventing classes at review time is a worse failure than a dormant axis, because it is
unpredictable and unappealable. The defect is upstream, in the policy the reviewers correctly read.

## This is the green-by-construction class

A check that returns PASS having examined nothing it could fail on is indistinguishable, from the outside,
from a check that examined everything and found nothing. That is the same shape as a zero-match test suite
exiting 0, and as the licence gate that scanned an empty tree. The distinguishing question is the one this
project already asks elsewhere: **what would this check have returned had the defect been present?** For
this axis the answer is PASS, every time, which means the three real errors above were caught by a human
reading prose and not by the gate that exists to catch them.

## A second, narrower gap in the same file

The reviews also found that `## Confidential Information` authors exactly one class, business metrics: user
counts, subscriber numbers, revenue figures, pricing tier details and traffic volumes.

An **operational-weakness disclosure** is therefore uncovered. On 2026-09-04 a commit message and a changeset
stated, on a public repository, that a paid channel has no fault notification, that alert coverage is
missing, and that no replacement is built — alongside the topology of the alerting fabric. A reviewer named
this and declined to score it, correctly, for the same reason.

Recorded here as a second item rather than a second ticket because the fix is one editing session in one
file. It is genuinely the narrower of the two: that disclosure was also load-bearing honesty, since the
project's own rule about what counts as a control is what forces the ledger to read MISSING rather than
partially covered. Suppressing it would trade an uncovered exposure for a governance defect. The question is
whether it should be a considered disclosure rather than an unconsidered one.

## Investigation Tasks

1. Decide whether the credibility axis should exist at all. If the agent's two-axis definition is the
   aspiration and not the intent, the honest fix is to narrow the agent rather than author the policy —
   but the axis must then stop being advertised, because a described-and-inert check is worse than an
   absent one.
2. If it should exist, author `## Outbound Credibility / Self-Own` with real classes. The three measured
   errors above are the starting corpus and each names a class: a claim falsifiable from the repository's
   own committed artefacts; a count or enumeration that does not match the change; a statement of state
   more confident than the evidence supports.
3. Decide whether an operational-weakness or security-posture disclosure class belongs in
   `## Confidential Information`, and if so how it coexists with the rule that forces honest MISSING
   readings in the launch ledger.
4. Check whether any other agent in the scorer family advertises an axis the policy does not author. This
   was found by reading three review outputs in one session; nothing detects it.
5. Consider whether a review that reports an axis as dormant should be a FAIL of the gate rather than a
   PASS with a note. A gate that cannot evaluate half its mandate has not passed; it has abstained.

## Related

- [P106](106-license-compliance-gate-scans-an-empty-tree-and-exits-zero.md) — the same class in a different
  gate: a check that passes having examined nothing. That one scans an empty tree; this one reads a policy
  with an empty section. Whatever principle settles one should settle both.
- [P133](133-check-deps-has-failed-on-every-release-run-for-a-week-so-its-vulnerability-report-has-no-reader.md)
  — a check whose signal nobody reads. This is a check that produces no signal to read. Adjacent, not the
  same: P133's job examines everything and is ignored; this axis examines nothing and is trusted.
- `RISK-POLICY.md` — the file the fix lives in, in its entirety.

## Notes

Found by reading the output of three `wr-risk-scorer:external-comms` reviews during the managed-channel
notification withdrawal on 2026-09-04, not by any check. All three said the same thing in the same words and
it took three to notice, which is itself worth recording: a reviewer honestly reporting its own inability to
score reads, at a glance, exactly like a reviewer finding nothing wrong.

Inflow discipline: checked against the open backlog before capture. P106 is the nearest and was rejected as a
parent on fix locus — its remedy is in the licence gate's own scanning logic, this one's is in
`RISK-POLICY.md`, and neither fix touches the other's file. P133 is adjacent by shape and unrelated by cause.
