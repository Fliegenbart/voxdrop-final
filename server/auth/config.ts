// Auth configuration

// ============================================
// CRITICAL: Environment variable validation
// Server MUST NOT start without these secrets
// ============================================

const validateRequiredEnv = (name: string, value: string | undefined): string => {
  if (!value || value.trim() === '') {
    console.error(`\n❌ FATAL: Missing required environment variable: ${name}`);
    console.error(`   Please set ${name} in your .env file or environment.\n`);
    process.exit(1);
  }
  return value;
};

// JWT secret - REQUIRED, no fallback allowed
export const JWT_SECRET = validateRequiredEnv('JWT_SECRET', process.env.JWT_SECRET);

// IP hash salt for GDPR-compliant logging - REQUIRED
export const IP_HASH_SALT = validateRequiredEnv('IP_HASH_SALT', process.env.IP_HASH_SALT);

// Short-lived access token (cookie-based)
export const JWT_EXPIRES_IN = '15m';
export const ACCESS_TOKEN_TTL_MINUTES = 15;

// Refresh/session token (stored in DB + HttpOnly cookie)
export const REFRESH_TOKEN_TTL_HOURS = 24;
export const BCRYPT_ROUNDS = 12;

// Account lockout settings
export const LOCKOUT_THRESHOLD = 5; // Failed attempts before lockout
export const LOCKOUT_DURATION_MINUTES = 15; // Lockout duration

// Password policy
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_REQUIRE_UPPERCASE = true;
export const PASSWORD_REQUIRE_LOWERCASE = true;
export const PASSWORD_REQUIRE_NUMBER = true;
export const PASSWORD_REQUIRE_SPECIAL = true;

// Session limits
export const MAX_CONCURRENT_SESSIONS = 5;

// Cookie settings
export const AUTH_COOKIE_ACCESS = 'voxdrop_access';
export const AUTH_COOKIE_REFRESH = 'voxdrop_refresh';
export const AUTH_COOKIE_SAMESITE: 'lax' | 'strict' = 'lax';

// Usage limits per subscription tier
export const USAGE_LIMITS = {
  free: { transcriptions: 5, videos: 5 },
  pro: { transcriptions: -1, videos: -1 },
  premium: { transcriptions: -1, videos: -1 },
  team: { transcriptions: -1, videos: -1 } // -1 = unlimited (legacy)
};
