import { getUserByEmail, setUserRoleByEmail } from '../db/queries';

/**
 * Bootstraps one or more admin users for on-prem installs.
 *
 * Usage:
 *   BOOTSTRAP_ADMIN_EMAILS="alice@example.de,bob@example.de"
 *
 * This is intentionally idempotent and only promotes existing users.
 */
export const bootstrapAdminsFromEnv = () => {
  const raw = process.env.BOOTSTRAP_ADMIN_EMAILS;
  if (!raw) return;

  const emails = raw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) return;

  for (const email of emails) {
    const user = getUserByEmail(email);
    if (!user) {
      console.warn(`[Bootstrap] Admin email not found (skipping): ${email}`);
      continue;
    }
    if (user.role === 'admin') continue;
    setUserRoleByEmail(email, 'admin');
    console.log(`[Bootstrap] Promoted user to admin: ${email}`);
  }
};

