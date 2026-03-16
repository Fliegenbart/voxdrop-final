import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  PLAN_CONFIG,
  CREDIT_COSTS,
  CREDIT_COSTS_LIST,
  type PlanId,
} from '../billing/config';
import { PUBLIC_BILLING_CONFIG } from '../billing/public-config';
import {
  applyMonthlyAllocation,
  getOrCreateDefaultWorkspaceForUser,
  getWorkspaceById,
  getWorkspaceMember,
  getCreditUsageSummary,
  reserveCredits,
  releaseCredits,
  consumeCredits,
  ensureCreditWallet,
} from '../db/queries';
import { createAuditLog, hashIP } from '../db/queries';
import type { User } from '../types/auth';

interface AuthRequest extends Request {
  user?: User;
  userId?: number;
}

const jobEstimateSchema = z.object({
  jobType: z.enum([
    'doc_check',
    'pdfua_export',
    'ppt_slide_analyze',
    'asr_transcription',
    'tts_generation',
  ]),
  inputMeta: z.record(z.any()).default({}),
});

const jobStartSchema = jobEstimateSchema.extend({
  workspaceId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
});

const jobCallbackSchema = z.object({
  workspaceId: z.string().uuid(),
  jobId: z.string().uuid(),
  status: z.enum(['completed', 'failed', 'cancelled']),
  credits: z.number().int().positive(),
});

const resolveWorkspace = (req: AuthRequest) => {
  if (!req.user) {
    throw new Error('auth_required');
  }

  const workspaceId =
    typeof req.query.workspaceId === 'string'
      ? req.query.workspaceId
      : typeof (req.body as any)?.workspaceId === 'string'
        ? (req.body as any).workspaceId
        : undefined;

  if (workspaceId) {
    const workspace = getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error('workspace_not_found');
    }
    const membership = getWorkspaceMember(workspaceId, req.user.id);
    if (!membership) {
      throw new Error('workspace_forbidden');
    }
    return workspace;
  }

  return getOrCreateDefaultWorkspaceForUser(req.user);
};

const estimateCredits = (jobType: string, inputMeta: Record<string, any>) => {
  const costLookup = Object.fromEntries(CREDIT_COSTS_LIST.map(item => [item.key, item.credits]));
  const costMap: Record<string, { unit: 'pages' | 'slides' | 'minutes'; creditsPerUnit: number }> = {
    doc_check: { unit: 'pages', creditsPerUnit: Number(costLookup.DOC_CHECK_PAGE || 1) },
    pdfua_export: { unit: 'pages', creditsPerUnit: Number(costLookup.PDFUA_EXPORT_PAGE || 2) },
    ppt_slide_analyze: { unit: 'slides', creditsPerUnit: Number(costLookup.PPT_SLIDE_ANALYZE || 2) },
    asr_transcription: { unit: 'minutes', creditsPerUnit: Number(costLookup.ASR_MINUTE || 10) },
    tts_generation: { unit: 'minutes', creditsPerUnit: Number(costLookup.TTS_MINUTE || 6) },
  };

  const rule = costMap[jobType];
  if (!rule) {
    return { credits: 0, unitCount: 0, unit: 'units', creditsPerUnit: 0 };
  }

  let unitCount = 0;
  if (rule.unit === 'pages') {
    unitCount = Number(inputMeta.pages || inputMeta.pageCount || 0);
  } else if (rule.unit === 'slides') {
    unitCount = Number(inputMeta.slides || inputMeta.slideCount || 0);
  } else {
    const minutes = inputMeta.minutes
      ? Number(inputMeta.minutes)
      : inputMeta.durationSeconds
        ? Math.ceil(Number(inputMeta.durationSeconds) / 60)
        : 0;
    unitCount = minutes;
  }

  if (!Number.isFinite(unitCount) || unitCount < 0) {
    unitCount = 0;
  }

  const normalizedUnits = Math.ceil(unitCount);
  const credits = Math.max(0, normalizedUnits * rule.creditsPerUnit);
  return { credits, unitCount: normalizedUnits, unit: rule.unit, creditsPerUnit: rule.creditsPerUnit };
};

export function registerBillingRoutes(app: Express, requireAuth: any) {
  app.get('/api/billing/plans', (_req, res) => {
    res.json(PUBLIC_BILLING_CONFIG);
  });

  app.get('/api/credits/balance', requireAuth, (req: AuthRequest, res: Response) => {
    // Polled frequently in the UI. Avoid conditional 304 responses (breaks fetch().json()).
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("ETag", String(Date.now()));

    try {
      const workspace = resolveWorkspace(req);
      const planId = workspace.plan_id as PlanId;
      const wallet = ensureCreditWallet(workspace.id, planId);
      const monthlyLimit = PLAN_CONFIG[planId]?.includedCreditsPerMonth || 0;
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const monthlyUsage = getCreditUsageSummary(workspace.id, startOfMonth, new Date());
      const monthlyConsumed = monthlyUsage?.totals?.consumed || 0;
      const available = wallet.balance;
      const total = wallet.balance + wallet.reserved;
      res.json({
        workspaceId: workspace.id,
        planId,
        monthlyLimit,
        monthlyConsumed,
        balance: wallet.balance,
        reserved: wallet.reserved,
        available,
        total,
        lastAllocationAt: wallet.last_allocation_at,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Unable to resolve workspace' });
    }
  });

  app.post('/api/credits/estimate', requireAuth, (req: AuthRequest, res: Response) => {
    const schema = z.object({
      costKey: z.string(),
      quantity: z.number().finite().positive(),
      workspaceId: z.string().uuid().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { costKey, quantity } = parsed.data;
    const cost = (CREDIT_COSTS as any)[costKey] as { label: string; unit: string; credits: number } | undefined;
    if (!cost) {
      return res.status(400).json({ error: 'Invalid costKey' });
    }

    try {
      const workspace = resolveWorkspace(req);
      const wallet = ensureCreditWallet(workspace.id, workspace.plan_id as PlanId);
      const estimatedCredits = Math.max(0, Math.ceil(quantity) * Number(cost.credits || 0));
      res.json({
        costKey,
        quantity: Math.ceil(quantity),
        label: cost.label,
        unit: cost.unit,
        creditsPerUnit: cost.credits,
        estimatedCredits,
        currentBalance: wallet.balance,
        sufficient: wallet.balance >= estimatedCredits,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Unable to estimate credits' });
    }
  });

  app.get('/api/credits/usage', requireAuth, (req: AuthRequest, res: Response) => {
    try {
      const workspace = resolveWorkspace(req);
      const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = req.query.to ? new Date(String(req.query.to)) : new Date();
      const usage = getCreditUsageSummary(workspace.id, from, to);
      res.json({
        workspaceId: workspace.id,
        from: from.toISOString(),
        to: to.toISOString(),
        ...usage,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Unable to fetch usage' });
    }
  });

  app.post('/api/jobs/estimate', requireAuth, (req: AuthRequest, res: Response) => {
    const parsed = jobEstimateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { jobType, inputMeta } = parsed.data;
    const estimate = estimateCredits(jobType, inputMeta);
    res.json({
      jobType,
      inputMeta,
      estimatedCredits: estimate.credits,
      breakdown: `${estimate.unitCount} ${estimate.unit} × ${estimate.creditsPerUnit} Credits`,
    });
  });

  app.post('/api/jobs/start', requireAuth, (req: AuthRequest, res: Response) => {
    const parsed = jobStartSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const ipHash = hashIP(req.ip || 'unknown');

    try {
      const workspace = resolveWorkspace(req);
      applyMonthlyAllocation(workspace.id, workspace.plan_id as PlanId);

      const { jobType, inputMeta } = parsed.data;
      const estimate = estimateCredits(jobType, inputMeta);
      if (estimate.credits <= 0) {
        return res.status(400).json({ error: 'Invalid credit estimate' });
      }

      const jobId = parsed.data.jobId || uuidv4();
      const wallet = reserveCredits(workspace.id, estimate.credits, jobId, {
        jobType,
        unitCount: estimate.unitCount,
        unit: estimate.unit,
        creditsPerUnit: estimate.creditsPerUnit,
      });

      createAuditLog(
        req.user?.id || null,
        'credits_reserve',
        'success',
        '/api/jobs/start',
        { workspaceId: workspace.id, jobId, credits: estimate.credits },
        ipHash,
        workspace.id
      );

      res.json({
        workspaceId: workspace.id,
        jobId,
        estimatedCredits: estimate.credits,
        wallet: {
          balance: wallet.balance,
          reserved: wallet.reserved,
          available: wallet.balance,
          total: wallet.balance + wallet.reserved,
        },
      });
    } catch (error: any) {
      createAuditLog(
        req.user?.id || null,
        'credits_reserve',
        'failure',
        '/api/jobs/start',
        { error: error.message },
        ipHash
      );
      res.status(400).json({ error: error.message || 'Unable to reserve credits' });
    }
  });

  app.post('/api/jobs/callback', (req: Request, res: Response) => {
    const internalToken = process.env.JOB_CALLBACK_SECRET;
    if (!internalToken || req.headers['x-internal-token'] !== internalToken) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const parsed = jobCallbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { workspaceId, jobId, status, credits } = parsed.data;
    try {
      const wallet =
        status === 'completed'
          ? consumeCredits(workspaceId, credits, jobId, { status })
          : releaseCredits(workspaceId, credits, jobId, { status });
      res.json({
        workspaceId,
        jobId,
        status,
        wallet: {
          balance: wallet.balance,
          reserved: wallet.reserved,
          available: wallet.balance,
          total: wallet.balance + wallet.reserved,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Unable to finalize credits' });
    }
  });
}
