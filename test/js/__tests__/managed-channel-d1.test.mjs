import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const wrangler = path.join(root, 'node_modules/.bin/wrangler');
const migration = path.join(
  root,
  'apps/addressr-deployment/cloudflare-worker/migrations/0001-managed-channel.sql',
);
const work = mkdtempSync(path.join(tmpdir(), 'addressr-d1-'));

// eslint-disable-next-line security/detect-non-literal-fs-filename -- isolated test directory created above.
writeFileSync(
  path.join(work, 'wrangler.toml'),
  'name = "managed-channel-test"\ncompatibility_date = "2026-08-29"\n[[d1_databases]]\nbinding = "CUSTOMER_DB"\ndatabase_name = "test"\ndatabase_id = "local"\n',
);
run('--file', migration);
run(
  '--command',
  "INSERT INTO organizations VALUES ('org','clerk','stripe','now'); INSERT INTO entitlements (organization_id,stripe_subscription_id,plan_key,subscription_status,pause_collection,payment_method_policy,cancel_at_period_end,quota_limit,quota_used,quota_period,stripe_event_created,updated_at) VALUES ('org','sub','basic','active',0,'immediate',0,1,0,'2026-08',1,'now'); INSERT INTO api_keys VALUES ('key','org','default','ABCDEF123456','hash','salt',10000,'pbkdf2-sha256-v1',NULL,'now');",
);

after(() => rmSync(work, { recursive: true, force: true }));

test('D1 atomically enforces and refunds the organisation quota', () => {
  run(
    '--command',
    "INSERT INTO usage_records (id,organization_id,api_key_id,request_path,outcome,created_at) VALUES ('one','org','key','/addresses','reserved','now');",
  );
  const rejected = execute(
    '--command',
    "INSERT INTO usage_records (id,organization_id,api_key_id,request_path,outcome,created_at) VALUES ('two','org','key','/addresses','reserved','now');",
  );
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr + rejected.stdout, /quota_exhausted/);
  const result = run(
    '--command',
    "DELETE FROM usage_records WHERE id='one'; INSERT INTO usage_records (id,organization_id,api_key_id,request_path,outcome,created_at) VALUES ('two','org','key','/addresses','reserved','now'); SELECT quota_used FROM entitlements WHERE organization_id='org';",
  );
  assert.equal(JSON.parse(result).at(-1).results[0].quota_used, 1);
});

function run(flag, sql) {
  const result = execute(flag, sql);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function execute(flag, sql) {
  return spawnSync(
    wrangler,
    [
      'd1',
      'execute',
      'CUSTOMER_DB',
      '--local',
      '--persist-to',
      path.join(work, 'state'),
      '--config',
      path.join(work, 'wrangler.toml'),
      flag,
      sql,
      '--json',
    ],
    { cwd: root, encoding: 'utf8' },
  );
}
