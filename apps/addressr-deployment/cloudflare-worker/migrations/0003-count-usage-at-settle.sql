/* Charge the quota at settle, not at reserve. The reasoning, the three rejected
   alternatives and the accepted concurrency cost are in ADR-091, kept there rather
   than here because a long comment in a migration is a parse hazard, not a record. */

DROP TRIGGER IF EXISTS reserve_usage_quota;
DROP TRIGGER IF EXISTS release_usage_quota;

/* A reservation charges nothing, so one that never settles costs nothing. */
CREATE TRIGGER settle_usage_quota
AFTER UPDATE OF outcome ON usage_records
WHEN NEW.outcome = 'billable' AND OLD.outcome = 'reserved'
BEGIN
  UPDATE entitlements
  SET quota_used = quota_used + 1
  WHERE organization_id = NEW.organization_id;
END;

/* The other route to billable, so a direct insert cannot go uncounted. */
CREATE TRIGGER count_billable_insert
AFTER INSERT ON usage_records
WHEN NEW.outcome = 'billable'
BEGIN
  UPDATE entitlements
  SET quota_used = quota_used + 1
  WHERE organization_id = NEW.organization_id;
END;
