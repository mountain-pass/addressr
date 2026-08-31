/* Preserve existing entitlements as hard capped. Zero included requests is
   never an implicit unlimited policy. Keep this schema during rollback. */
CREATE TABLE entitlements_next (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  plan_key TEXT NOT NULL,
  subscription_status TEXT NOT NULL,
  pause_collection INTEGER NOT NULL DEFAULT 0 CHECK (pause_collection IN (0, 1)),
  payment_method_policy TEXT NOT NULL CHECK (payment_method_policy IN ('immediate', 'unsupported')),
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  quota_limit INTEGER NOT NULL CHECK (quota_limit >= 0),
  hard_limit INTEGER NOT NULL DEFAULT 1 CHECK (hard_limit IN (0, 1) AND (hard_limit = 0 OR quota_limit > 0)),
  quota_used INTEGER NOT NULL DEFAULT 0 CHECK (quota_used >= 0),
  quota_period TEXT NOT NULL,
  stripe_event_created INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO entitlements_next (
  organization_id, stripe_subscription_id, plan_key, subscription_status,
  pause_collection, payment_method_policy, cancel_at_period_end, quota_limit,
  hard_limit, quota_used, quota_period, stripe_event_created, updated_at
)
SELECT organization_id, stripe_subscription_id, plan_key, subscription_status,
  pause_collection, payment_method_policy, cancel_at_period_end, quota_limit,
  1, quota_used, quota_period, stripe_event_created, updated_at
FROM entitlements;

DROP TRIGGER reserve_usage_quota;
DROP TRIGGER release_usage_quota;
DROP TABLE entitlements;
ALTER TABLE entitlements_next RENAME TO entitlements;

CREATE TRIGGER reserve_usage_quota
BEFORE INSERT ON usage_records
BEGIN
  UPDATE entitlements
  SET quota_used = quota_used + 1
  WHERE organization_id = NEW.organization_id
    AND (hard_limit = 0 OR quota_used < quota_limit);
  SELECT (CASE
    WHEN changes() != 1 THEN RAISE(ABORT, 'quota_exhausted')
  END);
END;

CREATE TRIGGER release_usage_quota
AFTER DELETE ON usage_records
WHEN OLD.outcome = 'reserved'
BEGIN
  UPDATE entitlements
  SET quota_used = quota_used - 1
  WHERE organization_id = OLD.organization_id
    AND quota_used > 0;
END;
