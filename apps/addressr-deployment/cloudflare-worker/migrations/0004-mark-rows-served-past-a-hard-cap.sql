/* Mark a request served past a hard cap so it is never delivered to the meter.
   ADR-092 decided that. ADR-095 owns the second column below, supersedes ADR-092's
   claim that four statements must read the marker, and is where the statements are
   enumerated. Do not take the count from ADR-092. Block comments only, and no
   semicolon inside one: the remote applier splits on semicolons without parsing,
   so a semicolon in a comment truncates the migration. */

/* A reason code rather than a boolean, so a second exclusion class never needs a
   second widening. 0 is meterable. NOT NULL DEFAULT 0 is what makes this additive
   under ADR-093 and therefore safe against the Worker already deployed, which does
   not name this column and must keep working until the next release does. */
ALTER TABLE usage_records
  ADD COLUMN unmeterable_reason INTEGER NOT NULL DEFAULT 0
  CHECK (unmeterable_reason >= 0);

/* How many of the window's billable rows were deliberately not metered. Per ADR-095
   the expected count STAYS over every billable row and this is carried beside it, so
   the window records both what it expected and what it deliberately left out. It does
   NOT record expecting nothing: that shape was considered and rejected, because it
   leaves no positive trace that the gap was intended. Both of reconciliation's
   comparisons subtract this, not just the matched one. */
ALTER TABLE meter_reconciliations
  ADD COLUMN unmeterable_count INTEGER NOT NULL DEFAULT 0
  CHECK (unmeterable_count >= 0);
