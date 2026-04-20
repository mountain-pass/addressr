# P026 baseline — v2.3.0 production queries captured 2026-04-19

Captured via `mcp__addressr__search-addresses` against `addressr@2.3.0`
before the Option K (`fuzziness: 'AUTO:5,8'`) change lands. Each block
lists top-5 results (`pid | sla | score`). Post-deploy diff will rerun
these queries and compare expected/unexpected shifts.

## Query 1 — `495 Maroondah Hwy Ringwood` (#367 case 2)

1. GAVIC422102385 · 495-503 MAROONDAH HWY, RINGWOOD VIC 3134 · 41.12
2. GAVIC424242329 · 485 MAROONDAH HWY · 39.12
3. GAVIC412202869 · 295 MAROONDAH HWY · 39.12
4. GAVIC425523717 · 491 MAROONDAH HWY · 38.25
5. GAVIC421829490 · 403-405 MAROONDAH HWY · 36.99

**Expected post-K**: target range at position 1 unchanged (already first). Adjacent fuzzy matches `485`, `295`, `491`, `405` — all 3-char numbers fuzz-matching `495` — will disappear from results because they lack the `495` token entirely. Sparser, cleaner result list.

## Query 2 — `138 Whitehorse Rd Blackburn` (#367 case 3)

1. GAVIC421894913 · 135-137 WHITEHORSE RD · 36.76 (fuzzy on 138)
2. GAVIC421906954 · 128-132 WHITEHORSE RD · 36.76 (fuzzy on 138)
3. **GAVIC421608208** · **138-144 WHITEHORSE RD** · 32.10 (target, exact 138)
4. GAVIC420479939 · 133 WHITEHORSE RD · 30.11
5. GAVIC413432576 · 128 WHITEHORSE RD · 30.11

**Expected post-K**: target `138-144` at position 1. Fuzzy-adjacent ranges `135-137`, `128-132`, and all `133`, `128`, `118`, `134`, `136` lose numeric fuzz and drop out (none contain `138` token). Result list will be much shorter — only docs with exact `138` or where `138` appears in `sla_range_expanded`.

## Query 3 — `225 drummond st carlton` (#367 case 4)

1. GAVIC423451126 · CARSPACE 225, 255 DRUMMOND ST · 30.39 (tf=2 via 225+255 fuzz)
2. GAVIC421075761 · 205 DRUMMOND ST · 28.52 (fuzzy)
3. GAVIC420761240 · 221 DRUMMOND ST · 28.52 (fuzzy)
4. GAVIC423790248 · 207-221 DRUMMOND ST · 26.99 (fuzzy)
5. GAVIC423451387 · 218-224 DRUMMOND ST · 26.86 (fuzzy)
6. **GAVIC413015604** · **TRAVEL INN HOTEL, 225-245 DRUMMOND ST** · 26.52 (target, exact 225)

**Expected post-K**: target `225-245` rises to position 1 or 2. Carspace drops its tf=2 boost back to tf=1 (no more fuzzy `255`), losing its BM25 lead. Adjacent `205`, `221`, `207-221`, `218-224` all lose numeric fuzz and drop out unless they contain exact `225`. Result list shrinks dramatically.

## Query 4 — `19 Murray Rd Christmas Island` (ADR 025 P007 regression check)

1. **GAOT_717321355** · 19 MURRAY RD, CHRISTMAS ISLAND · 676.53
2. GAOT_717882967 · UNIT 1, 19 MURRAY RD · 608.40
3. GAOT_717882969 · UNIT 2, 19 MURRAY RD · 566.19
4. GAOT_717882971 · UNIT 3, 19 MURRAY RD · 566.19

**Expected post-K**: identical ranking. `19` is 2 chars (AUTO 0 edits already, unchanged), `MURRAY` is 6 chars (AUTO 2 edits, AUTO:5,8 1 edit — fewer false fuzz hits but exact still wins), `RD` 2 chars unchanged, `CHRISTMAS`/`ISLAND` 8/6 chars unchanged or slightly reduced fuzz. ADR 025 P007 invariant holds.

## Query 5 — `16 Gaze Rd Christmas Island` (ADR 025 P007 GAZE RD)

1. **GAOT_718447105** · 16 GAZE RD, CHRISTMAS ISLAND · 708.06
2. GAOT_718446675 · UNIT 3, 16 GAZE RD · 571.96
3. GAOT_718446667 · UNIT 1, 16 GAZE RD · 549.09
4. GAOT_718446672 · UNIT 2, 16 GAZE RD · 549.09
5. GAOT_719093345 · UNIT 6, 16 GAZE RD · 549.09
6. GAOT_717321183 · 16-18 GAZE RD, CHRISTMAS ISLAND · 46.29

**Expected post-K**: non-range `16 GAZE RD` keeps position 1. `GAZE` is 4 chars — loses fuzz with AUTO:5,8 (was AUTO 1 edit). Minor recall regression for GAZE typos, no ranking change on this query.

## Query 6 — `UNIT 1, 19 MURRAY RD` (sub-unit slash-form check)

1. GAVIC421686684 · UNIT 1, 19 MURRAY RD, CROYDON VIC · 83.28
2. GAVIC412065601 · UNIT 1, 19 MURRAY RD, ORMOND VIC · 83.28
3. GAOT_717320593 · UNIT 1, 19 MURRAY RD, POON SAAN OT · 79.29
4. GAOT_717882967 · UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND · 79.07

**Expected post-K**: identical ranking — all tokens (`UNIT`, `1`, `19`, `MURRAY`, `RD`) are already short or exact. No substantive change.

## Query 7 — `1/19 Murray Rd` (slash-form sub-unit)

1. GAVIC421686684 · UNIT 1, 19 MURRAY RD, CROYDON · 96.82
2. GAVIC412065601 · UNIT 1, 19 MURRAY RD, ORMOND · 96.82
3. GAOT_717320593 · UNIT 1, 19 MURRAY RD, POON SAAN · 92.00
4. GAOT_717882967 · UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND · 91.61

**Expected post-K**: unchanged (same token set as Query 6).

## Query 8 — `19 Muray Rd Christmas Island` (5-char typo preservation)

1. **GAOT_717321355** · 19 MURRAY RD · 39.78 (fuzzy on `Muray`)
2. GAOT_717882969 · UNIT 2, 19 MURRAY RD · 36.84
3. GAOT_717882971 · UNIT 3, 19 MURRAY RD · 36.84
4. GAOT_717882967 · UNIT 1, 19 MURRAY RD · 36.79

**Expected post-K**: `Muray` is 5 chars → AUTO:5,8 allows 1 edit → still fuzz-matches `Murray`. Target `GAOT_717321355` remains first. **This case drives the AUTO:5,8 choice (not AUTO:6,8)** — 5-char typo tolerance preserved.

## Query 9 — `104 GAZE RD CHRISTMAS ISLAND` (ADR 026 ranking invariant)

1. **GAOT_718446687** · 104 GAZE RD · 713.81 (exact)
2. GAOT_717321171 · 103-107 GAZE RD · 53.45 (range, sla_range_expanded[1])
3. GAOT_717321170 · 101 GAZE RD · 48.65 (fuzzy)
4. GAOT_718446599 · 105 GAZE RD · 48.65 (fuzzy)
5. GAOT_718446600 · 107 GAZE RD · 48.65 (fuzzy)
6. GAOT_717321172 · 109 GAZE RD · 48.65 (fuzzy)
7. GAOT_718446683 · 100 GAZE RD · 48.58 (fuzzy)
8. GAOT_718446598 · 103 GAZE RD · 48.54 (fuzzy)

**Expected post-K**: non-range `104` stays first. Range `103-107` stays second (via `sla_range_expanded`). All the fuzzy-adjacent `101`, `105`, `107`, `109`, `100`, `103` drop out — they don't contain the `104` token. Much shorter result list, ADR 026 invariant preserved.

## Query 10 — `103-107 GAZE RD CHRISTMAS ISLAND` (canonical range non-regression)

1. **GAOT_717321171** · 103-107 GAZE RD · 637.83
2. GAOT_718446600 · 107 GAZE RD · 60.33
3. GAOT_718446598 · 103 GAZE RD · 60.11
4. GAOT_717321172 · 109 GAZE RD · 56.44 (fuzzy on 103 or 107)
5. GAOT_717321170 · 101 GAZE RD · 56.42
6. GAOT_718446599 · 105 GAZE RD · 56.42
7. GAOT_718446683 · 100 GAZE RD · 56.29
8. GAOT_718446687 · 104 GAZE RD · 56.26

**Expected post-K**: target range stays first (exact 103 AND 107 in sla). Non-range 107, 103 keep their positions (exact tokens). Fuzzy-adjacent 109, 101, 105, 100, 104 drop out (no exact 103 or 107 tokens; 104/105/etc. can't prefix-match).

## Query 11 — `MURRAY RD CHRISTMAS ISLAND` (no-number query)

1. GAOT_717321363 · 9B MURRAY RD · 683.48
2. GAOT_717321356 · 1 MURRAY RD · 683.48
3. GAOT_718041109 · 23 MURRAY RD · 683.48
4. GAOT_717321354 · 16 MURRAY RD · 664.00
5. GAOT_717321355 · 19 MURRAY RD · 664.00

**Expected post-K**: essentially unchanged — all query tokens (`MURRAY`, `RD`, `CHRISTMAS`, `ISLAND`) are 2+ chars; only `MURRAY` (6 chars) and `ISLAND` (6 chars) retain fuzz under AUTO:5,8. Ranking should be stable.

## Query 12 — `3053` (postcode-only, boundary case)

1. GAWA_162242118 · 30536 BRAND HWY · 17.48 (prefix match, not fuzz)
2. GAWA_720413121 · 30536 BRAND HWY · 17.47
3. GAVIC424759907 · UNIT 3053E, 1239 NEPEAN HWY · 16.57
4. GAVIC719113295 · CARSPACE 3053Z, 33 ROSE LANE · 16.57
5. GANSW717923266 · YALLAMBEE, 30534 KAMILAROI HWY · 16.33

**Expected post-K**: effectively unchanged. `30536`, `30534` etc. match via `bool_prefix` PREFIX matching (query `3053` is a prefix of `30536`), not fuzziness. Option K doesn't alter prefix-matching semantics. `3053E` and `3053Z` contain `3053` as a prefix via the `whitecomma` analyser splitting on non-word chars; unchanged.

Note: this query illustrates an unrelated separate issue (postcode query against full AU corpus is low-signal and returns odd results). Not in scope for P026.

## Query 13 — `TRAVEL INN HOTEL` (building-name-only)

1. **GAVIC413015604** · TRAVEL INN HOTEL, 225-245 DRUMMOND ST, CARLTON · 81.19

**Expected post-K**: unchanged. Exact phrase, no numeric tokens.

## Query 14 — `Carlton VIC` (locality-only)

1. GAVIC419575951 · 16 CARLTON ST, CARLTON VIC · 642.66
2. GAVIC421405897 · 20 CARLTON ST, CARLTON VIC · 642.66
3. GAVIC421713991 · 40 CARLTON ST, CARLTON VIC · 642.66
4. GAVIC420167573 · 50 CARLTON ST, CARLTON VIC · 642.66
5. GAVIC419865354 · 54 CARLTON ST, CARLTON VIC · 642.66

**Expected post-K**: unchanged. `Carlton` (7 chars) and `VIC` (3 chars) — `VIC` loses fuzz under AUTO:5,8 but that's arguably an improvement (`VIC` shouldn't fuzz to `NSW` etc.).

## Post-deploy verification checklist

- [ ] Queries 1, 2, 3 — target doc ranked #1 or #2 (up from sixth/third).
- [ ] Queries 4, 5 — P007 sub-unit ranking invariant holds (non-unit first).
- [ ] Queries 6, 7 — sub-unit slash-form unchanged.
- [ ] Query 8 — `Muray` typo still matches `MURRAY` (5-char fuzz preserved).
- [ ] Queries 9, 10 — ADR 026 invariants hold; adjacent-fuzz noise gone.
- [ ] Query 11 — street+locality query stable.
- [ ] Query 12 — postcode-prefix behaviour unchanged.
- [ ] Queries 13, 14 — single-token queries unchanged.
- [ ] No query returns an unexpected regression (target doc falling out).
