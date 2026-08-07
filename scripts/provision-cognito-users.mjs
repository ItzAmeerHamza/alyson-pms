#!/usr/bin/env node
/**
 * Provision Cognito pool users for existing Pulse RDS employees (runs on your laptop —
 * outside the VPC — so no Cognito VPC endpoint is required).
 *
 * Usage (from repo root, with backend/.env loaded):
 *   node scripts/provision-cognito-users.mjs --dry-run
 *   node scripts/provision-cognito-users.mjs
 *   node scripts/provision-cognito-users.mjs --email hamza+pulsetest@cintara.ai
 *
 * Requires: DATABASE_* in backend/.env, AWS creds that can AdminCreateUser,
 * COGNITO_USER_POOL_ID / COGNITO_REGION (or defaults below).
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const require = createRequire(resolve(root, 'backend/package.json'));
const pg = require('pg');
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  UsernameExistsException,
  AdminGetUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(resolve(root, 'backend/.env'));
loadEnvFile(resolve(root, 'infra/sam/deploy.env'));

const dryRun = process.argv.includes('--dry-run');
const emailArgIdx = process.argv.indexOf('--email');
const onlyEmail =
  emailArgIdx >= 0 ? String(process.argv[emailArgIdx + 1] || '').trim().toLowerCase() : '';

const region = process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-west-2';
const userPoolId = process.env.COGNITO_USER_POOL_ID || 'us-west-2_ZL4ElZy4r';

const pool = new pg.Pool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  database: process.env.DATABASE_NAME || 'revclouddb',
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const cognito = new CognitoIdentityProviderClient({ region });

async function main() {
  if (!process.env.DATABASE_HOST || !process.env.DATABASE_USER || !process.env.DATABASE_PASSWORD) {
    throw new Error('Missing DATABASE_* in backend/.env');
  }

  const { rows } = await pool.query(
    `SELECT u.id::text AS id, u.email, u.first_name, u.last_name, e.cognito_sub, e.pulse_role
     FROM tenant."user" u
     JOIN time_doctor.user_extensions e ON e.user_id = u.id
     WHERE e.pulse_role IN ('employee', 'team_leader', 'manager', 'admin')
       AND u.email IS NOT NULL AND trim(u.email) <> ''
       AND (e.cognito_sub IS NULL OR trim(e.cognito_sub) = '')
       ${onlyEmail ? 'AND lower(u.email) = $1' : ''}
     ORDER BY u.id`,
    onlyEmail ? [onlyEmail] : [],
  );

  console.log(`Found ${rows.length} Pulse user(s) missing cognito_sub${dryRun ? ' (dry-run)' : ''}`);
  console.log(`Pool=${userPoolId} region=${region}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const email = String(row.email).trim().toLowerCase();
    const firstName = (row.first_name || email.split('@')[0] || 'User').trim();
    const lastName = (row.last_name || 'Pulse').trim();

    if (dryRun) {
      console.log(`[dry-run] would provision ${email} (user_id=${row.id})`);
      skipped += 1;
      continue;
    }

    try {
      let sub;
      try {
        const created = await cognito.send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            DesiredDeliveryMediums: ['EMAIL'],
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'email_verified', Value: 'true' },
              { Name: 'given_name', Value: firstName },
              { Name: 'family_name', Value: lastName },
            ],
          }),
        );
        sub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
        console.log(`created Cognito user ${email}`);
      } catch (err) {
        if (!(err instanceof UsernameExistsException)) throw err;
        const existing = await cognito.send(
          new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
        );
        sub = existing.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
        console.log(`linked existing Cognito user ${email}`);
      }

      if (!sub) throw new Error('no cognito sub');

      await pool.query(
        `UPDATE time_doctor.user_extensions
         SET cognito_sub = $2, updated_at = NOW()
         WHERE user_id = $1::int`,
        [row.id, sub],
      );
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${email}: ${err?.message || err}`);
    }
  }

  console.log(`Done. ok=${ok} dry-run/skipped=${skipped} failed=${failed}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
