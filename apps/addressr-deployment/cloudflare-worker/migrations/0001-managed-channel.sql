PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  clerk_organization_id TEXT UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE entitlements (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  plan_key TEXT NOT NULL,
  subscription_status TEXT NOT NULL,
  pause_collection INTEGER NOT NULL DEFAULT 0 CHECK (pause_collection IN (0, 1)),
  payment_method_policy TEXT NOT NULL CHECK (payment_method_policy IN ('immediate', 'unsupported')),
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  quota_limit INTEGER NOT NULL CHECK (quota_limit > 0),
  quota_used INTEGER NOT NULL DEFAULT 0 CHECK (quota_used >= 0),
  quota_period TEXT NOT NULL,
  stripe_event_created INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL UNIQUE,
  key_salt TEXT NOT NULL,
  key_iterations INTEGER NOT NULL CHECK (key_iterations BETWEEN 10000 AND 100000),
  hash_version TEXT NOT NULL CHECK (hash_version = 'pbkdf2-sha256-v1'),
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, name)
);

CREATE TABLE checkout_attempts (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan_key TEXT NOT NULL,
  attempt_id TEXT NOT NULL UNIQUE,
  stripe_session_id TEXT UNIQUE,
  url TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE RESTRICT,
  request_path TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('reserved', 'billable')),
  origin_status INTEGER,
  meter_state TEXT NOT NULL DEFAULT 'pending' CHECK (meter_state IN ('pending', 'delivered')),
  meter_attempts INTEGER NOT NULL DEFAULT 0 CHECK (meter_attempts >= 0),
  meter_error_code TEXT,
  meter_delivered_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  event_created INTEGER NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE meter_reconciliations (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  expected_count INTEGER NOT NULL CHECK (expected_count >= 0),
  delivered_count INTEGER NOT NULL CHECK (delivered_count >= 0),
  rejected_count INTEGER NOT NULL CHECK (rejected_count >= 0),
  provider_count INTEGER CHECK (provider_count >= 0),
  state TEXT NOT NULL CHECK (state IN ('pending', 'rejected', 'matched', 'mismatched', 'error')),
  checked_at TEXT NOT NULL,
  error_code TEXT,
  PRIMARY KEY (organization_id, window_start, window_end)
);

CREATE INDEX usage_records_organization_created
  ON usage_records (organization_id, created_at);
CREATE INDEX usage_records_meter_state
  ON usage_records (meter_state, created_at);

CREATE TRIGGER reserve_usage_quota
BEFORE INSERT ON usage_records
BEGIN
  UPDATE entitlements
  SET quota_used = quota_used + 1
  WHERE organization_id = NEW.organization_id
    AND quota_used < quota_limit;
  SELECT CASE
    WHEN changes() != 1 THEN RAISE(ABORT, 'quota_exhausted')
  END;
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
