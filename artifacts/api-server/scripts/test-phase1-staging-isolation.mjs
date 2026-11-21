import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const output = await build({
  entryPoints: [path.join(dir, '../src/lib/stagingIsolation.ts')],
  bundle: true, platform: 'node', format: 'esm', target: 'node24',
  logLevel: 'silent', write: false,
});
const { assertStagingIsolation } = await import('data:text/javascript;base64,' +
  Buffer.from(output.outputFiles[0].contents).toString('base64'));

const stagingRef = 'aojmjxxmsgnipbbrtvlz';
const productionRef = 'oxtwuylzxyleesfvsvtx';
const knownGood = Object.freeze({
  VIBESANE_DEPLOYMENT_ENV: 'staging',
  VIBESANE_STAGING_SUPABASE_REF: stagingRef,
  SUPABASE_URL: 'https://' + stagingRef + '.supabase.co',
  SUPABASE_DB_URL: 'postgresql://postgres.' + stagingRef +
    ':synthetic-test-only@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  DODO_PAYMENTS_ENVIRONMENT: 'test_mode',
  VIBESANE_STAGING_ACCESS_KEY: 'z'.repeat(48),
  GITHUB_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
});

function reject(changes, pattern) {
  const env = { ...knownGood, ...changes };
  assert.throws(() => assertStagingIsolation(env), pattern);
}

test('explicit staging DB, Auth project and sandbox billing are accepted', () => {
  assert.doesNotThrow(() => assertStagingIsolation(knownGood));
  const direct = {
    ...knownGood,
    SUPABASE_DB_URL: 'postgres://postgres:synthetic@db.' +
      stagingRef + '.supabase.co:5432/postgres',
  };
  assert.doesNotThrow(() => assertStagingIsolation(direct));
});

test('staging fails closed if both public Auth and private DB are accidentally production', () => {
  reject({
    SUPABASE_URL: 'https://' + productionRef + '.supabase.co',
    SUPABASE_DB_URL: 'postgres://postgres.' + productionRef +
      ':synthetic@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  }, /approved staging project/);
});

test('staging rejects mismatched DB project even if public Auth uses staging', () => {
  reject({
    SUPABASE_DB_URL: 'postgres://postgres.' + productionRef +
      ':synthetic@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  }, /database connection/);
});

test('staging rejects localhost placeholders, arbitrary DB hosts and missing credentials', () => {
  reject({ SUPABASE_DB_URL: 'postgres://postgres:synthetic@127.0.0.1:5432/postgres' },
    /database connection/);
  reject({ SUPABASE_DB_URL: 'postgres://postgres.' + stagingRef +
    ':synthetic@db.elsewhere.example:5432/postgres' }, /database connection/);
  reject({ SUPABASE_DB_URL: 'postgres://postgres.' + stagingRef +
    '@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres' }, /database connection/);
  reject({ SUPABASE_DB_URL: '', DATABASE_URL: '' },
    /staging Supabase URLs|database connection/);
});

test('staging does not accept live billing, missing project pin, weak or missing keys', () => {
  reject({ DODO_PAYMENTS_ENVIRONMENT: 'live_mode' }, /test_mode/);
  reject({ DODO_PAYMENTS_ENVIRONMENT: undefined }, /test_mode/);
  reject({ VIBESANE_STAGING_SUPABASE_REF: undefined }, /expected staging/);
  reject({ VIBESANE_STAGING_ACCESS_KEY: 'short' }, /staging API access key/);
  reject({ GITHUB_TOKEN_ENCRYPTION_KEY: 'bad' }, /32-byte hex/);
});

test('staging never emits a connection password, token or secret in errors', () => {
  const secret = 'SYNTHETIC_SENTINEL_NEVER_ECHO_12345';
  const env = { ...knownGood, SUPABASE_DB_URL:
    'postgres://postgres:' + secret + '@' + productionRef + '.example:5432/postgres' };
  assert.throws(() => assertStagingIsolation(env), error => {
    assert.equal(String(error.message).includes(secret), false);
    assert.equal(String(error.message).includes(env.SUPABASE_DB_URL), false);
    return true;
  });
});

test('production and other environments preserve historical startup behavior', () => {
  assert.doesNotThrow(() => assertStagingIsolation({
    VIBESANE_DEPLOYMENT_ENV: 'production',
    SUPABASE_URL: 'https://any.supabase.co',
    DODO_PAYMENTS_ENVIRONMENT: 'live_mode',
  }));
  assert.doesNotThrow(() => assertStagingIsolation({}));
});

test('staging refuses production even when every URL and expected project pin agrees on production', () => {
  reject({
    VIBESANE_STAGING_SUPABASE_REF: productionRef,
    SUPABASE_URL: 'https://' + productionRef + '.supabase.co',
    SUPABASE_DB_URL: 'postgresql://postgres.' + productionRef +
      ':synthetic-test-only@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  }, /approved staging deployment/);
});

test('staging rejects an arbitrary second Supabase project despite mutually matching URLs', () => {
  const other = 'bbbbbbbbbbbbbbbbbbbb';
  reject({
    VIBESANE_STAGING_SUPABASE_REF: other,
    SUPABASE_URL: 'https://' + other + '.supabase.co',
    SUPABASE_DB_URL: 'postgresql://postgres.' + other +
      ':synthetic-test-only@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  }, /approved staging deployment/);
});
