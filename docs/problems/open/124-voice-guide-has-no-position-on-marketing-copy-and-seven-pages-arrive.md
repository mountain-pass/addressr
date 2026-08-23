# Problem 124: The voice guide has no position on marketing copy, and seven pages of it are arriving

**Status**: Open
**Reported**: 2026-08-23
**Priority**: 6 (Medium) — Impact: Minor (2) × Likelihood: Possible (3). Impact 2: no user harm and nothing breaks; the cost is that the voice gate fires on every website copy change and has no rule to answer with, so each review re-litigates house style from evidence. Likelihood 3: it needs someone to edit website copy, which is now permanently in gate scope but is not a frequent event.
**Origin**: internal
**Effort**: S — three subsections, then one review pass over the imported pages.
**WSJF**: 6.0 — (6 × 1.0) / 1
**JTBD**: JTBD-004
**Persona**: web-app-developer

## Description

Surfaced by the `wr-voice-tone:agent` review of the Enterprise call-to-action change during the
[ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) import. The
review passed the three strings under change and **failed on the guide**, which is the right call: the
strings were a symptom.

`docs/VOICE-AND-TONE.md` scopes itself to "GitHub issues, documentation, README copy, API error messages,
and any other external-facing communication". The catch-all technically reaches the website, but three
specific things are absent and all three were load-bearing for a single small change:

1. **No tone entry for marketing or conversion copy.** The Tone section has four contexts — GitHub issue
   responses, API error messages, README and docs, release notes. A pricing-page call-to-action is none of
   them, and every worked example in the guide is a reply to someone who already has a problem. There is no
   example of copy whose job is to _start_ a conversation.
2. **No audience entry for a buyer.** Audience names developers (primary) and non-technical reporters
   (secondary). Someone choosing a pricing tier is neither. This is the same gap the JTBD corpus had, closed
   there on 2026-08-23 by amending the `web-app-developer` persona to cover the evaluating stage; the voice
   guide has not had the equivalent amendment.
3. **No language or locale section at all.** There is no position on Australian versus American spelling, so
   `enquiry` versus `inquiry` could not be settled from the guide. It was settled from evidence instead —
   the repo uses `enquiry` and never `inquiry`, and both guide and site use `behaviour`, `licence`,
   `organisation`, `containerised` — but evidence is not a rule, and the next argument re-runs it.

The reviewer proposed concrete text for all three. It is recorded in the review rather than here, because
adopting it involves house-style calls (Australian English; Title Case for website buttons and headings,
sentence case for prose) that are the maintainer's to make, not an agent's to assume.

**Why this is not merely tidy.** ADR-053's consequences already record that the accessibility gate "starts
firing, permanently" from this import. The voice gate has the identical shape and the same trigger, and it
is arriving with no rule for the surface it will be asked about.

## Copy findings on the imported pages, deliberately left alone

Flagged by the same review and **not** changed during the import, because a hosting move is not a rewrite.
Recorded so the omissions read as deliberate and so the list exists when the guide update happens.

Enterprise tier, `pricing.js`:

- `Run On-Prem or in Your Own Cloud` — a direct hit on the guide's own Terminology "Prefer" table, which
  says use `self-hosted` rather than `on-premise`. Not taste: a named table entry. The section heading two
  levels up already says `Self hosted`, so the page contradicts both the guide and itself.
- `Mission Critical Support` — adjectival marketing language of the class the inherited guide bans, and
  redundant with `24×7 AEST SUPPORT` three lines below, which is the same claim stated specifically.
- `$ Contact Us` — a currency symbol prefixing a non-price, rendering as `$Contact Us`. After the CTA change
  the tier says "contact us" twice in adjacent elements.

Elsewhere:

- `100% Free. FOREVER` (twice) — shouty caps plus an unbounded promise.
- `Get Started Free` appears on two tiers pointing at two different destinations. That is ambiguous link
  text and belongs to the link-checker rather than to voice.

## Investigation Tasks

- [ ] Decide the locale rule and record it. Evidence points to Australian English; it needs to be a rule so
      it stops being re-derived.
- [ ] Decide the casing rule for website buttons and headings. The pages are currently Title Case
      throughout; sentence case is defensible but would be a page-wide change, not a per-string one.
- [ ] Add a marketing and conversion tone entry, and a buyer audience entry.
- [ ] Then run one voice pass over the imported pages and work the findings above.

## Notes

One improvement landed for free: deleting the enterprise quote form removed `Thanks for your interest!`,
`we'll get back to you with a quote ASAP`, `Error: Message sending failed. Sorry.` and its emoji status
messages — every one a guide violation. That file had also been shipping the typo `shorlty` since 2019.
