/**
 * Seed script to create a test account with full functionality
 * Run with: npx tsx server/db/seed-test-account.ts
 */

import db from './init';
import bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../auth/config';

// Test account credentials
const TEST_ACCOUNT = {
  email: 'test@voxdrop.live',
  password: 'VoxDrop2026!Test',
  subscription: 'team', // Unlimited usage
  organization: 'VoxDrop Testteam'
};

async function seedTestAccount() {
  console.log('\n🌱 VoxDrop Test Account Seeder\n');

  // Check if account already exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(TEST_ACCOUNT.email);

  if (existing) {
    console.log(`⚠️  Account ${TEST_ACCOUNT.email} existiert bereits.`);

    // Update to team subscription if not already
    db.prepare(`
      UPDATE users
      SET subscription = 'team',
          organization = ?,
          email_verified = 1,
          verification_token = NULL,
          verification_token_expires = NULL
      WHERE email = ?
    `).run(TEST_ACCOUNT.organization, TEST_ACCOUNT.email);

    console.log('✅ Subscription auf "team" (unlimited) und E-Mail-Verifikation aktualisiert.\n');
  } else {
    // Hash password
    const passwordHash = await bcrypt.hash(TEST_ACCOUNT.password, BCRYPT_ROUNDS);

    // Create account
    db.prepare(`
      INSERT INTO users (
        email,
        password_hash,
        subscription,
        organization,
        email_verified,
        verification_token,
        verification_token_expires
      )
      VALUES (?, ?, ?, ?, 1, NULL, NULL)
    `).run(TEST_ACCOUNT.email, passwordHash, TEST_ACCOUNT.subscription, TEST_ACCOUNT.organization);

    console.log('✅ Testaccount erstellt!\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TESTACCOUNT ZUGANGSDATEN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  E-Mail:    ${TEST_ACCOUNT.email}`);
  console.log(`  Passwort:  ${TEST_ACCOUNT.password}`);
  console.log(`  Plan:      Team (Unlimited)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📋 Diesen Account können Sie mit Ihren Kollegen teilen.\n');

  process.exit(0);
}

seedTestAccount().catch(err => {
  console.error('❌ Fehler:', err);
  process.exit(1);
});
