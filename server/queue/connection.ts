import IORedis from 'ioredis';

// Redis connection URL from environment
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Skip Redis in development if SKIP_REDIS is set or Redis is not available
const SKIP_REDIS = process.env.SKIP_REDIS === 'true' || process.env.NODE_ENV === 'development';

// Track whether we've already logged the Redis unavailable message
let redisErrorLogged = false;

// Create Redis connection for BullMQ (lazy - may fail if Redis not running)
export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy: (times) => {
    if (SKIP_REDIS && times > 1) {
      // In dev mode, only try once then stop
      return null;
    }
    // In production, keep retrying with exponential backoff
    return Math.min(times * 100, 3000);
  },
  lazyConnect: SKIP_REDIS, // Don't connect immediately in dev mode
});

// Create separate connection for pub/sub (SSE events)
export const redisPubSub = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    if (SKIP_REDIS && times > 1) {
      return null;
    }
    return Math.min(times * 100, 3000);
  },
  lazyConnect: SKIP_REDIS,
});

// Log connection status
redisConnection.on('connect', () => {
  console.log('[Queue] Redis connected');
});

redisConnection.on('error', () => {
  if (!redisErrorLogged) {
    console.warn('[Queue] Redis not available - background jobs disabled. Run Redis for full functionality.');
    redisErrorLogged = true;
  }
});

redisPubSub.on('error', () => {
  // Suppress duplicate errors from pub/sub connection
});

// Check if Redis is available
export async function isRedisAvailable(): Promise<boolean> {
  if (SKIP_REDIS && redisErrorLogged) {
    return false;
  }
  try {
    await redisConnection.ping();
    return true;
  } catch {
    if (!redisErrorLogged) {
      console.warn('[Queue] Redis not available - background jobs disabled.');
      redisErrorLogged = true;
    }
    return false;
  }
}
