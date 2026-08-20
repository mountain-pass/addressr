# Retro Reports

Per-date context-analysis reports produced by the wr-retrospective deep layer
(`/wr-retrospective:analyze-context`), alongside per-date ask-hygiene trails from
`/wr-retrospective:run-retro` Step 2d. Each context-analysis report carries an HTML-comment snapshot
trailer that the next retro's cheap layer reads for delta comparison; see ADR-043 for the schema.

**Read the newest context-analysis report before trimming anything.** The 2026-08-20 report records that in
an adopter tree — one with no `packages/` directory, which this repo is — the cheap layer reports `hooks`
and `skills` as **zero** while the plugin surfaces actually loaded total ~1.86 MB. Roughly 37.5% of true
measured context is invisible to the aggregate, so a trim decision made from the bucket table alone is
computed over about 62% of the picture.
