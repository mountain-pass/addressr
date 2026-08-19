# Problem 109: A gate-blocked invocation runs nothing, so a bundled `git add` commits a stale index

**Status**: Open
**Reported**: 2026-08-20
**Priority**: 16 (High) — Impact: 4 × Likelihood: 4 — derived at capture. Impact 4 scores the exposure, not what luck spared: both realised instances were test files, but nothing in the mechanism is content-scoped, and the same bundling shape is used on release and deploy invocations where a half-landed workflow or Terraform edit falsifies a deploy. This is the correction P107 applied to its own Impact on the day it was captured. Likelihood 4 on observation — two instances in one session, consecutive, deterministic given the bundling, and bundling was the default habit. A third is attributed rather than observed and the rating does not lean on it.
**Origin**: internal
**Effort**: M — a PreToolUse guard plus its tests; the shape is known and the guard is small, but it sits in hook surface with its own test tier.
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

**A commit can land content that does not match its own message, exit 0, and pass a full green suite.** It happened twice in one session, and a third earlier instance is attributed rather than observed.

The mechanism is confirmed by experiment, not inferred.

The risk gate and the external-comms gate are PreToolUse hooks: they reject the **whole Bash tool call** before the shell starts. So when `git add <paths> ; git commit ...` is bundled into one invocation and the gate blocks it, **the `git add` never executes**. Re-running only the `git commit` afterwards — the natural move after satisfying the gate — commits whatever an _earlier_ add left in the index. The message describes the new work; the commit carries the old.

**Probe that settles it**: `echo PROBE > file; git commit --allow-empty` under a live gate. The commit is blocked and the file is never created. Nothing in a blocked invocation runs.

**Confirmed against artefacts.** lint-staged writes a backup stash whose second parent is the INDEX at commit time. `git fsck --unreachable` still held both: `b446b085` (during `477e8b9b`) and `e692d967` (during `49ebfddf`). For `477e8b9b` the working-tree half contains the new content five times and the index parent contains it **zero** times. The earlier split shows the identical signature. Never staged.

**lint-staged is exonerated.** Its `Hiding unstaged changes to partially staged files` line made it look guilty and is ordinary behaviour for a file carrying unstaged hunks — which it carried precisely because the add never ran.

### Why it stayed invisible, which is the actionable half

- **The pre-commit check never ran, and its previous result was carried forward.** An earlier version of
  this ticket claimed `git diff --stat <path>` is _non-discriminating_ — that it returns empty both when
  content is staged and when the add never happened. **That is false, and this ticket's own evidence
  refutes it.** The stash analysis above records the worktree holding the content five times against zero
  in the index; worktree ≠ index is exactly the condition under which `git diff --stat` prints a row. At
  commit time the predicate was NON-empty and would have fired.
  What actually happened is the same mechanism one level up: the `git diff --stat` was itself bundled into
  the blocked invocation, so it never executed, and the clean result cited afterwards came from an earlier
  invocation predating the last edit. A stale verification, not a blind one.
- **The post-commit check answered a different question.** `git show --stat HEAD` confirms a line count landed, never _which_ content. Reading `git show HEAD:<path>` is what corrected an over-report — grepping a commit's diff answers what it ADDED, not what the file contains.
- **CI is structurally blind to this class.** Both losses were assertions being _strengthened_, and a suite cannot redden on the absence of a check that was never added. The full suite was green at 627/627 through both.

## Symptoms

1. A commit's subject names a change the commit does not contain.
2. `git status` still shows the file modified immediately after a successful commit.
3. lint-staged prints `Hiding unstaged changes to partially staged files` — a symptom, not the cause.
4. The full test suite is green throughout, because the lost content was a guard-tightening.

## Workaround

Never bundle a staging verb with `git commit` in one invocation. Stage in its own call, verify with `git diff --cached`, commit alone, then verify with `git show HEAD:<path>`.

**This workaround is not the fix, and recording why matters more than the workaround does.** It is a discipline, and the discipline is exactly what failed: it is already written to session memory as `feedback_lint_staged_changeset.md`, it caught both instances, and it prevented neither — the first catch did not prevent the second occurrence forty minutes later. See the Fix Strategy.

## Impact Assessment

- **Who is affected**: the maintainer, and any reader of the history — a false commit subject is read as authoritative.
- **Frequency**: two observed instances (`49ebfddf` and `477e8b9b`, consecutive, 2026-08-19/20) plus one attributed (`ef66d39`, 2026-04-15 — attributed, not observed; see P011 in Related for the competing cause this ticket cannot exclude).
- **Severity**: High on exposure. The observed losses were test files; the mechanism is content-agnostic and the same bundling shape is used on release and deploy paths.
- **Analytics**: 2 observed + 1 attributed, 2 in one session, 0 caught by CI, 0 prevented by the standing discipline.

## Root Cause Analysis

A PreToolUse hook rejects the entire Bash invocation before the shell starts. Any command bundled with a blocked `git commit` — including the `git add` that would stage the work, and including any verification bundled alongside — does not run.

The defect survived because **the verification was bundled into the same blocked invocation**, so it did
not run and its earlier result was cited as though current.

An earlier version of this ticket called that a _third kind_ of check failure — a predicate unable to
distinguish the two outcomes. That framing is withdrawn: the predicate discriminates, and the claim was
asserted from memory rather than from what the check computes, which is this ticket's own thesis applied
to this ticket.

**What remains distinct, and it is narrower and more useful:** a gate-blocked invocation silently
invalidates every verification bundled with it. The check does not report a wrong answer — it reports
nothing, and the reader supplies the last answer they remember. That is a stale-result failure, so this
instance sits at least partly inside P107's class rather than outside it. See Related for what that does
to the hang-off verdict.

**A class-scoped sweep is only as good as the enumeration of classes, and nothing generates that.** This
ticket's own corrections moved three claim classes: the evidence base (two observed plus one attributed),
the falsification verdict (which of P011's two records is falsified), and the correction's own status. The
sweep run after the first correction enumerated the first class and swept it completely — and left one site
inverted and three sites stating a settled correction as pending, both in classes nobody had listed. That is
the same ceiling the risk register recorded for itself on 2026-08-10 — the next unmechanised step being not a
wider reading radius but generating the list of moved facts. Dated rather than stated in the present tense,
because a claim about another document's open gaps is true on the day and false on that document's next
edit, which is this ticket's own subject one file over.

### Investigation Tasks

- [ ] **Build the mechanical control: a PreToolUse guard that refuses any Bash invocation carrying both a staging verb (`git add`, `git stage`, `git commit -a`) and `git commit`.** This is the fix. The discipline is not.
- [ ] Mutation-test the guard by attempting the exact bundled shape and confirming it is refused, and by confirming a standalone `git commit` is permitted.
- [ ] Decide whether the guard should also refuse bundling _verification_ with `git commit`. The same mechanism silently skips a bundled `npm test` or `git diff --cached`, which is how a stale "clean" result gets carried forward into a scoring prompt.
- [ ] Consider whether the post-commit discipline should be mechanised too — a hook comparing the commit's own diff against nouns in its subject line is probably over-clever, but "did anything remain modified in the paths this commit touched" is cheap and would have fired on both observed instances.

## Dependencies

- **Blocks**: nothing.
- **Blocked by**: nothing.
- **Composes with**: P107 — overlapping class, see Related. The hang-off verdict was PROCEED_NEW on a discriminator this ticket has since withdrawn.

## Related

Captured via `/wr-itil:capture-problem`. Hang-off check dispatched fresh-context against P107, P011 and P103; verdict **PROCEED_NEW** — but that verdict rested on a discriminator this ticket has since withdrawn (see the P107 entry below), so a fresh check is flagged rather than the verdict being treated as settled.

- **[P011](../closed/011-lint-staged-drops-changeset-files.md)** — closed, and **possibly retro-explained by this ticket, not reopened**. The retro-attribution is an ATTRIBUTION, not an observation, and it is not safe to promote: P011 line 43 offers a sufficient competing cause this ticket cannot exclude — `git add -u` stages only tracked modifications and would have skipped `.changeset/p009-...md`, a new file, with no gate involved at all. The mechanism here also requires a PreToolUse Bash gate to have existed on 2026-04-15, and the earliest gate tickets in this backlog cluster at 2026-04-19. So the evidence base is **two observed instances plus one attributed**, not three. Priority 16 is unchanged by that correction: Likelihood 4 stands on the two consecutive same-session instances with the standing discipline failing between them, and P011's Fix Strategy item 1 is falsified by those two alone. Its incident-specific regression test still passes and its exoneration of lint-staged is confirmed here independently, so a reopen is wrong. Two things it records are worth reading against this ticket. Only the Fix Strategy item is falsified — the most-likely-cause note is not:
  - Its root cause stops at a hypothesis — _the authoring agent did not run `git add`_ — and never establishes **why**. This ticket offers a candidate mechanism for it, and no more than that: P011's most-likely-cause note has two limbs and only one competes: the limb this ticket supplies a mechanism FOR is _the agent did not run `git add` at all_, while _the agent ran `git add -u`_ — which skips a new file in an untracked directory — is sufficient on its own and is not excluded. So that limb is **not** falsified; it survives as the competing cause. Neither claim touches P011's confirmed root cause, which a literal replay settled.
  - Its Fix Strategy item 1 names the session-memory reminder as _"the primary defense"_. That defence has now failed twice consecutively in one session. Its deferred item 3 — a pre-push hook, deferred because _"the session memory check is cheaper and already effective"_ — rests on a premise that no longer holds.
- **[P107](107-a-verification-vouches-only-for-the-state-it-ran-against.md)** — **overlapping, and the
  hang-off verdict that separated them no longer stands as argued.** The arbiter's discriminator was: apply
  P107's open task (b) — record the state a verification ran against and compare before citing — to
  `477e8b9b`, and the index tree at check time and commit time are the same tree because the add never ran,
  so the comparison returns "unchanged, still valid" and the wrong commit ships. That test was applied to
  the INDEX TREE. Applied to the CHECK'S OWN PROVENANCE it comes out the other way: the `git diff --stat`
  never ran, and recording which invocation produced a cited result is exactly what P107 task (b) asks for.
  So P107's remedy is **not** inert here, and this instance is at least partly P107's class.
  What is left over — a gate rejecting a whole invocation so that bundled commands silently do not run — is
  a mechanism P107 does not own, and the fix locus (a PreToolUse guard) is one P107's tasks do not reach.
  The honest disposition is overlapping-not-absorbed, and **whether P109 should fold into P107 deserves a
  fresh hang-off check**, because the original verdict was reached on a premise this ticket has since
  withdrawn. The withdrawal is final; the re-check is owed and unscheduled.
  - Recorded rather than suppressed: P107's `find -size +0` footnote is a genuinely blind predicate and
    P107 labels it "this ticket's own class", which sits oddly with P107's own Root Cause Analysis about
    state moving between check and citation. That is P107's to reclassify, not this ticket's.
- **[P103](103-workflow-referrers-outside-guard-coverage-rot-unseen.md)** — shares the abstract "a check that cannot fail" shape via its `ROOT_DOCS` tautology, but every one of its Investigation Tasks is bound to workflow bodies and doc-link corpora, and it already carries two sections its own text flags as squatting.
- **Clustering hint for the next `/wr-itil:review-problems`** — narrowed. A candidate cluster exists on the
  _blind predicate_ axis across two surfaces that hold on their own evidence: P107's `find -size +0`
  footnote, and P103's self-derived `ROOT_DOCS` corpus floor (_"a check derived from the thing it checks
  cannot fail"_). **This ticket's own membership is withdrawn** — its `git diff --stat` was cited as a third
  member and is not one; the predicate discriminates and the failure was staleness. Do not draw a cluster
  parent off it.
  Adjacent and distinct, worth its own capture rather than a third seat here: `problems-readme-wsjf-arithmetic`'s
  ordering check implements the documented sort key but no tier term at all, so the Tier 0 / inbound-reported
  partition README line 8 documents is asserted nowhere. It agrees with the table today only because every row
  is `internal` and the maximum Severity is 16. That is blind now AND wrong later — the first tier-bearing row
  makes it fail a CORRECT table — which is a different shape from a predicate that can never return false.
