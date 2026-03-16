import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { TOTP } from 'otplib';
import { NobleCryptoPlugin } from '@otplib/plugin-crypto-noble';
import { ScureBase32Plugin } from '@otplib/plugin-base32-scure';
import QRCode from 'qrcode';
import rateLimit from 'express-rate-limit';

// Initialize TOTP instance with plugins
const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

import {
  createUser,
  getUserByEmail,
  getUserById,
  updateUserMFA,
  createSession,
  deleteSession,
  deleteUserSessions,
  createAuditLog,
  hashIP,
  generateToken,
  getSessionByToken,
  getOrCreateUsage,
  // Account lockout
  isAccountLocked,
  recordFailedLogin,
  resetFailedLoginAttempts,
  getLockoutInfo,
  enforceSessionLimit,
  // GDPR
  exportUserData,
  deleteUserAccount,
  recordConsent,
  // Admin
  getSecurityEvents,
  getLockedAccounts,
  unlockAccount,
  getAuditLogs,
  // Email verification
  setVerificationToken,
  getUserByVerificationToken,
  verifyUserEmail,
} from '../db/queries';
import { sendVerificationEmail, isEmailConfigured } from '../email/service';
import type { LoginRequest, RegisterRequest, JWTPayload, MFASetupResponse } from '../types/auth';
import {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  ACCESS_TOKEN_TTL_MINUTES,
  REFRESH_TOKEN_TTL_HOURS,
  BCRYPT_ROUNDS,
  USAGE_LIMITS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIRE_UPPERCASE,
  PASSWORD_REQUIRE_LOWERCASE,
  PASSWORD_REQUIRE_NUMBER,
  PASSWORD_REQUIRE_SPECIAL,
  LOCKOUT_DURATION_MINUTES,
  AUTH_COOKIE_ACCESS,
  AUTH_COOKIE_REFRESH,
  AUTH_COOKIE_SAMESITE
} from './config';
import { requireAuth, requireAdmin, requireMFA } from './middleware';
import { requireSameOrigin } from './same-origin';

const router = Router();
const isProd = process.env.NODE_ENV === 'production';

const baseCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: AUTH_COOKIE_SAMESITE,
  path: '/',
} as const;

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie(AUTH_COOKIE_ACCESS, accessToken, {
    ...baseCookieOptions,
    maxAge: ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
  });

  res.cookie(AUTH_COOKIE_REFRESH, refreshToken, {
    ...baseCookieOptions,
    maxAge: REFRESH_TOKEN_TTL_HOURS * 60 * 60 * 1000,
  });
};

const clearAuthCookies = (res: Response) => {
  res.clearCookie(AUTH_COOKIE_ACCESS, { path: '/', secure: isProd, sameSite: AUTH_COOKIE_SAMESITE });
  res.clearCookie(AUTH_COOKIE_REFRESH, { path: '/', secure: isProd, sameSite: AUTH_COOKIE_SAMESITE });
};

// ===========================================
// RATE LIMITING
// ===========================================

// Strict rate limit for login attempts (5 per minute per IP)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => hashIP(req.ip || 'unknown')
});

// Strict rate limit for registration (3 per minute per IP)
const registerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  message: { error: 'Too many registration attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => hashIP(req.ip || 'unknown')
});

// ===========================================
// PASSWORD VALIDATION
// ===========================================

const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (PASSWORD_REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (PASSWORD_REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (PASSWORD_REQUIRE_NUMBER && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (PASSWORD_REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return { valid: errors.length === 0, errors };
};

// ===========================================
// REGISTER (with email verification)
// ===========================================
router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  const registrationEnabled = process.env.REGISTRATION_ENABLED !== 'false';
  if (!registrationEnabled) {
    createAuditLog(null, 'register', 'failure', '/auth/register', { reason: 'registration_disabled' }, ipHash);
    return res.status(403).json({ error: 'Registration disabled' });
  }

  try {
    const { email, password, organization, consentGiven, consentVersion } = req.body as RegisterRequest;

    // Validate input
    if (!email || !password) {
      createAuditLog(null, 'register', 'failure', '/auth/register', { reason: 'missing_fields' }, ipHash);
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!consentGiven || !consentVersion) {
      createAuditLog(null, 'register', 'failure', '/auth/register', { reason: 'missing_consent' }, ipHash);
      return res.status(400).json({ error: 'Consent required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      createAuditLog(null, 'register', 'failure', '/auth/register', { reason: 'invalid_email' }, ipHash);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Password strength requirements (KRITIS-compliant)
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      createAuditLog(null, 'register', 'failure', '/auth/register', { reason: 'weak_password' }, ipHash);
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        details: passwordValidation.errors
      });
    }

    // Check if user already exists
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      // If user exists but email not verified, allow re-registration
      if (!existingUser.email_verified) {
        // Generate new verification token
        const verificationToken = generateToken();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        setVerificationToken(existingUser.id, verificationToken, tokenExpires);

        // Send verification email
        if (isEmailConfigured()) {
          await sendVerificationEmail(email, verificationToken);
        }

        createAuditLog(existingUser.id, 'register_resend', 'success', '/auth/register', { reason: 'unverified_account' }, ipHash);

        return res.status(200).json({
          message: 'Bitte prüfen Sie Ihre E-Mails und bestätigen Sie Ihre Adresse.',
          requiresVerification: true
        });
      }

      createAuditLog(null, 'register', 'failure', '/auth/register', { reason: 'email_exists' }, ipHash);
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user (email_verified = 0 by default)
    const user = createUser(email, passwordHash, organization);

    // Initialize usage tracking
    getOrCreateUsage(user.id);

    // Record GDPR consent (Art. 7 - consent must be documented)
    recordConsent(user.id, consentVersion);

    // Generate verification token
    const verificationToken = generateToken();
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    setVerificationToken(user.id, verificationToken, tokenExpires);

    // Send verification email
    if (isEmailConfigured()) {
      const emailResult = await sendVerificationEmail(email, verificationToken);
      if (!emailResult.success) {
        console.error('[Auth] Failed to send verification email:', emailResult.error);
      }
    } else {
      console.warn('[Auth] Email service not configured - skipping verification email');
    }

    createAuditLog(user.id, 'register', 'success', '/auth/register', { requiresVerification: true }, ipHash);

    // Don't create session - user must verify email first
    res.status(201).json({
      message: 'Bitte prüfen Sie Ihre E-Mails und bestätigen Sie Ihre Adresse.',
      requiresVerification: true
    });

  } catch (error) {
    console.error('[Auth] Registration error:', error);
    createAuditLog(null, 'register', 'failure', '/auth/register', { error: String(error) }, ipHash);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ===========================================
// LOGIN (with account lockout protection)
// ===========================================
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const { email, password, mfaCode } = req.body as LoginRequest;

    // Validate input
    if (!email || !password) {
      createAuditLog(null, 'login', 'failure', '/auth/login', { reason: 'missing_fields' }, ipHash);
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = getUserByEmail(email);
    if (!user) {
      createAuditLog(null, 'login', 'failure', '/auth/login', { reason: 'user_not_found' }, ipHash);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if email is verified
    if (!user.email_verified) {
      createAuditLog(user.id, 'login', 'failure', '/auth/login', { reason: 'email_not_verified' }, ipHash);
      return res.status(403).json({
        error: 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.',
        emailNotVerified: true,
        email: user.email
      });
    }

    // Check if account is locked
    if (isAccountLocked(user.id)) {
      const lockInfo = getLockoutInfo(user.id);
      createAuditLog(user.id, 'login', 'failure', '/auth/login', { reason: 'account_locked' }, ipHash);
      return res.status(423).json({
        error: 'Account temporarily locked due to too many failed login attempts',
        lockedUntil: lockInfo.lockedUntil,
        retryAfterMinutes: LOCKOUT_DURATION_MINUTES
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      // Record failed attempt
      const lockoutResult = recordFailedLogin(user.id);
      createAuditLog(user.id, 'login', 'failure', '/auth/login', {
        reason: 'invalid_password',
        attemptsRemaining: lockoutResult.attemptsRemaining,
        accountLocked: lockoutResult.locked
      }, ipHash);

      if (lockoutResult.locked) {
        createAuditLog(user.id, 'account_locked', 'success', '/auth/login', {
          reason: 'too_many_failed_attempts'
        }, ipHash);
        return res.status(423).json({
          error: 'Account locked due to too many failed login attempts',
          retryAfterMinutes: LOCKOUT_DURATION_MINUTES
        });
      }

      return res.status(401).json({
        error: 'Invalid credentials',
        attemptsRemaining: lockoutResult.attemptsRemaining
      });
    }

    // Password is valid - reset failed attempts
    resetFailedLoginAttempts(user.id);

    // Check MFA if enabled
    let mfaVerified = false;
    if (user.mfa_enabled && user.totp_secret) {
      if (!mfaCode) {
        // MFA required but not provided
        return res.status(200).json({
          mfaRequired: true,
          message: 'MFA code required'
        });
      }

      // Verify MFA code
      const mfaResult = await totp.verify(mfaCode, { secret: user.totp_secret });

      if (!mfaResult.valid) {
        createAuditLog(user.id, 'login', 'failure', '/auth/login', { reason: 'invalid_mfa' }, ipHash);
        return res.status(401).json({ error: 'Invalid MFA code' });
      }

      mfaVerified = true;
    }

    // Enforce session limits (remove oldest if over limit)
    enforceSessionLimit(user.id);

    // Create refresh/session token
    const sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_HOURS * 60 * 60 * 1000);
    createSession(user.id, sessionToken, expiresAt, ipHash, req.get('user-agent'));

    // Create JWT
    const jwtPayload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      subscription: user.subscription,
      mfaVerified
    };
    const accessToken = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    createAuditLog(user.id, 'login', 'success', '/auth/login', null, ipHash);

    setAuthCookies(res, accessToken, sessionToken);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        subscription: user.subscription,
        mfaEnabled: !!user.mfa_enabled
      }
    });

  } catch (error) {
    console.error('[Auth] Login error:', error);
    createAuditLog(null, 'login', 'failure', '/auth/login', { error: String(error) }, ipHash);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ===========================================
// LOGOUT
// ===========================================
router.post('/logout', requireSameOrigin, (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const refreshToken = (req as any).cookies?.[AUTH_COOKIE_REFRESH] as string | undefined;
    if (refreshToken) {
      deleteSession(refreshToken);
    }

    // Best-effort: invalidate all sessions if access token is still valid
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : ((req as any).cookies?.[AUTH_COOKIE_ACCESS] as string | undefined);

    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET) as JWTPayload;
        deleteUserSessions(decoded.userId);
        createAuditLog(decoded.userId, 'logout', 'success', '/auth/logout', null, ipHash);
      } catch {
        // Ignore invalid/expired access token
      }
    }

    clearAuthCookies(res);

    res.json({ message: 'Logout successful' });

  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ===========================================
// EMAIL VERIFICATION
// ===========================================
router.get('/verify-email', async (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');
  const APP_URL = process.env.APP_URL || 'http://localhost:5000';

  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.redirect(`${APP_URL}/login?error=invalid_token`);
    }

    // Find user by verification token
    const user = getUserByVerificationToken(token);

    if (!user) {
      createAuditLog(null, 'email_verify', 'failure', '/auth/verify-email', { reason: 'invalid_or_expired_token' }, ipHash);
      return res.redirect(`${APP_URL}/login?error=token_expired`);
    }

    // Verify the email
    verifyUserEmail(user.id);

    createAuditLog(user.id, 'email_verify', 'success', '/auth/verify-email', null, ipHash);

    // Redirect to login with success message
    res.redirect(`${APP_URL}/login?verified=true`);

  } catch (error) {
    console.error('[Auth] Email verification error:', error);
    const APP_URL = process.env.APP_URL || 'http://localhost:5000';
    res.redirect(`${APP_URL}/login?error=verification_failed`);
  }
});

// ===========================================
// RESEND VERIFICATION EMAIL
// ===========================================
const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1, // 1 request per minute
  message: { error: 'Bitte warten Sie eine Minute, bevor Sie erneut eine E-Mail anfordern.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => hashIP(req.ip || 'unknown')
});

router.post('/resend-verification', resendVerificationLimiter, async (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'E-Mail-Adresse erforderlich' });
    }

    const user = getUserByEmail(email);

    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: 'Falls ein Konto mit dieser E-Mail existiert, wurde eine Bestätigungs-E-Mail gesendet.' });
    }

    if (user.email_verified) {
      return res.status(400).json({ error: 'E-Mail-Adresse bereits bestätigt' });
    }

    // Generate new verification token
    const verificationToken = generateToken();
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    setVerificationToken(user.id, verificationToken, tokenExpires);

    // Send verification email
    if (isEmailConfigured()) {
      const emailResult = await sendVerificationEmail(email, verificationToken);
      if (!emailResult.success) {
        console.error('[Auth] Failed to resend verification email:', emailResult.error);
        return res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden' });
      }
    } else {
      console.warn('[Auth] Email service not configured');
    }

    createAuditLog(user.id, 'resend_verification', 'success', '/auth/resend-verification', null, ipHash);

    res.json({ message: 'Bestätigungs-E-Mail wurde erneut gesendet.' });

  } catch (error) {
    console.error('[Auth] Resend verification error:', error);
    res.status(500).json({ error: 'Fehler beim Senden der E-Mail' });
  }
});

// ===========================================
// MFA SETUP
// ===========================================
router.post('/mfa/setup', requireAuth, async (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const user = req.user;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA already enabled' });
    }

    // Generate TOTP secret
    const secret = totp.generateSecret();
    const otpauthUrl = `otpauth://totp/VoxDrop:${encodeURIComponent(user.email)}?secret=${secret}&issuer=VoxDrop`;

    // Generate QR code
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    // Store secret temporarily (not enabled yet)
    updateUserMFA(user.id, secret, false);

    createAuditLog(user.id, 'mfa_setup_initiated', 'success', '/auth/mfa/setup', null, ipHash);

    const response: MFASetupResponse = {
      secret,
      qrCode,
      otpauthUrl
    };

    res.json(response);

  } catch (error) {
    console.error('[Auth] MFA setup error:', error);
    res.status(500).json({ error: 'MFA setup failed' });
  }
});

// ===========================================
// MFA VERIFY & ENABLE
// ===========================================
router.post('/mfa/verify', requireAuth, async (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'MFA code required' });
    }

    const user = req.user;
    if (!user || !user.totp_secret) {
      return res.status(404).json({ error: 'MFA not set up' });
    }

    // Verify the code
    const verifyResult = await totp.verify(code, { secret: user.totp_secret });

    if (!verifyResult.valid) {
      createAuditLog(user.id, 'mfa_verify', 'failure', '/auth/mfa/verify', { reason: 'invalid_code' }, ipHash);
      return res.status(400).json({ error: 'Invalid MFA code' });
    }

    // Enable MFA
    updateUserMFA(user.id, user.totp_secret, true);

    createAuditLog(user.id, 'mfa_enabled', 'success', '/auth/mfa/verify', null, ipHash);

    res.json({ message: 'MFA enabled successfully' });

  } catch (error) {
    console.error('[Auth] MFA verify error:', error);
    res.status(500).json({ error: 'MFA verification failed' });
  }
});

// ===========================================
// MFA DISABLE
// ===========================================
router.post('/mfa/disable', requireAuth, async (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password required to disable MFA' });
    }

    const user = req.user;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      createAuditLog(user.id, 'mfa_disable', 'failure', '/auth/mfa/disable', { reason: 'invalid_password' }, ipHash);
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Disable MFA
    updateUserMFA(user.id, null, false);

    createAuditLog(user.id, 'mfa_disabled', 'success', '/auth/mfa/disable', null, ipHash);

    res.json({ message: 'MFA disabled successfully' });

  } catch (error) {
    console.error('[Auth] MFA disable error:', error);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

// ===========================================
// GET CURRENT USER
// ===========================================
router.post('/refresh', requireSameOrigin, (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const refreshToken = (req as any).cookies?.[AUTH_COOKIE_REFRESH] as string | undefined;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const session = getSessionByToken(refreshToken);
    if (!session) {
      createAuditLog(null, 'token_refresh', 'failure', '/auth/refresh', { reason: 'session_invalid' }, ipHash);
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const user = getUserById(session.user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Rotate refresh token
    deleteSession(refreshToken);
    const newSessionToken = generateToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_HOURS * 60 * 60 * 1000);
    createSession(user.id, newSessionToken, expiresAt, ipHash, req.get('user-agent'));

    const jwtPayload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      subscription: user.subscription,
      mfaVerified: true
    };
    const accessToken = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    setAuthCookies(res, accessToken, newSessionToken);

    createAuditLog(user.id, 'token_refresh', 'success', '/auth/refresh', null, ipHash);

    res.json({ message: 'Token refreshed' });
  } catch (error) {
    console.error('[Auth] Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  try {
    const user = getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const usage = getOrCreateUsage(user.id);
    const limits = USAGE_LIMITS[user.subscription as keyof typeof USAGE_LIMITS];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        subscription: user.subscription,
        organization: user.organization,
        mfaEnabled: !!user.mfa_enabled,
        createdAt: user.created_at
      },
      usage: {
        transcriptions: usage.transcriptions_count,
        videos: usage.videos_count,
        limits: {
          transcriptions: limits.transcriptions,
          videos: limits.videos
        }
      }
    });

  } catch (error) {
    console.error('[Auth] Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ===========================================
// GDPR: DATA EXPORT (Art. 20)
// ===========================================
router.post('/user/export', requireAuth, async (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password confirmation required' });
    }

    const user = getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      createAuditLog(user.id, 'data_export', 'failure', '/auth/user/export', { reason: 'invalid_password' }, ipHash);
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Export all user data
    const exportData = exportUserData(user.id);

    createAuditLog(user.id, 'data_export', 'success', '/auth/user/export', null, ipHash);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="voxdrop-data-export-${user.id}.json"`);
    res.json(exportData);

  } catch (error) {
    console.error('[Auth] Data export error:', error);
    res.status(500).json({ error: 'Data export failed' });
  }
});

// ===========================================
// GDPR: ACCOUNT DELETION (Art. 17)
// ===========================================
router.delete('/user', requireAuth, async (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const { password, confirmDeletion } = req.body;

    if (!password || confirmDeletion !== 'DELETE') {
      return res.status(400).json({
        error: 'Password and deletion confirmation required',
        hint: 'Set confirmDeletion to "DELETE" to confirm'
      });
    }

    const user = getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      createAuditLog(user.id, 'account_deletion', 'failure', '/auth/user', { reason: 'invalid_password' }, ipHash);
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Log deletion before deleting
    createAuditLog(user.id, 'account_deletion', 'success', '/auth/user', { email: user.email }, ipHash);

    // Delete account (anonymizes audit logs)
    deleteUserAccount(user.id);

    res.json({ message: 'Account deleted successfully' });

  } catch (error) {
    console.error('[Auth] Account deletion error:', error);
    res.status(500).json({ error: 'Account deletion failed' });
  }
});

// ===========================================
// ADMIN: SECURITY EVENTS
// ===========================================
router.get('/admin/security-events', requireAuth, requireAdmin, requireMFA, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const events = getSecurityEvents(limit, offset);

    res.json({
      events,
      pagination: { limit, offset, count: events.length }
    });

  } catch (error) {
    console.error('[Admin] Security events error:', error);
    res.status(500).json({ error: 'Failed to retrieve security events' });
  }
});

// ===========================================
// ADMIN: LOCKED ACCOUNTS
// ===========================================
router.get('/admin/locked-accounts', requireAuth, requireAdmin, requireMFA, (_req: Request, res: Response) => {
  try {
    const accounts = getLockedAccounts().map(u => ({
      id: u.id,
      email: u.email,
      lockedUntil: u.locked_until,
      failedAttempts: u.failed_login_attempts
    }));

    res.json({ accounts });

  } catch (error) {
    console.error('[Admin] Locked accounts error:', error);
    res.status(500).json({ error: 'Failed to retrieve locked accounts' });
  }
});

// ===========================================
// ADMIN: UNLOCK ACCOUNT
// ===========================================
router.post('/admin/unlock/:userId', requireAuth, requireAdmin, requireMFA, (req: Request, res: Response) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const targetUser = getUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    unlockAccount(userId);

    createAuditLog(req.userId!, 'admin_unlock_account', 'success', `/admin/unlock/${userId}`, {
      targetUserId: userId,
      targetEmail: targetUser.email
    }, ipHash);

    res.json({ message: 'Account unlocked successfully' });

  } catch (error) {
    console.error('[Admin] Unlock account error:', error);
    res.status(500).json({ error: 'Failed to unlock account' });
  }
});

// ===========================================
// ADMIN: AUDIT LOGS
// ===========================================
router.get('/admin/audit-logs', requireAuth, requireAdmin, requireMFA, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const action = req.query.action as string | undefined;

    const logs = getAuditLogs(limit, offset, userId, action);

    res.json({
      logs,
      pagination: { limit, offset, count: logs.length }
    });

  } catch (error) {
    console.error('[Admin] Audit logs error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

export default router;
