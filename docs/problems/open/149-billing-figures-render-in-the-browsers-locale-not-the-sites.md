# Problem 149: Billing figures render in the browser's locale, not the site's

**Status**: Open
**Reported**: 2026-09-06
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2). Impact 2: a customer reading their own usage against their own logs sees a figure whose grouping separator is not the one the page's language implies. The sharp case is assistive technology: the page declares `lang="en-AU"`, so an English speech engine reads a German browser's `12.500` as "twelve point five zero zero" — three orders of magnitude wrong, on a page about money. Not Impact 3: the number is correct, only its presentation is ambiguous, and no billing decision is made from this screen. Likelihood 2: needs a customer whose browser locale differs from English-Australian conventions, which for an Australian address API is a minority but not a rarity.
**Origin**: internal
**Effort**: S — four call sites in one file, plus deciding which locale is right.
**WSJF**: 4.0 — (4 × 1 for Open) / 1 for Effort S
**JTBD**: JTBD-005
**Persona**: web-app-developer

## Description

`apps/website/src/pages/account.jsx` formats every usage figure with a bare
`toLocaleString()` at four sites. With no locale argument the method uses the BROWSER's
locale, while the document declares `lang="en-AU"`.

The two disagree for any visitor whose browser is not set to English-Australian
conventions. A German-locale browser renders three thousand five hundred as `3.500`,
which under `lang="en-AU"` a screen reader pronounces as a decimal.

## The decision this needs, which is why it is not a one-line fix

Three defensible answers, and the ticket should not pre-empt them:

- **Pin to `en-AU`** — matches the declared document language, so speech and text agree.
  Ignores a customer's own numeric conventions.
- **Keep the browser locale and fix the declared language** — respects the reader, but
  `lang` drives more than numbers and the site is otherwise English.
- **Use the billing locale** — the figures are about an invoice, and the invoice has its own
  currency and locale. Arguably the only one that is truly correct, and the one that needs
  most work.

## Investigation Tasks

- [ ] Choose among the three. It is a product call, not a formatting preference.
- [ ] Apply it to all four sites at once. Two of them sit in the branch that problem 148
      also touches, so sequence the two tickets or expect a conflict.
- [ ] Check whether any other surface formats numbers the same way before treating this file
      as the whole population.

## Exit criteria

1. Every usage figure on the account page formats under one stated locale, and the choice is
   recorded rather than implicit in a call site.
2. The formatted output agrees with the document's declared language, or the declaration is
   changed to agree with it.

## Related

- Found during the accessibility review of the quota-display change on 2026-09-06 and
  verified in the source; deliberately not fixed there, because which locale is correct is an
  undecided question and that change's virtue was being one mutation-proved deletion.
- Problem 148 — the other survivor of the same review, touching two of the same four sites.
- ADR-094 — the display decision whose review surfaced this.
