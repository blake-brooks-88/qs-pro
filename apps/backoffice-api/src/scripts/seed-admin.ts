import 'dotenv/config';

import { auth } from '../auth/auth.js';

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

  try {
    await auth.api.createUser({
      body: { email, password, name, role: 'admin' },
    });

    console.warn(`Admin user created: ${email}`);
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to create admin user: ${message}`);
    process.exit(1);
  }
}

main();
