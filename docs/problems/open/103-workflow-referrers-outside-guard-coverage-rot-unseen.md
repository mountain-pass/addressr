# Problem 103: Workflow referrers outside guard coverage rot unseen

**Status**: Open
**Reported**: 2026-08-18
**Priority**: 8 (Medium) — Impact: 2 × Likelihood: 4 — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: M — derived at capture per Step 4a
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

> **2026-08-20 — `perf-regression.yml` was deleted (ADR-051), so this ticket's worked example no longer
> exists. The class is untouched.** The referrer-rot gap it describes — a `node -e` import, a bare script
> path, or prose stale in meaning while resolving fine — is unaffected by which workflow happened to
> demonstrate it, and ten scheduled workflows plus every other referrer surface remain in scope. Retained
> rather than re-voiced: the six-night outage is a past event and the record of it stays accurate.

`.github/workflows/perf-regression.yml` has now broken twice at the same site, and **both times it was found by human review rather than by a test**.

1. **2026-08-12 to 2026-08-17** — `npm run genversion` stopped resolving after the ADR-046 restructure moved the script into the `@mountainpass/addressr` workspace. Six consecutive nightly failures, unread. Found by an unrelated `gh run list`.
2. **2026-08-18** — a `node -e` body carried an explanatory comment that broke the step two ways at once: backticks inside the double-quoted shell string became command substitution, and `#` is not a JavaScript comment so node threw `SyntaxError`. Introduced _while fixing the first defect_. Found by risk scoring.

The `npm run` half is now guarded (`workflow-npm-scripts-resolve.test.mjs`). Two narrow shapes of the `node -e` half are guarded as of the second defect — a `#` line and a backtick inside the body. **The general class is not.**

## Symptoms

1. A `node -e` body can be syntactically invalid ESM and nothing catches it. The current guard checks two specific shapes, not that the body parses.
2. An `await import()` specifier inside such a body can name a path that does not exist. That is exactly defect 1's sibling — the second unrepointed ADR-046 referrer in the same file — and it is listed as NOT COVERED in ADR-048's Confirmation.
3. Bare script paths (`scripts/foo.sh`) and `npx` invocations in workflows are unguarded entirely.
4. All of it is cache-masked and `schedule`-only on this workflow, so failures reach nobody (P101).

## Workaround

Human review, which has caught both instances and is the reason this ticket exists rather than a third outage.

## Impact Assessment

- **Who is affected**: the maintainer relying on nightly perf signal; anyone whose tree move silently invalidates a workflow referrer.
- **Frequency**: twice at one site in seven days, both traceable to one restructure.
- **Severity**: Minor. Confined to CI tooling — gates no push, blocks no release, touches no publish or deploy path. The cost is a guard believed to be watching that is not.
- **Analytics**: 4 defects across 3 files, 0 caught by test — recounted 2026-08-19 when two further sections landed. A count correction, not a rescore; Priority and WSJF are unchanged and a rescore should be a deliberate act, not a tidy-up inside another ticket's close.

## Root Cause Analysis

A workflow is YAML containing shell containing, sometimes, JavaScript. Each nesting level has its own comment syntax, its own quoting rules and its own idea of what a path is relative to — and nothing validates the inner levels. The `npm run` guard works because `npm run <script>` is a flat, greppable shape; a `node -e` body is a program, and checking a program needs a parser rather than a regex.

### Investigation Tasks

- [ ] Extract every `node --input-type=module -e "…"` body under `.github/workflows/**` and assert it **parses as ESM** (`node --check` with `--input-type=module`, or `acorn`). Replaces the two shape checks with the real property.
- [ ] Resolve every `await import()` / `import ... from` specifier in those bodies against the filesystem, honouring that `node -e` runs with cwd at the repo root while module-relative imports elsewhere do not.
- [ ] Extend to bare script paths (`scripts/*.sh`, `.husky/*`) and `npx` invocations named in `run:` blocks.
- [ ] Once the general guard lands, **narrow ADR-048's NOT-COVERED list to match** — it currently names `node -e` imports, bare paths and `npx` as uncovered, and that statement must stay true or become false loudly.
- [ ] Consider whether the same nesting problem exists in `release.yml`'s `node -e` blocks, which are the twins of the ones that broke here.
- [ ] **Extend the referrer corpus to SOURCE-FILE COMMENTS, a surface nothing currently watches and which
      ADR-048's NOT-COVERED list does not even enumerate.** Found 2026-08-19: the lint-debt block at the head
      of `packages/addressr/service/address-service.js` linked P084 as `../docs/problems/open/084-…`, which
      from `service/` resolves to `packages/addressr/docs/…` and has never existed. `doc-links-resolve` scans
      `docs/**` plus five named repo-root files, so a `.js` file under `packages/` is outside its corpus
      entirely. Corrected to `../../../docs/…` in the same commit, but the class is open: this is ADR-048's
      first Reassessment Criterion firing — _a moved-path referrer rots again in a class the guards do not
      cover_ — and it is worse than the enumerated gaps because ADR-048's list would let a reader conclude
      source comments were considered and excluded, when they were never considered at all. The link also
      carries the mutable `open/` segment (R018), so it breaks again when P084 transitions, silently.

## Dependencies

- **Blocks**: (none)
- **Blocked by**: (none)
- **Composes with**: P101 (a scheduled workflow's loud failure has no reader) — detection and delivery are separate halves; a guard nobody reads is P101's problem, a defect no guard sees is this one.

## The doc-link guard's own corpus floor is a tautology, 2026-08-19

Found while closing P104, and left UNFIXED here on purpose - the fix drags unrelated pre-existing lint
debt into a ticket-close commit and deserves its own.

`test/js/__tests__/doc-links-resolve.test.mjs` builds `ROOT_DOCS` from a five-name list, filters it with
`existsSync`, and floors the corpus at `ROOT_DOCS.length > 0`. `PROBLEM-MANAGEMENT.md` is in the list and
does not exist in this repo - the problem lifecycle lives in the wr-itil plugin skill - so the scan has
been running over four of its five named files, silently, for as long as the list has been wrong.

**An obvious repair does not work, and mutation testing is what showed it.** Asserting that every name in
the list resolves on disk, and that no entry was dropped by the filter, reports BLIND under mutation:
deleting `'AGENTS.md'` shrinks the list AND the loop that walks it, so both assertions pass over a smaller
corpus. A check derived from the thing it checks cannot fail. This is the ticket's own class - a guard
whose coverage can shrink with nothing noticing.

**What does work, verified before being reverted:** reconcile the corpus against the FILESYSTEM. Read the
repo-root `*.md` entries and assert every one is either in the scanned list or in an explicit
out-of-scope list. Deleting a name then leaves that file in neither set and fails; adding a new root
document fails until someone classifies it. Mutation-tested: deleting `'AGENTS.md'` and `'CLAUDE.md'` were
both CAUGHT, and creating an unclassified root markdown file failed the guard.

- [ ] Reconcile `ROOT_DOCS` against the filesystem rather than against itself, and drop
      `PROBLEM-MANAGEMENT.md` from the list with a note saying the lifecycle lives in the plugin skill.
- [ ] Clear the pre-existing lint errors the change surfaces (`no-unreadable-for-of-expression`,
      `no-await-expression-member`, `prefer-iterator-to-array`, `consistent-boolean-name`,
      `no-break-in-nested-loop`). They are years old and were never reported because lint-staged lints
      only STAGED files and this one had not been touched since those rules landed - the same mechanism
      that hid three `no-undef` errors in `test/k6/regression.js` until 2026-08-19.

## A ticket's prose about ANOTHER ticket's state has no check, 2026-08-19

Distinct from this ticket's own subject (referrers outside guard coverage) and recorded here because it
is the same family: a claim nothing reconciles.

One ticket routinely states another's lifecycle state in prose - shapes like `P104 is closed and verified`, `carried
on its close`, `found while closing P104`. Nothing checks any of it. `wr-itil-reconcile-readme`
reconciles the README index against each ticket's OWN Status field and never reads a sibling's prose;
`doc-links-resolve` proves a link RESOLVES and cannot see a false claim about a target that resolves.

**The evidence is operational, not a tally.** An earlier version of this section counted "six instances"
of false lifecycle prose. That count does not survive scrutiny: its headline example (P032 saying P104 was
closed) turned out to be TRUE once P104 closed, and rescuing the number by redefining "instance" from a
false statement to an unreconciled one makes it not six but every lifecycle sentence in the corpus. The
count is withdrawn.

What stands without it: **P104 moved three times in one day** - open to closed, to verifying, back to
closed. Each move rewrote lifecycle prose in three sibling tickets and the README. The sweep was believed
complete all three times and was not; residues were found by reading on each pass, including two inside
the commit performing the correction. No tool can tell a swept file from an unswept one, because none of
these statements is a link and none is a number.
The canonical cell already exists and is generated rather than remembered: a ticket's `**Status**` field
plus its lifecycle directory. So unlike the risk-register version of this shape, a check here needs no
opt-in declaration step that someone can forget.

- [ ] Assert, across `docs/problems/**`, that any statement of another ticket's lifecycle state agrees
      with that ticket's own Status field and directory.

      **Mutate the TARGET, not the prose.** The obvious spec - "restore a known-false sentence and confirm
              the check catches it" - was written here first and is unusable: its example (P032 recording P104 as closed
              and verified) became TRUE when P104 closed, so restoring it is a no-op and the mutation cannot fail.
              A guard whose falsification test cannot fail is the thing this ticket is about.
              Instead flip `closed/104-*.md`'s `**Status**` to `Verification Pending`, or `git mv` it to
              `verifying/`, leaving every sibling's prose untouched, and assert the guard names
              `docs/problems/known-error/032-*.md` and the line. That reproduces the real defect direction - the
              target moved and the prose did not - and needs no false sentence to be authored.

              **The matcher must survive its own worked example.** Against the live sentence in
              `known-error/032-*.md`, a literal-phrase list fails four independent ways: the text reads "verified
              **against**" where the obvious pattern says "verified by"; the state word is wrapped in markdown
              bold (`is **closed**,`); a 57-character parenthetical sits between `P104` and the claim; and the
              claim STRADDLES A HARD WRAP, with "verified against dispatched" ending one line and
              "run 32250954868" beginning the next - so a line-oriented matcher misses it even after the other
              three are handled. Normalise whitespace before matching, and decide which line a multi-line claim
              is reported at rather than assuming one.

              (An earlier version of this paragraph said 47 characters and named three ways. Both were wrong,
              inside the spec for the guard that would catch exactly this.)

## Related

- **ADR-048** (`docs/decisions/048-moved-path-referrers-resolved-by-executable-guard.proposed.md`) — its Confirmation names this exact gap as NOT COVERED, and its reassessment criterion has now fired: a moved-path referrer rotted again in a class the guards do not cover. ADR-048 lists the likely forms as a `node -e` import, a bare script path, or prose that is stale in meaning while resolving fine — and NONE of the three is what fired here. The third form is scoped to referrers that go stale in meaning _while resolving fine_; this one does not resolve at all — `../docs/problems/open/084-…` from `packages/addressr/service/` points at `packages/addressr/docs/`, which has never existed. That is a syntax failure, and ADR-048 draws the meaning-versus-syntax axis explicitly. So this is a FOURTH form its list does not enumerate: a link kind the guards DO cover, on a surface their corpus excludes. The distinction decides the remedy — ADR-048 prescribes widening the guard, and reading this as the third form aims that widening at meaning-detection, which ADR-048 itself calls the harder half, instead of the cheap fix already named above: extend `doc-links-resolve`'s corpus to source-file comments. An earlier version of this bullet presented the criterion as a single quoted sentence, splicing ADR-048's two sentences together with an em-dash and stopping mid-enumeration. The invented wording is not restated here - describing the defect is enough, and reproducing it puts the wrong string back in the corpus for the next search to find. Every word was ADR-048's; the sentence was not, and the truncation narrowed the criterion in the direction that weakened this ticket's own argument.
- **ADR-046** — the restructure both defects trace to.
- **P101** — why neither defect was noticed from the workflow's own output.
- **P032** — the perf-regression probe whose signal both defects invalidated.
- `test/js/__tests__/workflow-npm-scripts-resolve.test.mjs` — the partial guard; its header states the limit this ticket closes.

Captured via `/wr-itil:capture-problem`. Hang-off check: P101 shares the file and the restructure but owns the _audience_ for a failure, not the _detection_ of a defect; this proceeds as a sibling.
