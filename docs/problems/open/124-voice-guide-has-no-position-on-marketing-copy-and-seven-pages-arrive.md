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

**Added 2026-08-24**, found during the [P125](../closed/125-every-page-of-the-website-ships-without-a-title-element.md)
title fix and deliberately not changed there — an accessibility ticket should not become the carrier for copy
edits.

`404.tsx` body copy:

- `You just hit a route that doesn't exist... the sadness.` Three findings in one sentence. **`doesn't
exist`** sits in the guide's Terminology "Instead of" column opposite `not found` — the same named-table
  class as `on-premise` above, and made sharper by the fact that the new page title, reviewed the same day,
  uses the preferred term two lines away. **`route`** is developer jargon for what a visitor calls a page or
  a link, and the guide names a secondary audience of people arriving from the RapidAPI listing or the site
  itself; a 404 is one of the few pages guaranteed to be reached by accident by a non-developer. And the
  sentence **states no recovery action** — it tells someone who is lost that this is sad.
- It is **not authored voice at all.** That string is the verbatim Gatsby starter default. Worth knowing
  before anyone tries to preserve its tone: there is no house voice here to preserve.
- `NOT FOUND` as the h1 — shouty caps, the same class as `100% Free. FOREVER` above.

The page **title** was settled during P125 and is not in question: `Page not found - Addressr by Mountain
Pass`, terse register, deliberately not matching the body's joke because a title is read in a tab and a
history entry with nothing to set a joke up. The body is what remains.

### A guide gap this surfaced, beyond the three already listed

The voice review of those titles could not answer three of five questions from the guide, which is more
evidence for this ticket:

- **No tone entry for user-facing error pages.** The existing Error messages entry is scoped to API
  responses, and its examples are machine-parsed strings. A 404 read by a human is a context the Tone section
  does not cover — and it is the context both the new title and the flagged body copy live in.
- **No rule for page titles as a copy class.** Nothing covers separator, brand-suffix policy, word order, or
  a length budget. Every question about them had to be answered from repo evidence rather than from the
  guide, which is the same "evidence is not a rule, and the next argument re-runs it" problem this ticket
  already records for `enquiry`/`inquiry`.
- **The casing gap bites here.** `Page not found` is sentence case in a set that is otherwise Title Case
  (`Pricing`, `Quick Start`, `API Docs`). Not a violation, because there is no rule — but undecided rather
  than fine, and `Page Not Found` would read badly, so the sentence-case exception for full-sentence titles
  is the specific thing needing a decision.

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
