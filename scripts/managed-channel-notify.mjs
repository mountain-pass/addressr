// ADR-088 layer 3: the notification payload for a managed-channel fault.
//
// TRANSPORT-FREE BY DESIGN, and that is the point rather than an accident. The
// first version of this file published to AWS from a GitHub Actions job; the
// maintainer rejected that on 2026-09-04, because a scheduled CI job is not
// monitoring infrastructure and the provider has no SMS product. It was
// withdrawn unapplied and NO replacement is in place. What survived is the part
// that was never about transport: which fields may leave the account. NOT A CONTROL — it discharges no confirmation criterion and must
// never move the monitoring gate to satisfied on its own strength. The controls
// are the request-path refusal and the agent-read check.
//
// The body is an ALLOWLIST, not a denylist. The report this reads is produced
// upstream and will gain fields over time. Serialising the report and removing
// known-bad keys would leak the first field nobody thought about; picking the
// permitted keys cannot. This repository is public, the escalation path
// is not, and `docs/MANAGED_CHANNEL_MONITORING.md` binds every notification to
// fixed codes, scope and observation time.

/** The only report fields that may leave the account. */
const PERMITTED = ['scope', 'status', 'checkedAt', 'findings'];

/** Statuses worth waking someone for. `observed` is deliberately not one. */
const NOTIFIABLE = new Set(['unhealthy', 'unverified']);

/**
 * Build the notification for a health report, or null when there is nothing to
 * say. Throws on a malformed report rather than publishing a half-formed one:
 * a report with no status is a bug in the reader, and guessing would send
 * something nobody can act on.
 */
export function notificationFor(report) {
  if (!report || typeof report !== 'object') {
    throw new TypeError('notificationFor requires a health report object');
  }
  if (typeof report.status !== 'string') {
    throw new TypeError('health report has no status');
  }
  if (!NOTIFIABLE.has(report.status)) return null;

  const body = {};
  for (const key of PERMITTED) {
    if (report[key] !== undefined) body[key] = report[key];
  }

  return {
    subject: `Addressr managed channel: ${report.status}`,
    message: JSON.stringify(body),
  };
}
