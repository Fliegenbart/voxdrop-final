import { Response } from 'express';
import { redisPubSub } from './connection';

// Channel name for job events
const JOB_EVENTS_CHANNEL = 'job-events';

// Skip Redis in development
const SKIP_REDIS = process.env.SKIP_REDIS === 'true' || process.env.NODE_ENV === 'development';

interface SSEClient {
  userId: number;
  response: Response;
  jobIds: Set<string>;
}

interface JobEvent {
  jobId: string;
  userId: number;
  type: 'progress' | 'completed' | 'failed';
  data: {
    status?: string;
    stage?: string;
    percent?: number;
    resultFilePath?: string;
    error?: string;
    result?: any;
    details?: any;
    chapterCount?: number;
    [key: string]: any; // Allow additional properties
  };
}

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private isSubscribed = false;

  constructor() {
    this.setupRedisSubscription();
  }

  // Setup Redis pub/sub subscription
  private async setupRedisSubscription() {
    if (this.isSubscribed) return;
    if (SKIP_REDIS) {
      console.log('[SSE] Redis disabled in development - using local-only mode');
      return;
    }

    try {
      await redisPubSub.subscribe(JOB_EVENTS_CHANNEL);
      this.isSubscribed = true;

      redisPubSub.on('message', (channel, message) => {
        if (channel === JOB_EVENTS_CHANNEL) {
          try {
            const event: JobEvent = JSON.parse(message);
            this.broadcastToClients(event);
          } catch (err) {
            console.error('[SSE] Failed to parse event:', err);
          }
        }
      });

      console.log('[SSE] Redis subscription active');
    } catch (err) {
      console.error('[SSE] Failed to setup Redis subscription:', err);
      // Only retry in production
      if (!SKIP_REDIS) {
        setTimeout(() => this.setupRedisSubscription(), 5000);
      }
    }
  }

  // Add a new SSE client
  addClient(clientId: string, userId: number, res: Response, jobIds: string[]) {
    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

    // Store client
    this.clients.set(clientId, {
      userId,
      response: res,
      jobIds: new Set(jobIds),
    });

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(clientId);
    });

    console.log(`[SSE] Client ${clientId} connected, watching ${jobIds.length} jobs`);
  }

  // Remove a client
  removeClient(clientId: string) {
    this.clients.delete(clientId);
    console.log(`[SSE] Client ${clientId} disconnected`);
  }

  // Add job to client's watch list
  addJobToClient(clientId: string, jobId: string) {
    const client = this.clients.get(clientId);
    if (client) {
      client.jobIds.add(jobId);
    }
  }

  // Broadcast event to relevant clients
  private broadcastToClients(event: JobEvent) {
    for (const [clientId, client] of this.clients) {
      // Only send to clients watching this job and owned by this user
      if (client.userId === event.userId && client.jobIds.has(event.jobId)) {
        try {
          client.response.write(`event: ${event.type}\ndata: ${JSON.stringify({
            jobId: event.jobId,
            ...event.data,
          })}\n\n`);
        } catch (err) {
          console.error(`[SSE] Failed to send to client ${clientId}:`, err);
          this.removeClient(clientId);
        }
      }
    }
  }

  // Publish an event (called by workers)
  static async publishEvent(event: JobEvent) {
    if (SKIP_REDIS) return; // Skip in dev mode
    try {
      const { redisConnection } = await import('./connection');
      await redisConnection.publish(JOB_EVENTS_CHANNEL, JSON.stringify(event));
    } catch (err) {
      // Silently fail in dev mode
      if (!SKIP_REDIS) {
        console.error('[SSE] Failed to publish event:', err);
      }
    }
  }

  // Send event directly (for use in same process)
  sendEvent(event: JobEvent) {
    this.broadcastToClients(event);
  }

  // Get number of connected clients
  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton instance
export const sseManager = new SSEManager();

// Helper to publish events from anywhere
export async function publishJobEvent(
  jobId: string,
  userId: number,
  type: JobEvent['type'],
  data: JobEvent['data']
) {
  const event: JobEvent = { jobId, userId, type, data };

  // Try direct broadcast first (same process)
  sseManager.sendEvent(event);

  // Also publish to Redis for distributed setup
  await SSEManager.publishEvent(event);
}
