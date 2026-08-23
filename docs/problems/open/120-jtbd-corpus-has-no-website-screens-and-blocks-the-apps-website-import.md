# Problem 120: The JTBD corpus maps no website surface, and the gate blocks the `apps/website` source import until it does

**Status**: Open
**Reported**: 2026-08-23
**Priority**: 10 (High) — Impact: Minor (2) × Likelihood: Certain (5). Impact 2: this blocks a planned import and leaves three existing jobs describing surfaces less completely than they could, but nothing in production misbehaves and no user is harmed while it stands. The High label is the matrix product of a minor impact and a certain likelihood, not a claim that the harm is severe. Likelihood 5: not a probability — the `wr-jtbd:agent` edit gate returns JOB UPDATE NEEDED on the first `apps/website` source write, deterministically, and has already done so once on the proposal.
**Origin**: internal
**Effort**: M — four documentation edits, of which one needs a user decision.
**WSJF**: 5.0 — (10 × 1.0) / 2
**JTBD**: JTBD-400
**Persona**: addressr-maintainer

## Description

The word "website" appears **zero times** in `docs/jtbd/`. The entire documented corpus maps to API routes,
MCP tools, `src/`, `scripts/`, workflows and `README.md`. The site has lived in its own repository since
2019, so the gap is an artefact of where the source sat rather than a judgement that the surfaces do not
matter.

[ADR-053](../../decisions/053-website-imported-as-an-app-with-hosting-unchanged.proposed.md) imports that
source to `apps/website`. The `wr-jtbd:agent` gate passed the ADR on the reasoning that a decision record
moves no screen into the repo, and stated that it returns JOB UPDATE NEEDED on the first source write
unless the items below are discharged first. **This ticket is that worklist** — the ADR cannot carry it,
because decision-record prose has no worklist semantics and would be discoverable only by someone who
happened to read ADR-053 before attempting the import.

## Investigation Tasks

- [ ] **New job: evaluate Addressr and reach a first working API call.** Primary persona `web-app-developer`;
      expect `self-hosted-operator` as a second participant, since the download page is that persona's entry
      point. Screens: landing page, the live Search component, quick-start, pricing, the `api-docs` redirect.
      New file under `docs/jtbd/web-app-developer/`.
- [ ] **`docs/jtbd/self-hosted-operator/JTBD-202-obtain-and-run-published-image.validated.md`** — add the
      website download page beside the existing `README.md (Self Hosted with Docker)` screen. The two are the
      same instruction set and have been drifting unobserved in separate repositories; that is the specific
      thing the import makes reviewable in one diff.
- [ ] **`docs/jtbd/self-hosted-operator/JTBD-200-protect-gateway-boundary.validated.md`** — add the Search
      component as the production `safeHosts` Referer client. The screens list is currently the single generic
      entry `all routes (proxy auth middleware)`, which does not reach a client. After the import the
      allowlist in `apps/addressr-deployment/cloudflare-worker/safe-ips.mjs` and its only production consumer
      sit in one tree, so a `safeHosts` edit that breaks the site becomes reviewable. Today it cannot be.
- [ ] **`docs/jtbd/web-app-developer/JTBD-001-search-autocomplete-addresses.validated.md`** — route the live
      Search component to the new evaluation job rather than adding it here. It serves evaluation, not
      integration.
- [ ] **`docs/jtbd/addressr-maintainer/JTBD-400-ship-releases-reliably-from-trunk.validated.md`** — add
      `apps/website/**`. Its two script entries describe both arming predicates as deployment-tree-scoped, and
      that description goes false the moment a second armed tree exists.
- [ ] **Persona decision — needs the user, and it is the long pole.** The pricing page still addresses someone
      choosing and paying for a tier. `web-app-developer` as documented is an integrator whose only pricing
      touchpoint is the pain "Expensive pricing tiers at the volumes consumer apps see" — a sensitivity
      constraint, not a buyer's tier-selection moment. The reviewing agent's recommendation is an **amendment
      to `web-app-developer`**, adding an evaluating-stage context and the tier-choice moment, rather than a
      new buyer persona. Two things make the amendment sufficient: the account actor is gone with the Auth0
      deletion, and the `mailto:` change moves the enterprise buyer's first contact off the product surface
      entirely. Resolve via `/wr-jtbd:confirm-jobs-and-personas`.

## Notes

The gap the deletion **did** close: the enterprise price-request form and the Auth0 callback served an actor
with an account and a purchasing decision that no persona covered. ADR-053 deletes both, so no persona needs
inventing for surfaces nobody uses. What survives is the buyer/evaluator on the pricing page, which is a
narrower question than the one first raised.
