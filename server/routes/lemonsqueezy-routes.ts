import type { Express, Request, Response } from 'express';
import crypto from 'crypto';
import { getPublicOrigin } from '../utils/public-url';
import {
  PLAN_CONFIG,
  CREDIT_PACKS,
  type PlanId,
} from '../billing/config';
import {
  getUserById,
  updateUserSubscription,
  getOrCreateDefaultWorkspaceForUser,
  ensureCreditWallet,
  addCredits,
} from '../db/queries';
import type { User } from '../types/auth';

interface AuthRequest extends Request {
  user?: User;
  userId?: number;
}

const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY || '';
const LEMONSQUEEZY_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID || '';
const LEMONSQUEEZY_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '';

const LEMONSQUEEZY_API_URL = 'https://api.lemonsqueezy.com/v1';

class BillingNotConfiguredError extends Error {
  missing: string[];

  constructor(missing: string[]) {
    super(`Billing not configured (${missing.join(', ')})`);
    this.name = 'BillingNotConfiguredError';
    this.missing = missing;
  }
}

const getLemonSqueezyConfig = () => {
  const missing: string[] = [];
  if (!LEMONSQUEEZY_API_KEY) missing.push('LEMONSQUEEZY_API_KEY');
  if (!LEMONSQUEEZY_STORE_ID) missing.push('LEMONSQUEEZY_STORE_ID');
  if (missing.length) {
    throw new BillingNotConfiguredError(missing);
  }
  return { apiKey: LEMONSQUEEZY_API_KEY, storeId: LEMONSQUEEZY_STORE_ID };
};

const getCheckoutRedirectOrigin = (): string => {
  const raw = (process.env.APP_URL || process.env.PUBLIC_URL || '').trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // Best-effort: keep value as-is but normalize trailing slashes.
      return raw.replace(/\/+$/, '');
    }
  }
  return getPublicOrigin();
};

// Get variant ID from plan config or credit pack
const getVariantIdForPlan = (planId: PlanId): string | undefined => {
  return PLAN_CONFIG[planId]?.lemonSqueezyVariantId;
};

const getVariantIdForCreditPack = (packId: string): string | undefined => {
  const pack = CREDIT_PACKS.find(p => p.id === packId);
  return pack?.lemonSqueezyVariantId;
};

// Verify LemonSqueezy webhook signature
const verifyWebhookSignature = (payload: string, signature: string): boolean => {
  if (!LEMONSQUEEZY_WEBHOOK_SECRET) {
    console.error('[LemonSqueezy] Webhook secret not configured');
    return false;
  }

  const hmac = crypto.createHmac('sha256', LEMONSQUEEZY_WEBHOOK_SECRET);
  const digest = hmac.update(payload).digest('hex');
  const sigBuf = Buffer.from(signature);
  const digestBuf = Buffer.from(digest);
  if (sigBuf.length !== digestBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, digestBuf);
};

// Create a LemonSqueezy checkout URL
async function createCheckoutUrl(
  variantId: string,
  userEmail: string,
  userId: number,
  customData?: Record<string, any>
): Promise<string> {
  const { apiKey, storeId } = getLemonSqueezyConfig();
  const redirectOrigin = getCheckoutRedirectOrigin();

  const response = await fetch(`${LEMONSQUEEZY_API_URL}/checkouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: userEmail,
            custom: {
              user_id: String(userId),
              ...customData,
            },
          },
          checkout_options: {
            embed: false,
            media: false,
            logo: true,
          },
          product_options: {
            enabled_variants: [parseInt(variantId, 10)],
            // Redirect back into the app after successful checkout.
            // Use APP_URL/PUBLIC_URL to avoid cross-domain cookie/session issues.
            redirect_url: `${redirectOrigin}/settings?checkout=success`,
          },
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: storeId,
            },
          },
          variant: {
            data: {
              type: 'variants',
              id: variantId,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[LemonSqueezy] Checkout error:', { status: response.status, error });
    throw new Error('Failed to create checkout');
  }

  const data = await response.json();
  return data.data.attributes.url;
}

// Cancel a subscription
async function cancelSubscription(subscriptionId: string): Promise<void> {
  const { apiKey } = getLemonSqueezyConfig();
  const response = await fetch(`${LEMONSQUEEZY_API_URL}/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/vnd.api+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to cancel subscription');
  }
}

// Map variant ID to plan ID
const mapVariantToPlanId = (variantId: string): PlanId | null => {
  for (const [planId, config] of Object.entries(PLAN_CONFIG)) {
    if (config.lemonSqueezyVariantId === variantId) {
      return planId as PlanId;
    }
  }
  return null;
};

// Map variant ID to credit pack
const mapVariantToCreditPack = (variantId: string): typeof CREDIT_PACKS[number] | null => {
  return CREDIT_PACKS.find(p => p.lemonSqueezyVariantId === variantId) || null;
};

export function registerLemonSqueezyRoutes(app: Express, requireAuth: any) {
  // Create checkout for subscription upgrade
  app.post('/api/checkout/subscription', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { planId } = req.body as { planId: PlanId };

      if (!planId || !PLAN_CONFIG[planId]) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      if (planId === 'free') {
        return res.status(400).json({ error: 'Cannot checkout free plan' });
      }

      const variantId = getVariantIdForPlan(planId);
      if (!variantId) {
        return res.status(400).json({ error: 'Plan not available for purchase' });
      }

      const checkoutUrl = await createCheckoutUrl(
        variantId,
        req.user.email,
        req.user.id,
        { plan_id: planId }
      );

      res.json({ checkoutUrl });
    } catch (error: any) {
      if (error instanceof BillingNotConfiguredError) {
        return res.status(503).json({ error: 'Billing not configured', missing: error.missing });
      }
      console.error('[LemonSqueezy] Checkout error:', error);
      res.status(500).json({ error: 'Failed to create checkout' });
    }
  });

  // Create checkout for credit pack purchase
  app.post('/api/checkout/credits', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { packId } = req.body as { packId: string };

      const pack = CREDIT_PACKS.find(p => p.id === packId);
      if (!pack) {
        return res.status(400).json({ error: 'Invalid credit pack' });
      }

      const variantId = getVariantIdForCreditPack(packId);
      if (!variantId) {
        return res.status(400).json({ error: 'Credit pack not available for purchase' });
      }

      const checkoutUrl = await createCheckoutUrl(
        variantId,
        req.user.email,
        req.user.id,
        { pack_id: packId, credits: pack.credits }
      );

      res.json({ checkoutUrl });
    } catch (error: any) {
      if (error instanceof BillingNotConfiguredError) {
        return res.status(503).json({ error: 'Billing not configured', missing: error.missing });
      }
      console.error('[LemonSqueezy] Checkout error:', error);
      res.status(500).json({ error: 'Failed to create checkout' });
    }
  });

  // Get customer portal URL
  app.get('/api/billing/portal', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { apiKey, storeId } = getLemonSqueezyConfig();
      // Get customer from LemonSqueezy by email
      const customersResponse = await fetch(
        `${LEMONSQUEEZY_API_URL}/customers?filter[email]=${encodeURIComponent(req.user.email)}&filter[store_id]=${storeId}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/vnd.api+json',
          },
        }
      );

      if (!customersResponse.ok) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const customersData = await customersResponse.json();
      const customer = customersData.data?.[0];

      if (!customer) {
        return res.status(404).json({ error: 'No billing account found' });
      }

      // Get customer portal URL
      const portalUrl = customer.attributes.urls?.customer_portal;
      if (!portalUrl) {
        return res.status(404).json({ error: 'Portal URL not available' });
      }

      res.json({ portalUrl });
    } catch (error: any) {
      if (error instanceof BillingNotConfiguredError) {
        return res.status(503).json({ error: 'Billing not configured', missing: error.missing });
      }
      console.error('[LemonSqueezy] Portal error:', error);
      res.status(500).json({ error: 'Failed to get portal URL' });
    }
  });

  // Cancel subscription
  app.post('/api/billing/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { apiKey, storeId } = getLemonSqueezyConfig();
      // Get active subscription
      const subscriptionsResponse = await fetch(
        `${LEMONSQUEEZY_API_URL}/subscriptions?filter[user_email]=${encodeURIComponent(req.user.email)}&filter[store_id]=${storeId}&filter[status]=active`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/vnd.api+json',
          },
        }
      );

      const subscriptionsData = await subscriptionsResponse.json();
      const subscription = subscriptionsData.data?.[0];

      if (!subscription) {
        return res.status(404).json({ error: 'No active subscription found' });
      }

      await cancelSubscription(subscription.id);
      res.json({ success: true, message: 'Subscription will be cancelled at end of billing period' });
    } catch (error: any) {
      if (error instanceof BillingNotConfiguredError) {
        return res.status(503).json({ error: 'Billing not configured', missing: error.missing });
      }
      console.error('[LemonSqueezy] Cancel error:', error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });

  // LemonSqueezy Webhook handler
  app.post('/api/webhooks/lemonsqueezy', async (req: Request, res: Response) => {
    try {
      const signatureHeader = req.headers['x-signature'];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
      const rawBody = (req as any).rawBody?.toString() || JSON.stringify(req.body);

      if (typeof signature !== 'string' || !verifyWebhookSignature(rawBody, signature)) {
        console.error('[LemonSqueezy] Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const event = req.body;
      const eventName = event.meta?.event_name;
      const customData = event.meta?.custom_data || {};
      const userId = customData.user_id ? parseInt(customData.user_id, 10) : null;

      console.log(`[LemonSqueezy] Webhook received: ${eventName}`, { userId, customData });

      switch (eventName) {
        case 'subscription_created':
        case 'subscription_updated': {
          const subscription = event.data?.attributes;
          const variantId = String(event.data?.attributes?.variant_id || '');
          const status = subscription?.status;

          if (userId && variantId) {
            const planId = mapVariantToPlanId(variantId);
            if (planId && status === 'active') {
              // Update user subscription
              updateUserSubscription(userId, planId);
              console.log(`[LemonSqueezy] Updated user ${userId} to plan ${planId}`);

              // Apply credits for the new plan
              const user = getUserById(userId);
              if (user) {
                const workspace = getOrCreateDefaultWorkspaceForUser(user);
                ensureCreditWallet(workspace.id, planId);
              }
            } else if (status === 'cancelled' || status === 'expired') {
              // Downgrade to free
              updateUserSubscription(userId, 'free');
              console.log(`[LemonSqueezy] Downgraded user ${userId} to free`);
            }
          }
          break;
        }

        case 'subscription_cancelled': {
          if (userId) {
            // Will be downgraded at end of billing period
            console.log(`[LemonSqueezy] Subscription cancelled for user ${userId}`);
          }
          break;
        }

        case 'subscription_expired': {
          if (userId) {
            updateUserSubscription(userId, 'free');
            console.log(`[LemonSqueezy] Subscription expired for user ${userId}, downgraded to free`);
          }
          break;
        }

        case 'order_created': {
          // Check if this is a credit pack purchase
          const variantId = String(event.data?.attributes?.first_order_item?.variant_id || '');
          const creditPack = mapVariantToCreditPack(variantId);

          if (userId && creditPack) {
            const user = getUserById(userId);
            if (user) {
              const workspace = getOrCreateDefaultWorkspaceForUser(user);
              addCredits(workspace.id, creditPack.credits, 'PURCHASE', {
                source: 'credit_pack_purchase',
                packId: creditPack.id,
                orderId: event.data?.id,
              });
              console.log(`[LemonSqueezy] Added ${creditPack.credits} credits to user ${userId}`);
            }
          }
          break;
        }

        default:
          console.log(`[LemonSqueezy] Unhandled event: ${eventName}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('[LemonSqueezy] Webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
}
