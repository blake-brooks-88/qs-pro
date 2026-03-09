import fs from 'node:fs';
import path from 'node:path';

import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { hashPassword } from 'better-auth/crypto';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { boUsers, boAccounts } from '@qpp/database';

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME;

  if (!email || !password || !name) {
    console.error(
      'Missing required env vars: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME',
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL_BACKOFFICE;
  if (!connectionString) {
    console.error('Missing required env var: DATABASE_URL_BACKOFFICE');
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    const [existing] = await db
      .select({ id: boUsers.id })
      .from(boUsers)
      .where(eq(boUsers.email, email))
      .limit(1);

    if (existing) {
      console.warn('Admin user already exists — skipping seed.');
      await client.end();
      return;
    }

    const userId = crypto.randomUUID();

    await db.insert(boUsers).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      role: 'admin',
    });

    const hashedPassword = await hashPassword(password);

    await db.insert(boAccounts).values({
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: 'credential',
      password: hashedPassword,
    });

    console.warn('Admin user created successfully.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to create admin user: ${message}`);
    await client.end();
    process.exit(1);
  }

  await client.end();
}

main();
