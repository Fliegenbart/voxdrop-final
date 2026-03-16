import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getUserById, getOrCreateUsage, createAuditLog, hashIP, incrementUsage, getSessionByToken } from '../db/queries';
import type { JWTPayload, User } from '../types/auth';
import { SUBSCRIPTION_PLAN_MAP, type PlanId } from '../billing/config';
import { PLAN_HIERARCHY } from '../billing/feature-gates';
import { isSameOriginRequest } from './same-origin';
import {
  JWT_SECRET,
  USAGE_LIMITS,
  AUTH_COOKIE_ACCESS,
  AUTH_COOKIE_REFRESH,
  ACCESS_TOKEN_TTL_MINUTES,
  AUTH_COOKIE_SAMESITE
} from './config';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: number;
      jwtPayload?: JWTPayload;
      sessionToken?: string;
    }
  }
}

const getAccessToken = (req: Request): string | undefined => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token && token !== 'cookie') {
      return token;
    }
  }

  const cookieToken = (req as any).cookies?.[AUTH_COOKIE_ACCESS];
  return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : undefined;
};

const getSessionToken = (req: Request): string | undefined => {
  const cookieToken = (req as any).cookies?.[AUTH_COOKIE_REFRESH];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }

  const headerToken = req.headers['x-session-token'];
  return typeof headerToken === 'string' && headerToken.length > 0 ? headerToken : undefined;
};

const shouldEnforceSameOriginForAuth = (req: Request): boolean => {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;

  // Only enforce for browser-style cookie auth where secrets are attached automatically.
  const refreshCookie = (req as any).cookies?.[AUTH_COOKIE_REFRESH];
  const hasRefreshCookie = typeof refreshCookie === 'string' && refreshCookie.length > 0;

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7).trim()
    : '';
  const accessTokenFromHeader = Boolean(bearerToken && bearerToken !== 'cookie');

  // Cookie + cookie (access token via cookie, session token via refresh cookie)
  return hasRefreshCookie && !accessTokenFromHeader;
};

const resolvePlanId = (subscription: string | undefined): PlanId => {
  const raw = subscription || 'free';
  return SUBSCRIPTION_PLAN_MAP[raw] || 'free';
};

/**
 * Middleware to require authentication
 * Verifies JWT token and attaches user to request
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const ipHash = hashIP(req.ip || 'unknown');

  try {
    const accessToken = getAccessToken(req);
    const sessionToken = getSessionToken(req);

    if (!accessToken || !sessionToken) {
      createAuditLog(null, 'auth_required', 'failure', req.path, { reason: 'no_token' }, ipHash);
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const decoded = jwt.verify(accessToken, JWT_SECRET) as JWTPayload;
      const session = getSessionByToken(sessionToken);

      if (!session || session.user_id !== decoded.userId) {
        createAuditLog(decoded.userId, 'auth_required', 'failure', req.path, { reason: 'session_invalid' }, ipHash);
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      const user = getUserById(decoded.userId);

      if (!user) {
        createAuditLog(decoded.userId, 'auth_required', 'failure', req.path, { reason: 'user_not_found' }, ipHash);
        return res.status(401).json({ error: 'User not found' });
      }

      req.user = user;
      req.userId = user.id;
      req.jwtPayload = decoded;
      req.sessionToken = sessionToken;

      if (shouldEnforceSameOriginForAuth(req) && !isSameOriginRequest(req)) {
        createAuditLog(user.id, 'csrf_blocked', 'failure', req.path, { reason: 'origin_mismatch' }, ipHash);
        return res.status(403).json({ error: 'CSRF protection: invalid origin' });
      }

      next();
    } catch (jwtError) {
      // Attempt silent refresh when access token expired but refresh/session token is still valid.
      const session = getSessionByToken(sessionToken);
      if (!session) {
        createAuditLog(null, 'auth_required', 'failure', req.path, { reason: 'invalid_token' }, ipHash);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const user = getUserById(session.user_id);
      if (!user) {
        createAuditLog(session.user_id, 'auth_required', 'failure', req.path, { reason: 'user_not_found' }, ipHash);
        return res.status(401).json({ error: 'User not found' });
      }

      const jwtPayload: JWTPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        subscription: user.subscription,
        mfaVerified: true
      };

      const newAccessToken = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: `${ACCESS_TOKEN_TTL_MINUTES}m` });
      res.cookie(AUTH_COOKIE_ACCESS, newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: AUTH_COOKIE_SAMESITE,
        path: '/',
        maxAge: ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
      });

      req.user = user;
      req.userId = user.id;
      req.jwtPayload = jwtPayload;
      req.sessionToken = sessionToken;

      if (shouldEnforceSameOriginForAuth(req) && !isSameOriginRequest(req)) {
        createAuditLog(user.id, 'csrf_blocked', 'failure', req.path, { reason: 'origin_mismatch' }, ipHash);
        return res.status(403).json({ error: 'CSRF protection: invalid origin' });
      }

      next();
    }
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

/**
 * Middleware to optionally authenticate
 * Attaches user to request if token is valid, but doesn't block if not
 */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const accessToken = getAccessToken(req);
    const sessionToken = getSessionToken(req);

    if (accessToken && sessionToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET) as JWTPayload;
        const session = getSessionByToken(sessionToken);
        if (!session || session.user_id !== decoded.userId) {
          return next();
        }
        const user = getUserById(decoded.userId);

        if (user) {
          req.user = user;
          req.userId = user.id;
          req.jwtPayload = decoded;
          req.sessionToken = sessionToken;
        }
      } catch {
        // Token invalid, but we don't block - just continue without user
      }
    }

    next();
  } catch (error) {
    console.error('[Auth Middleware] Optional auth error:', error);
    next();
  }
};

/**
 * Middleware to require admin role
 * Must be used after requireAuth
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const ipHash = hashIP(req.ip || 'unknown');

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    createAuditLog(req.user.id, 'admin_required', 'failure', req.path, { role: req.user.role }, ipHash);
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

/**
 * Middleware to require MFA verification
 * Must be used after requireAuth
 */
export const requireMFA = (req: Request, res: Response, next: NextFunction) => {
  const ipHash = hashIP(req.ip || 'unknown');

  if (!req.user || !req.jwtPayload) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // If user has MFA enabled, verify it was completed
  if (req.user.mfa_enabled && !req.jwtPayload.mfaVerified) {
    createAuditLog(req.user.id, 'mfa_required', 'failure', req.path, { reason: 'mfa_not_verified' }, ipHash);
    return res.status(403).json({ error: 'MFA verification required' });
  }

  next();
};

/**
 * Middleware to check usage limits
 * Must be used after requireAuth
 * @param type - 'transcriptions' or 'videos'
 */
export const checkUsageLimit = (type: 'transcriptions' | 'videos') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ipHash = hashIP(req.ip || 'unknown');

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const usage = getOrCreateUsage(req.user.id);
    const planId = resolvePlanId(req.user.subscription);
    const limits = (USAGE_LIMITS as any)[planId] || USAGE_LIMITS.free;
    const currentCount = type === 'transcriptions' ? usage.transcriptions_count : usage.videos_count;
    const limit = type === 'transcriptions' ? limits.transcriptions : limits.videos;

    // -1 means unlimited
    if (limit !== -1 && currentCount >= limit) {
      createAuditLog(
        req.user.id,
        'usage_limit_exceeded',
        'failure',
        req.path,
        { type, current: currentCount, limit },
        ipHash
      );

      return res.status(429).json({
        error: 'Usage limit exceeded',
        type,
        current: currentCount,
        limit,
        subscription: req.user.subscription,
        upgradeRequired: req.user.subscription !== 'team'
      });
    }

    next();
  };
};

/**
 * Middleware to increment usage after successful operation
 * Call this AFTER the operation succeeds
 * @param type - 'transcriptions' or 'videos'
 */
export const trackUsage = (type: 'transcriptions' | 'videos') => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original res.json to intercept successful responses
    const originalJson = res.json.bind(res);

    res.json = function(body: any) {
      // Only increment on successful responses (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        try {
          incrementUsage(req.user.id, type);
        } catch (error) {
          console.error('[Usage Tracking] Error:', error);
        }
      }

      return originalJson(body);
    };

    next();
  };
};

/**
 * Middleware to require specific subscription tier
 * Must be used after requireAuth
 */
export const requireSubscription = (...allowedTiers: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ipHash = hashIP(req.ip || 'unknown');

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPlan = resolvePlanId(req.user.subscription);
    const allowedPlans = allowedTiers.map((tier) => SUBSCRIPTION_PLAN_MAP[tier] || tier);

    if (!allowedPlans.includes(userPlan) && !allowedTiers.includes(req.user.subscription)) {
      createAuditLog(
        req.user.id,
        'subscription_required',
        'failure',
        req.path,
        { required: allowedTiers, current: req.user.subscription, currentPlan: userPlan },
        ipHash
      );

      return res.status(403).json({
        error: 'Subscription upgrade required',
        requiredTiers: allowedTiers,
        currentTier: req.user.subscription,
        currentPlan: userPlan
      });
    }

    next();
  };
};

/**
 * Middleware to require a minimum plan (free < pro < premium).
 * This is preferred over requireSubscription() for new endpoints.
 */
export const requireMinPlan = (minPlan: PlanId) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ipHash = hashIP(req.ip || 'unknown');

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPlan = resolvePlanId(req.user.subscription);
    if (PLAN_HIERARCHY[userPlan] < PLAN_HIERARCHY[minPlan]) {
      createAuditLog(
        req.user.id,
        'subscription_required',
        'failure',
        req.path,
        { requiredMinPlan: minPlan, currentPlan: userPlan, currentTier: req.user.subscription },
        ipHash
      );

      return res.status(403).json({
        error: 'Subscription upgrade required',
        requiredMinPlan: minPlan,
        currentPlan: userPlan,
      });
    }

    next();
  };
};

// ===========================================
// GPU RATE LIMITING
// ===========================================

// In-memory rate limit store (per user)
// Structure: { userId -> { endpoint -> { count, windowStart } } }
const gpuRateLimitStore = new Map<number, Map<string, { count: number; windowStart: number }>>();

// Rate limits per subscription tier (requests per minute)
const GPU_RATE_LIMITS: Record<string, number> = {
  free: 2,      // 2 requests per minute
  pro: 5,       // 5 requests per minute
  premium: 8,   // 8 requests per minute
  team: 10,     // 10 requests per minute (legacy)
};

// Window size in milliseconds (1 minute)
const RATE_LIMIT_WINDOW = 60 * 1000;

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, endpoints] of gpuRateLimitStore.entries()) {
    for (const [endpoint, data] of endpoints.entries()) {
      if (now - data.windowStart > RATE_LIMIT_WINDOW * 2) {
        endpoints.delete(endpoint);
      }
    }
    if (endpoints.size === 0) {
      gpuRateLimitStore.delete(userId);
    }
  }
}, 5 * 60 * 1000);

/**
 * Middleware to rate limit GPU-intensive endpoints
 * Limits requests per minute based on subscription tier
 * Must be used after requireAuth
 *
 * @param endpointKey - Unique key for this endpoint (e.g., 'transcribe', 'pptx', 'simplify')
 */
export const gpuRateLimit = (endpointKey: string, overrides?: Partial<Record<string, number>>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ipHash = hashIP(req.ip || 'unknown');

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;
    const planId = resolvePlanId(req.user.subscription);
    const subscription = req.user.subscription || 'free';
    const baseLimit = GPU_RATE_LIMITS[planId] || GPU_RATE_LIMITS[subscription] || GPU_RATE_LIMITS.free;
    const override = overrides?.[planId] ?? overrides?.[subscription];
    const limit = (typeof override === 'number' && Number.isFinite(override) && override > 0)
      ? Math.floor(override)
      : baseLimit;
    const now = Date.now();

    // Get or create user's rate limit map
    if (!gpuRateLimitStore.has(userId)) {
      gpuRateLimitStore.set(userId, new Map());
    }
    const userLimits = gpuRateLimitStore.get(userId)!;

    // Get or create endpoint rate limit data
    let limitData = userLimits.get(endpointKey);
    if (!limitData || now - limitData.windowStart > RATE_LIMIT_WINDOW) {
      // Start new window
      limitData = { count: 0, windowStart: now };
      userLimits.set(endpointKey, limitData);
    }

    // Check if over limit
    if (limitData.count >= limit) {
      const resetTime = Math.ceil((limitData.windowStart + RATE_LIMIT_WINDOW - now) / 1000);

      createAuditLog(
        userId,
        'gpu_rate_limit_exceeded',
        'failure',
        req.path,
        { endpoint: endpointKey, count: limitData.count, limit, subscription },
        ipHash
      );

      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Zu viele Anfragen. Bitte warten Sie ${resetTime} Sekunden.`,
        limit,
        current: limitData.count,
        resetInSeconds: resetTime,
        subscription,
        upgradeMessage: planId === 'free'
          ? 'Upgrade auf Pro für höhere Limits'
          : planId === 'pro'
            ? 'Upgrade auf Premium für höhere Limits'
            : undefined,
      });
    }

    // Increment count
    limitData.count++;

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', (limit - limitData.count).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil((limitData.windowStart + RATE_LIMIT_WINDOW) / 1000).toString());

    next();
  };
};

/**
 * Get current rate limit status for a user
 * Useful for displaying in the UI
 */
export const getRateLimitStatus = (userId: number, endpointKey: string, subscription: string) => {
  const limit = GPU_RATE_LIMITS[subscription] || GPU_RATE_LIMITS.free;
  const now = Date.now();

  const userLimits = gpuRateLimitStore.get(userId);
  if (!userLimits) {
    return { count: 0, limit, remaining: limit, resetInSeconds: 0 };
  }

  const limitData = userLimits.get(endpointKey);
  if (!limitData || now - limitData.windowStart > RATE_LIMIT_WINDOW) {
    return { count: 0, limit, remaining: limit, resetInSeconds: 0 };
  }

  const resetInSeconds = Math.ceil((limitData.windowStart + RATE_LIMIT_WINDOW - now) / 1000);
  return {
    count: limitData.count,
    limit,
    remaining: Math.max(0, limit - limitData.count),
    resetInSeconds,
  };
};
