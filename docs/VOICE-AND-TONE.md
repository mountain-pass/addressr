# Voice and Tone

> Last reviewed: 2026-08-28
> This guide is read by the `wr-voice-tone:agent` to review user-facing copy before it is published.

This guide defines how Addressr sounds across GitHub issues, documentation, README copy, API error messages, and any other external-facing communication. It inherits the Windy Road base voice (direct, confident, specific, no em-dashes) and adds product-specific rules.

---

## Voice

Voice is constant. It does not change between channels or audiences.

### Direct

Say the thing. No preamble, no hedging, no throat-clearing. If a sentence works without its first clause, cut the first clause.

> "We can't reproduce this on our supported configuration."

Not: "Thank you for raising this. We've had a look and unfortunately we haven't been able to reproduce the issue on our end at this point in time."

### Confident

State facts plainly. No defensive qualifiers, no pre-emptive apologies.

> "AWS OpenSearch is the supported managed cluster option. The issue doesn't appear there."

Not: "We're sorry for the inconvenience. We only support AWS OpenSearch and so we're afraid we may not be able to help with elastic.co."

### Specific

Use numbers, names, versions, and concrete outcomes. Specificity is more credible than adjectives.

> "15+ million addresses from the official G-NAF source."

Not: "Comprehensive coverage of Australian addresses."

### Peer-to-peer

Addressr speaks to product owners, data owners and developers as capable peers. Not a support bot, not a vendor pitching. Someone who understands the business consequence and the implementation detail.

> "If you're running against AWS OpenSearch, this won't affect you. Our CI pipelines confirm it."

Not: "We value your feedback and have escalated this to our technical team for investigation."

### Dry when warranted

Self-aware humour is in character, used sparingly. Never use it in setup steps, errors, pricing, security guidance or a handoff to another service. Clarity wins.

---

## Tone

Tone adapts to context. Voice stays constant.

### GitHub issue responses

**Tone: Factual and action-oriented.** The reporter has a problem. Acknowledge it briefly (one sentence max), state what is known, state what we need or what they can do. No ceremony.

- State what we can and can't reproduce, and on what configuration
- If closing, say why directly
- If asking for more information, be specific about what you need

### Error messages (API responses)

**Tone: Terse and precise.** Developers are parsing these programmatically and reading them in logs. Every word should carry information.

> `"not found"` / `"service unavailable"` / `"unexpected error"`

Not: `"We're sorry, but the address you requested could not be found in our system."`

### README and documentation

**Tone: Practical and direct.** Describe what the thing does, what the user needs to do, and what to expect. Give honest durations and checkpoints. Do not turn an awkward setup requirement into a joke.

### Marketing website

**Tone: Outcome-led and evidence-backed.** Start with the address-quality outcome, then explain the implementation. Write for the product or data owner deciding whether Addressr solves a business problem. Give developers a direct route to the first request and reference material.

- Lead with hosted Addressr unless the page is specifically about self-hosting
- Explain G-NAF on first use
- Prefer measured proof to adjectives
- Name RapidAPI before a link hands the visitor to RapidAPI
- Separate hosted and self-hosted responsibilities
- Use one primary action per section

> "Improve Australian address quality without maintaining G-NAF yourself."

Not: "Powerful, mission-critical address intelligence for every business."

### Pricing and provider handoffs

**Tone: Predictable and explicit.** State what the plan includes, who it suits, the currency, request allowance and where the next action happens. Hosted signup, API keys, billing and plan changes currently happen on RapidAPI. Say that before the link.

### Release notes and changelogs

**Tone: Matter-of-fact.** State what changed and why it matters. No superlatives, no "exciting new features."

> "Fixes exact street address ranking below sub-unit variants (P007, #375)."

Not: "Exciting improvement to search quality!"

---

## Audience

Addressr communications reach three groups:

**Product and data owners (primary):** People accountable for address quality, form completion, delivery data, data governance or the platform capability their teams consume. Start with the operational outcome and decision. Define implementation terms without talking down to them.

**Developers (implementation audience):** Engineers integrating the hosted API, self-hosting the package or Docker image, or contributing to the project. Assume they can read a stack trace and run curl. Don't hand-hold on basics; be precise about Addressr-specific behaviour and provide a fast first-request path.

**Non-technical reporters (secondary):** Users who found Addressr via RapidAPI or addressr.io and are reporting address data issues or unexpected behaviour. They may not know what G-NAF or OpenSearch is. Adjust language accordingly without being condescending.

## Evidence and claims

Every public service, adoption or customer claim needs a reproducible source.
`RISK-POLICY.md` prohibits persisting absolute business metrics and pricing
details in this public repository, including when a third-party source is
public.

- Name the source: for example UptimeRobot, npm or GitHub
- Link to the authoritative current source instead of copying prohibited figures
- Call public package activity "adoption", not "customers"
- Do not infer customers, subscribers, reliability or business outcomes from downloads, stars or page visits
- Omit evidence that cannot be verified
- Keep measurement methodology close to performance claims

Prefer: "View current package activity on npm."

Not: "Trusted by thousands of customers."

---

## GitHub issue rules

These apply every time a comment is posted on a GitHub issue.

### Age-check before responding

Before writing a response, note when the issue was opened. A response to a 2024 issue reads differently from a response opened last week. Don't write "we'll look into this" on a multi-year-old ticket.

### Never say "we'll keep this open"

Either close the issue or state the specific condition that would change the status.

> "Closing: can't reproduce on a supported config. If it reproduces on AWS OpenSearch, reopen with details."

Not: "Happy to keep this open and revisit if more information comes in."

### No AI filler phrases

Banned:

- "Thanks for reporting this!"
- "Thanks again for..."
- "Happy to help"
- "Great question"
- "Certainly!"
- "Of course!"
- "I hope this helps"
- "Please don't hesitate to reach out"
- "We appreciate your patience"

A single "thanks" at the start of a response to a new reporter is acceptable. That is the ceiling.

### No passive voice on closures

Say directly why something is closed or parked.

> "Closing: can't reproduce on a supported config."

Not: "This issue has been closed due to inability to reproduce."

---

## Do / Don't examples

| Context                 | Don't                                                                                             | Do                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Issue response opener   | "Thanks for the detailed report! We really appreciate you taking the time."                       | "Thanks for the report." (or skip the opener if the issue is old)                                         |
| Closing an issue        | "This issue has been closed as it could not be reproduced."                                       | "Closing: can't reproduce on AWS OpenSearch. If you see this on a supported config, reopen with details." |
| Explaining a limitation | "Unfortunately we don't have an elastic.co account so we're afraid we may not be able to assist." | "We don't have an elastic.co account, so we can't reproduce or verify a fix."                             |
| API error message       | "The requested address was not found in our database."                                            | `"not found"`                                                                                             |
| Feature description     | "Powerful real-time autocomplete with intelligent fuzzy matching capabilities."                   | "Real-time autocomplete with fuzzy matching."                                                             |
| Hosted signup handoff   | "Get started"                                                                                     | "Start a hosted plan on RapidAPI"                                                                         |
| Adoption evidence       | "Trusted by thousands"                                                                            | "Link to current package activity on npm"                                                                 |

---

## Terminology

### Prefer

| Use            | Instead of                                                            |
| -------------- | --------------------------------------------------------------------- |
| G-NAF          | "the address database", "our database" (be specific)                  |
| AWS OpenSearch | "our supported config" (name it)                                      |
| address ID     | "address identifier", "pid" (in user-facing copy)                     |
| loader         | "data loader", "indexer" (pick one; "loader" matches the CLI command) |
| self-hosted    | "on-premise", "local installation"                                    |
| hosted API     | "SaaS" when writing for product or data owners                        |
| API request    | "req" in prices or plan descriptions                                  |
| not found      | "does not exist", "could not be located"                              |

### Avoid

| Word/phrase   | Why                                                    |
| ------------- | ------------------------------------------------------ |
| Em-dashes     | Banned by pre-commit hook. Use a colon or restructure. |
| Actually      | Defensive filler (inherited from Windy Road guide)     |
| Unfortunately | Apologetic preamble. State the constraint directly.    |
| Please note   | Throat-clearing. Delete it and start with the note.    |
| As per        | Formal jargon. Say "per" or rewrite.                   |
| Reach out     | Say "open an issue", "post a comment", "email".        |
| Happy to      | Say what you will do, not how you feel about doing it. |
| We're excited | Irrelevant. State the thing.                           |

---

## Technical constraints

**No em-dashes.** The pre-commit hook blocks em-dashes and their HTML entities. Use a colon, a full stop, or rewrite the sentence.

**Inherited from Windy Road:** all banned patterns and word list entries in the Windy Road `VOICE-AND-TONE.md` also apply unless explicitly overridden above.
