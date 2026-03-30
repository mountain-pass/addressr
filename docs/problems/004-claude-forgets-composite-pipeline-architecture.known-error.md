# Problem 004: Claude forgets composite pipeline architecture

**Status**: Known Error
**Reported**: 2026-03-26
**Priority**: 20 (Very High) — Impact: Significant (4) x Likelihood: Almost Certain (5)

## Description

Claude repeatedly fails to apply the composite pipeline architecture ("aggregates ARE events") when implementing changes to the game aggregate pipeline. Despite ADRs 002 (layered projections), 027 (client-side event projection), and 034 (universal three-tier caching) documenting this architecture, Claude implements incorrect patterns that break production.

Incorrect patterns Claude defaults to:
1. **Direct cache invalidation** instead of pipeline propagation (deleting LRU/snapshot instead of flowing aggregates through projectors)
2. **Separate event sources** instead of composite streams (two RestEventSource instances instead of one)
3. **`materializeFromScratch`-only enrichment** — computing plays/score outside the projector and storing in WeakMaps, instead of making the projector handle aggregate inputs incrementally
4. **Brute-force fixes** — when a pipeline bug is found, Claude reaches for cache invalidation or reverts instead of fixing the pipeline itself

## Symptoms

- Game page broke in production (v0.26.1) after composite pipeline refactoring
- Revert deployed to production (v0.26.3) that didn't fix the underlying issue
- Multiple hours spent debugging before identifying the real root cause (P034: plays not in cached aggregate)
- When P034 was identified, Claude's first instinct was to invalidate the cache + delete the snapshot — not to fix the pipeline
- Risk scorer rated the broken refactoring at 3-4/25 (Low) — failed to catch the architectural violation

## Workaround

User must review Claude's pipeline-related code changes carefully and redirect when incorrect patterns are applied. This is time-consuming and error-prone.

## Impact Assessment

- **Who is affected**: Developer (user) — wasted time on debugging and rework
- **Frequency**: Every time Claude modifies the game/play pipeline (multiple times per session)
- **Severity**: Very High — leads to broken production, unnecessary reverts, and lost development velocity
- **Analytics**: This session: 3+ failed deployments, 1 production outage, multiple reverts

## Root Cause Analysis

### Preliminary Hypothesis

1. **ADR knowledge not actionable**: The ADRs describe WHAT the architecture is, but not HOW to extend it. There's no step-by-step recipe for "add a new aggregate to the connected pipeline." Claude reads the ADRs but doesn't extract the implementation pattern.

2. **Missing architectural checklist**: The architect agent checks for ADR compliance but doesn't enforce the specific pattern: "if your aggregate includes child-derived data, it MUST flow through a composite (#suffix) with a compositeUpdater, and the parent projector MUST accept the composite as input."

3. **WeakMap pattern is a code smell**: Storing plays/score in WeakMaps side-channels instead of through the projector pipeline is the original architectural violation. The game aggregate was never properly connected to the play pipeline — `materializeFromScratch` was a shortcut that bypassed the architecture.

### Additional Evidence (P039 incident, 2026-03-26)

When asked to fix P039 (analysis page ignoring play corrections), Claude proposed adding `structuredPlays` handling to the `domainEvents` derived store — a parallel transcript-parsing chain that bypasses the composite pipeline. The architect agent approved this fix without flagging it as an architectural deviation. The correct fix: derive analysis from `gameAggregate` (which already has correct data via the `#plays` composite), not from re-parsing transcripts.

This demonstrates:
- Claude's default instinct is to patch the existing (wrong) code path, not to use the pipeline
- The architect agent does not detect parallel data derivation chains that bypass composites
- The architect agent does not check: "is this data already available from an aggregate in the pipeline?"

### Investigation Tasks

- [x] Investigate root cause — confirmed: game projector doesn't handle play aggregate inputs
- [x] Fix P034 by properly connecting plays to the game pipeline (shipped v0.26.4)
- [x] Add memory/feedback entry for composite pipeline pattern
- [x] Update ADR 002 with explicit confirmation criterion prohibiting parallel derivation chains
- [x] Remove the `domainEvents → projection` chain from game.ts — projection now derives from `playAggregates` directly via `playAggregatesToDomainEvents()`

## Fix Strategy

1. **Done (P034)**: Added `#plays` composite suffix, `PlaysListAggregate`, extended `gameProjector` — shipped v0.26.4
2. **Done**: Added feedback memory for composite pipeline architecture
3. **Done**: Added confirmation criterion to ADR 002 prohibiting parallel derivation chains. The architect agent now enforces this via the ADR's Confirmation section.

## Fix Released

All investigation tasks complete. The parallel `utterances → domainEvents → projection` chain has been removed from `game.ts`. The `projection` store now derives directly from `playAggregates` (composite pipeline output) via the shared `playAggregatesToDomainEvents()` function extracted from `game-projector.ts`. The architect agent enforces ADR 002 confirmation criterion #2 (no parallel derivation chains). Awaiting user verification.

## Related

- Problem 034: Game page plays not rendering (the specific bug caused by this architectural gap)
- ADR 002: Use layered projections including projection-on-projection
- ADR 027: Client-side event projection
- ADR 034: Universal three-tier aggregate caching
- `src/lib/store/aggregate-cache.ts` — the connected pipeline cache
- `src/lib/server/games.ts` — gameConfig (missing `#plays` composite)
