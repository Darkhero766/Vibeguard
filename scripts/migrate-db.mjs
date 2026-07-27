/**
 * Creates the github_tokens table in the target Postgres database (Supabase or local).
 * Uses the same robust URL parser as lib/db/src/index.ts to handle special chars in passwords.
 *
 * Usage: node scripts/migrate-db.mjs
 */
import pg from 'pg';

const rawUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!rawUrl) {
  console.error('❌  SUPABASE_DB_URL (or DATABASE_URL) is not set.');
  process.exit(1);
}

function parseUrl(url) {
  const stripped = url.replace(/^postgres(?:ql)?:\/\//, '');
  const lastAt = stripped.lastIndexOf('@');
  const credentials = stripped.slice(0, lastAt);
  const rest = stripped.slice(lastAt + 1);

  const colonInCreds = credentials.indexOf(':');
  const user = credentials.slice(0, colonInCreds);
  const password = decodeURIComponent(credentials.slice(colonInCreds + 1));

  const slashIdx = rest.indexOf('/');
  const hostPort = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const database = slashIdx === -1 ? 'postgres' : rest.slice(slashIdx + 1).split('?')[0];
  const queryString = rest.includes('?') ? rest.slice(rest.indexOf('?') + 1) : '';
  const params = new URLSearchParams(queryString);

  const colonInHost = hostPort.lastIndexOf(':');
  const host = colonInHost === -1 ? hostPort : hostPort.slice(0, colonInHost);
  const port = colonInHost === -1 ? 5432 : parseInt(hostPort.slice(colonInHost + 1), 10);

  const ssl = params.get('sslmode') === 'disable' ? false : { rejectUnauthorized: false };

  return { user, password, host, port, database, ssl };
}

const client = new pg.Client(parseUrl(rawUrl));

const SQL = `
CREATE TABLE IF NOT EXISTS github_tokens (
  owner     uuid        PRIMARY KEY,
  encrypted_token text  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

try {
  await client.connect();
  console.log('✅  Connected to database');
  await client.query(SQL);
  console.log('✅  github_tokens table ready');
} catch (err) {
  console.error('❌  Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
