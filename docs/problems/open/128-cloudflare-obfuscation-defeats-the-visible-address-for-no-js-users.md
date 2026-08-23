# Problem 128: Cloudflare rewrites the Enterprise address at the edge, and the build-output test cannot see it

**Status**: Open
**Reported**: 2026-08-23
**Priority**: 4 (Low) — Impact: Minor (2) × Likelihood: Unlikely (2). Impact 2: no-JS visitors get a dead button where a working link to the quote form used to be, and no readable address; with JavaScript the address renders and the link works, which covers the webmail users the requirement was actually written for. Likelihood 2: no-JS traffic on a marketing site is a small share, and the Enterprise tier is the least-trafficked surface on it.
**Origin**: internal
**Effort**: S — a comment wrapper, or a dashboard toggle, plus a check that sees the edge.
**WSJF**: 4.0 — (4 × 1.0) / 1
**JTBD**: JTBD-004
**Persona**: web-app-developer

## Description

Found immediately after the first production deploy of the `apps/website` import
([ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md)), by checking
the live site rather than the build.

ADR-053 Confirmation criterion 8 requires the Enterprise email address to render as **visible text**, not
only as an `href` — because a `mailto:` is inert for webmail users and a bare button leaves them nothing to
copy. That is satisfied at the origin and rewritten at the edge.

**Cloudflare's Email Address Obfuscation** (Scrape Shield) mutates the page in transit:

```html
<a href="/cdn-cgi/l/email-protection#88e9ec…" class="button btn special …"
  >Email Us for a Quote</a
>
<p class="mbr-text enterprise-cta__address">
  Opens your email app. If nothing happens, write to
  <a href="/cdn-cgi/l/email-protection#274643…">
    <span class="__cf_email__" data-cfemail="7f1e1b…"
      >[email&#160;protected]</span
    >
  </a>
</p>
```

**Verified as an edge mutation, not a build defect.** The Netlify origin
(`wizardly-mahavira-44f7c9.netlify.app/pricing/`) serves both `mailto:` hrefs intact, and so does
`apps/website/public/pricing/index.html`. Only the Cloudflare-fronted `addressr.io` is rewritten. The other
pages show zero obfuscation hits — not because it is scoped, but because the pricing page is now the only
one carrying an email address.

## What actually breaks, and for whom

With JavaScript, Cloudflare's script decodes the `__cf_email__` span: the address becomes visible and the
link works. **Every user criterion 8 was written for — webmail users with no mail-client handler — has
JavaScript**, so for them the requirement is met.

Without JavaScript the button is a dead `/cdn-cgi/` link and the address reads `[email protected]`. That is
a **regression for that group**: before this change the same button was a working Gatsby link to the quote
form. The form needed JS to submit, so they could not have completed it either — but they could reach it.

## The tension, which is the useful part of this ticket

ADR-053 accepted "the address becomes scrapeable" as a Bad consequence of the mailto. **Cloudflare was
already mitigating exactly that**, and criterion 8 was written without checking what the edge did. The
criterion and the existing anti-scraping posture are in direct conflict, and the conflict was invisible from
the repository.

Decision taken 2026-08-23: **accept it and record the limit**, keeping the anti-scraping mitigation. Two
alternatives were weighed and rejected for now — a `<!--email_off-->` wrapper, which Cloudflare honours and
which would restore the text for everyone while leaving obfuscation on elsewhere; and turning obfuscation off
zone-wide, which is instant but is out-of-repo config no test can see.

## The verification defect, which is the more transferable finding

`apps/website/test/rendered-output.test.mjs` asserts criterion 8 and **passes** — correctly, because it reads
what Gatsby emits. The mutation happens at a layer below the origin, so no build-output assertion can ever
see it.

This is the same shape as [P122](122-three-redirect-mechanisms-in-the-website-and-none-reach-the-built-site.md):
live behaviour with no reproducible source in the repository. The lesson generalises past this ticket —
**a criterion about what a human sees cannot be discharged by a build artefact.** Criterion 8 was signed off
on build output and the sign-off was wrong, in a way that only a live fetch revealed.

## Investigation Tasks

- [ ] Amend ADR-053 criterion 8 to state what it actually verifies (origin output) and what it cannot
      (edge-mutated delivery). This is the substantive half and needs the clause-level supersession route if
      it changes the criterion rather than annotating it.
- [ ] Decide whether any criterion in this repo that describes user-visible behaviour should carry a
      live-fetch check rather than a build-output one. There is now one instance; a second would make it a
      pattern.
- [ ] If the no-JS regression matters, apply the `<!--email_off-->` wrapper — it is the targeted fix and it
      keeps obfuscation everywhere else.
- [ ] Check whether Cloudflare obfuscation interacts with anything else the import brought in.
