---
status: 'proposed'
date: 2026-08-30
human-oversight: confirmed
oversight-date: 2026-08-30
decision-makers: [Tom Howard]
consulted: [wr-architect:agent, wr-jtbd:agent]
informed: []
reassessment-date: 2026-11-30
---

# Terraform owns the Stripe catalogue

> Captured via /wr-architect:capture-adr. Human-ratified 2026-08-30.

## Context and Problem Statement

The Addressr-managed channel needs Stripe products, prices and a billing meter that match the verified RapidAPI launch catalogue. Creating them in the Stripe dashboard or through an imperative script would put live commercial configuration outside the repository's reviewed production-infrastructure path.

## Decision Drivers

- Keep live Stripe catalogue state reproducible and reviewable.
- Reuse the changeset-armed release-PR plan and apply path established by ADR-045.
- Keep confidential catalogue evidence and Stripe credentials out of the public repository and workflow output.
- Prevent dormant billing infrastructure from activating the managed channel or creating customer financial state.
- Use Stripe's maintained integration instead of owning a custom reconciliation script.

## Considered Options

1. **Manage the Stripe catalogue with the official Terraform provider (chosen).** Define products, prices and the billing meter in the existing production Terraform root and apply them only through the release pipeline.
2. **Create the catalogue in the Stripe dashboard.** Configure resources interactively and retain no repository-owned desired state.
3. **Create the catalogue with an imperative Stripe API script.** Run a custom script from CI or an operator machine and separately reconcile its effects.

## Decision Outcome

Chosen option: **"Manage the Stripe catalogue with the official Terraform provider."** The existing Addressr deployment root uses the exact stable `stripe/stripe` provider version `0.2.3`, commits its generated dependency lock, and owns the dormant products, prices and billing meter. Sensitive commercial terms enter Terraform through the existing confidential CI variable path. Production mutation remains changeset-armed and occurs only when the release PR is merged.

## Consequences

### Good

- Stripe catalogue changes receive the same review, plan and release controls as other production infrastructure.
- Terraform state records the resources and their dependency relationships.
- Provider-generated resource identifiers can later be wired into the managed gateway without copying dashboard values.
- Dashboard drift is visible in a refreshed Terraform plan.

### Neutral

- Stripe becomes another provider in the existing production Terraform workspace.
- Prices remain effectively immutable; changing commercial terms creates replacement price resources rather than editing history.

### Bad

- A Stripe provider or schema defect can block the wider infrastructure plan.
- The release pipeline requires a protected Stripe API credential with catalogue-management permissions.
- Removing a catalogue resource from configuration archives provider objects rather than erasing their billing history.

## Confirmation

1. `terraform providers` resolves `registry.terraform.io/stripe/stripe` at exactly `0.2.3`, and `.terraform.lock.hcl` records that selection.
2. The release-PR plan projects only the intended inactive Stripe products, inactive prices and unused billing meter before merge.
3. The production apply is armed by an `@mountainpass/addressr-deployment` changeset and runs through `.github/workflows/release.yml`; no dashboard or operator-side creation occurs.
4. Stripe credentials and confidential catalogue terms are supplied from protected GitHub Actions secrets and are absent from committed source, logs and uploaded plan projections.
5. `managed_channel_enabled` remains false, the Worker catalogue is not populated by this provisioning slice, and no Stripe customer, subscription or charge is created.

## Pros and Cons of the Options

### Official Stripe Terraform provider

- Good, because desired state, plan evidence and production mutation stay in one governed path.
- Bad, because provider lifecycle and schema limitations become release dependencies.

### Stripe dashboard

- Good, because it is quick for a one-off configuration.
- Bad, because the live catalogue would not be reproducible or reviewed with the code that consumes it.

### Imperative Stripe API script

- Good, because it can call every API surface directly.
- Bad, because Addressr would own idempotency, drift reconciliation, secret handling and a second production mutation path.

## Reassessment Criteria

Reassess if the official provider cannot represent a required current plan without silent semantic substitution, repeatedly produces unsafe drift, or loses maintained stable releases. Reassess the inactive-resource boundary separately when the managed channel is ready for activation under ADR-072.

## Related

- [ADR-045 — Changesets-armed release-PR merge as the production deploy entry point](045-changesets-armed-release-pr-merge-as-the-production-deploy-entry-point.proposed.md)
- [ADR-068 — Stripe-hosted billing interactions](068-stripe-hosted-billing-interactions.proposed.md)
- [ADR-071 — Stripe meter events emitted from idempotent usage records](071-stripe-meter-events-emitted-from-idempotent-usage-records.proposed.md)
- [ADR-072 — RapidAPI catalogue parity at launch](072-rapidapi-catalogue-parity-at-launch.proposed.md)
