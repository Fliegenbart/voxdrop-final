import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/init';
import { requireAuth, requireMinPlan } from '../auth/middleware';
import { generateBITVDeclaration } from '../services/bitv-export';
import { generateVPATDocument } from '../services/vpat-export';
import { createAuditLog, ensureCreditWallet, getOrCreateDefaultWorkspaceForUser, hashIP, spendCredits } from '../db/queries';
import { CREDIT_COSTS, type PlanId } from '../billing/config';
import PDFDocument from 'pdfkit';

const router = Router();

// Alle Routen erfordern Authentifizierung
router.use(requireAuth);

const getBillingWorkspace = (req: Request) => {
  const user = (req as any).user;
  const workspace = getOrCreateDefaultWorkspaceForUser(user);
  const planId = workspace.plan_id as PlanId;
  const wallet = ensureCreditWallet(workspace.id, planId);
  return { workspace, wallet };
};

// ============================================
// KRITERIEN-KATALOG (Read-Only)
// ============================================

// GET /api/vpat/criteria - Alle Kriterien mit Filtern
router.get('/criteria', (req: Request, res: Response) => {
  try {
    const { chapter, product_type, level, search } = req.query;

    let query = 'SELECT * FROM en301549_criteria WHERE 1=1';
    const params: (string | number)[] = [];

    if (chapter) {
      query += ' AND chapter = ?';
      params.push(parseInt(chapter as string));
    }

    if (product_type) {
      query += ' AND applies_to LIKE ?';
      params.push(`%"${product_type}"%`);
    }

    if (level) {
      query += ' AND level = ?';
      params.push(level as string);
    }

    if (search) {
      query += ' AND (title_de LIKE ? OR title_en LIKE ? OR description_de LIKE ? OR id LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY chapter ASC, section ASC';

    const criteria = db.prepare(query).all(...params) as any[];

    res.json({
      criteria: criteria.map(c => ({
        ...c,
        applies_to: JSON.parse(c.applies_to),
        is_additional: Boolean(c.is_additional),
      })),
      total: criteria.length,
    });
  } catch (error) {
    console.error('[VPAT] Error fetching criteria:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Kriterien' });
  }
});

// GET /api/vpat/criteria/mapping - WCAG <-> EN 301 549 Mapping
router.get('/criteria/mapping', (_req: Request, res: Response) => {
  try {
    const criteria = db.prepare(`
      SELECT id, wcag_criterion FROM en301549_criteria WHERE wcag_criterion IS NOT NULL
    `).all() as { id: string; wcag_criterion: string }[];

    const wcag_to_en: Record<string, string[]> = {};
    const en_to_wcag: Record<string, string> = {};

    for (const c of criteria) {
      if (!wcag_to_en[c.wcag_criterion]) {
        wcag_to_en[c.wcag_criterion] = [];
      }
      wcag_to_en[c.wcag_criterion].push(c.id);
      en_to_wcag[c.id] = c.wcag_criterion;
    }

    res.json({ wcag_to_en, en_to_wcag });
  } catch (error) {
    console.error('[VPAT] Error fetching mapping:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Mappings' });
  }
});

// GET /api/vpat/criteria/:id - Einzelnes Kriterium
router.get('/criteria/:criterionId', (req: Request, res: Response) => {
  try {
    const { criterionId } = req.params;
    const criterion = db.prepare('SELECT * FROM en301549_criteria WHERE id = ?').get(criterionId) as any;

    if (!criterion) {
      return res.status(404).json({ error: 'Kriterium nicht gefunden' });
    }

    res.json({
      ...criterion,
      applies_to: JSON.parse(criterion.applies_to),
      is_additional: Boolean(criterion.is_additional),
    });
  } catch (error) {
    console.error('[VPAT] Error fetching criterion:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Kriteriums' });
  }
});

// ============================================
// AUDITS CRUD
// ============================================

// POST /api/vpat/audits - Neues Audit erstellen
router.post('/audits', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const {
      name,
      product_name,
      product_type,
      product_version,
      organization,
      audit_date,
      auditor_name,
      auditor_email,
      notes,
    } = req.body;

    if (!name || !product_name || !product_type || !audit_date) {
      return res.status(400).json({ error: 'Name, Produktname, Produkttyp und Datum sind erforderlich' });
    }

    const validTypes = ['web', 'pdf', 'app', 'document'];
    if (!validTypes.includes(product_type)) {
      return res.status(400).json({ error: 'Ungueltiger Produkttyp' });
    }

    const auditId = uuidv4();

    db.prepare(`
      INSERT INTO audits (id, user_id, name, product_name, product_type, product_version, organization, audit_date, auditor_name, auditor_email, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      userId,
      name,
      product_name,
      product_type,
      product_version || null,
      organization || null,
      audit_date,
      auditor_name || null,
      auditor_email || null,
      notes || null
    );

    // Alle passenden Kriterien als "not_evaluated" vorinitialisieren
    const criteria = db.prepare(`
      SELECT id FROM en301549_criteria WHERE applies_to LIKE ?
    `).all(`%"${product_type}"%`) as { id: string }[];

    const insertEval = db.prepare(`
      INSERT INTO audit_evaluations (audit_id, criterion_id, support_level)
      VALUES (?, ?, 'not_evaluated')
    `);

    const insertMany = db.transaction((criteriaList: { id: string }[]) => {
      for (const c of criteriaList) {
        insertEval.run(auditId, c.id);
      }
    });

    insertMany(criteria);

    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(auditId);
    createAuditLog(userId, 'vpat_audit_create', 'success', `audit:${auditId}`, {
      product_name,
      product_type,
      audit_date,
    }, ipHash);
    res.status(201).json(audit);
  } catch (error) {
    console.error('[VPAT] Error creating audit:', error);
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_audit_create', 'failure', 'audit:create', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim Erstellen des Audits' });
  }
});

// GET /api/vpat/audits - Alle Audits des Users
router.get('/audits', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { status, product_type, limit = '50', offset = '0' } = req.query;

    let query = 'SELECT * FROM audits WHERE user_id = ?';
    const params: (string | number)[] = [userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status as string);
    }

    if (product_type) {
      query += ' AND product_type = ?';
      params.push(product_type as string);
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const audits = db.prepare(query).all(...params);

    const totalQuery = `SELECT COUNT(*) as count FROM audits WHERE user_id = ?${status ? ' AND status = ?' : ''}${product_type ? ' AND product_type = ?' : ''}`;
    const totalParams = [userId];
    if (status) totalParams.push(status as string);
    if (product_type) totalParams.push(product_type as string);
    const total = (db.prepare(totalQuery).get(...totalParams) as { count: number }).count;

    res.json({ audits, total });
  } catch (error) {
    console.error('[VPAT] Error fetching audits:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Audits' });
  }
});

// GET /api/vpat/audits/:id - Audit mit Bewertungen und Progress
router.get('/audits/:auditId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { auditId } = req.params;

    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId) as any;

    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    // Bewertungen laden
    const evaluations = db.prepare(`
      SELECT e.*, c.title_de, c.title_en, c.level, c.wcag_criterion, c.chapter, c.section
      FROM audit_evaluations e
      JOIN en301549_criteria c ON e.criterion_id = c.id
      WHERE e.audit_id = ?
      ORDER BY c.chapter ASC, c.section ASC
    `).all(auditId);

    // Progress berechnen
    const progressQuery = db.prepare(`
      SELECT
        COUNT(*) as total_criteria,
        SUM(CASE WHEN support_level != 'not_evaluated' THEN 1 ELSE 0 END) as evaluated,
        SUM(CASE WHEN support_level = 'supports' THEN 1 ELSE 0 END) as supports,
        SUM(CASE WHEN support_level = 'partially_supports' THEN 1 ELSE 0 END) as partially_supports,
        SUM(CASE WHEN support_level = 'does_not_support' THEN 1 ELSE 0 END) as does_not_support,
        SUM(CASE WHEN support_level = 'not_applicable' THEN 1 ELSE 0 END) as not_applicable,
        SUM(CASE WHEN support_level = 'not_evaluated' THEN 1 ELSE 0 END) as not_evaluated
      FROM audit_evaluations
      WHERE audit_id = ?
    `).get(auditId) as any;

    const applicable = progressQuery.total_criteria - progressQuery.not_applicable;
    const compliance_rate = applicable > 0
      ? Math.round(((progressQuery.supports + progressQuery.partially_supports * 0.5) / applicable) * 100)
      : 0;

    const progress = {
      ...progressQuery,
      compliance_rate,
    };

    res.json({
      ...audit,
      evaluations,
      progress,
    });
  } catch (error) {
    console.error('[VPAT] Error fetching audit:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Audits' });
  }
});

// PUT /api/vpat/audits/:id - Audit aktualisieren
router.put('/audits/:auditId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId } = req.params;
    const {
      name,
      product_name,
      product_version,
      organization,
      audit_date,
      auditor_name,
      auditor_email,
      status,
      notes,
    } = req.body;

    const existing = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (product_name !== undefined) { updates.push('product_name = ?'); params.push(product_name); }
    if (product_version !== undefined) { updates.push('product_version = ?'); params.push(product_version); }
    if (organization !== undefined) { updates.push('organization = ?'); params.push(organization); }
    if (audit_date !== undefined) { updates.push('audit_date = ?'); params.push(audit_date); }
    if (auditor_name !== undefined) { updates.push('auditor_name = ?'); params.push(auditor_name); }
    if (auditor_email !== undefined) { updates.push('auditor_email = ?'); params.push(auditor_email); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(auditId);

      db.prepare(`UPDATE audits SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(auditId);
    createAuditLog(userId, 'vpat_audit_update', 'success', `audit:${auditId}`, {
      fields: updates.map(u => u.split('=')[0].trim()).filter(Boolean),
    }, ipHash);
    res.json(audit);
  } catch (error) {
    console.error('[VPAT] Error updating audit:', error);
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_audit_update', 'failure', 'audit:update', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Audits' });
  }
});

// POST /api/vpat/audits/:id/signoff - Audit freigeben (Premium)
router.post('/audits/:auditId/signoff', requireMinPlan('pro'), (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId } = req.params;
    const { name, role, email, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }

    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    db.prepare(`
      UPDATE audits
      SET signoff_name = ?,
          signoff_role = ?,
          signoff_email = ?,
          signoff_notes = ?,
          signoff_at = CURRENT_TIMESTAMP,
          status = 'completed',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      role || null,
      email || null,
      notes || null,
      auditId
    );

    createAuditLog(userId, 'vpat_audit_signoff', 'success', `audit:${auditId}`, {
      name,
      role,
      email,
    }, ipHash);

    const updated = db.prepare('SELECT * FROM audits WHERE id = ?').get(auditId);
    res.json(updated);
  } catch (error) {
    console.error('[VPAT] Error signing off audit:', error);
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_audit_signoff', 'failure', 'audit:signoff', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler bei der Freigabe' });
  }
});

// DELETE /api/vpat/audits/:id/signoff - Freigabe entfernen (Premium)
router.delete('/audits/:auditId/signoff', requireMinPlan('pro'), (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId } = req.params;

    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    db.prepare(`
      UPDATE audits
      SET signoff_name = NULL,
          signoff_role = NULL,
          signoff_email = NULL,
          signoff_notes = NULL,
          signoff_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(auditId);

    createAuditLog(userId, 'vpat_audit_signoff_remove', 'success', `audit:${auditId}`, null, ipHash);

    const updated = db.prepare('SELECT * FROM audits WHERE id = ?').get(auditId);
    res.json(updated);
  } catch (error) {
    console.error('[VPAT] Error removing signoff:', error);
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_audit_signoff_remove', 'failure', 'audit:signoff_remove', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim Entfernen der Freigabe' });
  }
});

// DELETE /api/vpat/audits/:id - Audit loeschen
router.delete('/audits/:auditId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId } = req.params;

    const existing = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    // Bewertungen werden durch CASCADE automatisch geloescht
    db.prepare('DELETE FROM audits WHERE id = ?').run(auditId);

    createAuditLog(userId, 'vpat_audit_delete', 'success', `audit:${auditId}`, null, ipHash);
    res.json({ success: true });
  } catch (error) {
    console.error('[VPAT] Error deleting audit:', error);
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_audit_delete', 'failure', 'audit:delete', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim Löschen des Audits' });
  }
});

// ============================================
// BEWERTUNGEN
// ============================================

// PUT /api/vpat/audits/:auditId/evaluations/:criterionId - Bewertung speichern
router.put('/audits/:auditId/evaluations/:criterionId', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId, criterionId } = req.params;
    const { support_level, remarks_de, remarks_en, evidence_url } = req.body;

    // Audit pruefen
    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    // Bewertung aktualisieren
    const result = db.prepare(`
      UPDATE audit_evaluations
      SET support_level = ?,
          remarks_de = ?,
          remarks_en = ?,
          evidence_url = ?,
          evaluated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE audit_id = ? AND criterion_id = ?
    `).run(
      support_level || 'not_evaluated',
      remarks_de || null,
      remarks_en || null,
      evidence_url || null,
      auditId,
      criterionId
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bewertung nicht gefunden' });
    }

    // Audit-Status auf "in_progress" setzen wenn noch "draft"
    db.prepare(`
      UPDATE audits SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'draft'
    `).run(auditId);

    const evaluation = db.prepare(`
      SELECT * FROM audit_evaluations WHERE audit_id = ? AND criterion_id = ?
    `).get(auditId, criterionId);

    createAuditLog(userId, 'vpat_evaluation_update', 'success', `audit:${auditId}`, {
      criterion_id: criterionId,
      support_level: support_level || 'not_evaluated',
    }, ipHash);

    res.json(evaluation);
  } catch (error) {
    console.error('[VPAT] Error updating evaluation:', error);
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_evaluation_update', 'failure', 'audit:evaluation', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim Speichern der Bewertung' });
  }
});

// POST /api/vpat/audits/:auditId/evaluations/bulk - Mehrere Bewertungen auf einmal
router.post('/audits/:auditId/evaluations/bulk', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId } = req.params;
    const { evaluations } = req.body;

    if (!Array.isArray(evaluations)) {
      return res.status(400).json({ error: 'evaluations muss ein Array sein' });
    }

    // Audit pruefen
    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    const updateStmt = db.prepare(`
      UPDATE audit_evaluations
      SET support_level = ?,
          remarks_de = ?,
          remarks_en = ?,
          evidence_url = ?,
          evaluated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE audit_id = ? AND criterion_id = ?
    `);

    const updateMany = db.transaction((evals: any[]) => {
      let updated = 0;
      for (const e of evals) {
        const result = updateStmt.run(
          e.support_level || 'not_evaluated',
          e.remarks_de || null,
          e.remarks_en || null,
          e.evidence_url || null,
          auditId,
          e.criterion_id
        );
        updated += result.changes;
      }
      return updated;
    });

    const updated = updateMany(evaluations);

    // Audit-Status aktualisieren
    db.prepare(`
      UPDATE audits SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'draft'
    `).run(auditId);

    createAuditLog(userId, 'vpat_evaluation_bulk', 'success', `audit:${auditId}`, {
      updated,
    }, ipHash);

    res.json({ updated });
  } catch (error) {
    console.error('[VPAT] Error bulk updating evaluations:', error);
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_evaluation_bulk', 'failure', 'audit:evaluation_bulk', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim Speichern der Bewertungen' });
  }
});

// POST /api/vpat/audits/:auditId/evaluations/mark-na - Mehrere als "nicht anwendbar" markieren
router.post('/audits/:auditId/evaluations/mark-na', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId } = req.params;
    const { criterion_ids } = req.body;

    if (!Array.isArray(criterion_ids)) {
      return res.status(400).json({ error: 'criterion_ids muss ein Array sein' });
    }

    // Audit pruefen
    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    const placeholders = criterion_ids.map(() => '?').join(', ');
    const result = db.prepare(`
      UPDATE audit_evaluations
      SET support_level = 'not_applicable',
          evaluated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE audit_id = ? AND criterion_id IN (${placeholders})
    `).run(auditId, ...criterion_ids);

    createAuditLog(userId, 'vpat_evaluation_mark_na', 'success', `audit:${auditId}`, {
      updated: result.changes,
    }, ipHash);

    res.json({ updated: result.changes });
  } catch (error) {
    console.error('[VPAT] Error marking evaluations as N/A:', error);
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_evaluation_mark_na', 'failure', 'audit:evaluation_mark_na', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim Markieren als nicht anwendbar' });
  }
});

// GET /api/vpat/audits/:auditId/evaluations - Alle Bewertungen eines Audits
router.get('/audits/:auditId/evaluations', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { auditId } = req.params;
    const { support_level, chapter, level } = req.query;

    // Audit pruefen
    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    let query = `
      SELECT e.*, c.title_de, c.title_en, c.description_de, c.level, c.wcag_criterion, c.chapter, c.section, c.testing_guidance_de, c.is_additional
      FROM audit_evaluations e
      JOIN en301549_criteria c ON e.criterion_id = c.id
      WHERE e.audit_id = ?
    `;
    const params: (string | number)[] = [auditId];

    if (support_level) {
      query += ' AND e.support_level = ?';
      params.push(support_level as string);
    }

    if (chapter) {
      query += ' AND c.chapter = ?';
      params.push(parseInt(chapter as string));
    }

    if (level) {
      query += ' AND c.level = ?';
      params.push(level as string);
    }

    query += ' ORDER BY c.chapter ASC, c.section ASC';

    const evaluations = db.prepare(query).all(...params);

    res.json(evaluations.map((e: any) => ({
      ...e,
      is_additional: Boolean(e.is_additional),
    })));
  } catch (error) {
    console.error('[VPAT] Error fetching evaluations:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Bewertungen' });
  }
});

// GET /api/vpat/audits/:auditId/progress - Progress eines Audits
router.get('/audits/:auditId/progress', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { auditId } = req.params;

    // Audit pruefen
    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId);
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    const progress = db.prepare(`
      SELECT
        COUNT(*) as total_criteria,
        SUM(CASE WHEN support_level != 'not_evaluated' THEN 1 ELSE 0 END) as evaluated,
        SUM(CASE WHEN support_level = 'supports' THEN 1 ELSE 0 END) as supports,
        SUM(CASE WHEN support_level = 'partially_supports' THEN 1 ELSE 0 END) as partially_supports,
        SUM(CASE WHEN support_level = 'does_not_support' THEN 1 ELSE 0 END) as does_not_support,
        SUM(CASE WHEN support_level = 'not_applicable' THEN 1 ELSE 0 END) as not_applicable,
        SUM(CASE WHEN support_level = 'not_evaluated' THEN 1 ELSE 0 END) as not_evaluated
      FROM audit_evaluations
      WHERE audit_id = ?
    `).get(auditId) as any;

    const applicable = progress.total_criteria - progress.not_applicable;
    const compliance_rate = applicable > 0
      ? Math.round(((progress.supports + progress.partially_supports * 0.5) / applicable) * 100)
      : 0;
    const coverage_rate = progress.total_criteria > 0
      ? Math.round((progress.evaluated / progress.total_criteria) * 100)
      : 0;
    const na_rate = progress.total_criteria > 0
      ? Math.round((progress.not_applicable / progress.total_criteria) * 100)
      : 0;

    res.json({
      ...progress,
      compliance_rate,
      coverage_rate,
      na_rate,
      applicable_criteria: applicable,
    });
  } catch (error) {
    console.error('[VPAT] Error fetching progress:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Fortschritts' });
  }
});

// ============================================
// AUDIT DOSSIER (Premium)
// ============================================

function getAuditMetrics(auditId: string) {
  const metrics = db.prepare(`
    SELECT
      COUNT(*) as total_criteria,
      SUM(CASE WHEN support_level != 'not_evaluated' THEN 1 ELSE 0 END) as evaluated_criteria,
      SUM(CASE WHEN support_level = 'supports' THEN 1 ELSE 0 END) as supports,
      SUM(CASE WHEN support_level = 'partially_supports' THEN 1 ELSE 0 END) as partially_supports,
      SUM(CASE WHEN support_level = 'does_not_support' THEN 1 ELSE 0 END) as does_not_support,
      SUM(CASE WHEN support_level = 'not_applicable' THEN 1 ELSE 0 END) as not_applicable,
      SUM(CASE WHEN support_level = 'not_evaluated' THEN 1 ELSE 0 END) as not_evaluated
    FROM audit_evaluations
    WHERE audit_id = ?
  `).get(auditId) as any;

  const applicable = metrics.total_criteria - metrics.not_applicable;
  const compliance_rate = applicable > 0
    ? Math.round(((metrics.supports + metrics.partially_supports * 0.5) / applicable) * 100)
    : 0;
  const coverage_rate = metrics.total_criteria > 0
    ? Math.round((metrics.evaluated_criteria / metrics.total_criteria) * 100)
    : 0;
  const na_rate = metrics.total_criteria > 0
    ? Math.round((metrics.not_applicable / metrics.total_criteria) * 100)
    : 0;

  return {
    ...metrics,
    applicable_criteria: applicable,
    compliance_rate,
    coverage_rate,
    na_rate,
  };
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function generateAuditDossierPdf(audit: any, metrics: any, activity: any[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('VoxDrop Audit-Dossier', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`Audit: ${audit.name}`);
    doc.text(`Produkt: ${audit.product_name}${audit.product_version ? ` (v${audit.product_version})` : ''}`);
    doc.text(`Datum: ${new Date(audit.audit_date).toLocaleDateString('de-DE')}`);
    doc.text(`Status: ${audit.status}`);
    doc.text(`Auditor: ${audit.auditor_name || '—'} ${audit.auditor_email ? `(${audit.auditor_email})` : ''}`);
    if (audit.organization) {
      doc.text(`Organisation: ${audit.organization}`);
    }
    doc.moveDown();

    doc.fontSize(12).text('Compliance');
    doc.text(`Compliance-Rate: ${metrics.compliance_rate}%`);
    doc.text(`Abdeckung: ${metrics.coverage_rate}% (${metrics.evaluated_criteria}/${metrics.total_criteria})`);
    doc.text(`Nicht anwendbar: ${metrics.na_rate}% (${metrics.not_applicable}/${metrics.total_criteria})`);
    doc.text(`Anwendbare Kriterien: ${metrics.applicable_criteria}`);
    doc.moveDown();

    if (audit.signoff_at) {
      doc.fontSize(12).text('Freigabe');
      doc.text(`Freigegeben am: ${new Date(audit.signoff_at).toLocaleDateString('de-DE')}`);
      doc.text(`Name: ${audit.signoff_name || '—'}`);
      if (audit.signoff_role) doc.text(`Rolle: ${audit.signoff_role}`);
      if (audit.signoff_email) doc.text(`E-Mail: ${audit.signoff_email}`);
      if (audit.signoff_notes) doc.text(`Notiz: ${audit.signoff_notes}`);
      doc.moveDown();
    }

    doc.fontSize(12).text('Audit-Log (letzte 50 Eintraege)');
    doc.moveDown(0.5);
    activity.slice(0, 50).forEach((entry) => {
      const date = new Date(entry.created_at).toLocaleString('de-DE');
      doc.fontSize(10).text(`- ${date} · ${entry.action} · ${entry.status}`);
    });

    doc.end();
  });
}

// GET /api/vpat/audits/:auditId/dossier - JSON dossier data
router.get('/audits/:auditId/dossier', requireMinPlan('pro'), (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { auditId } = req.params;

    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId) as any;
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    const metrics = getAuditMetrics(auditId);
    const activity = db.prepare(`
      SELECT id, action, status, details, created_at
      FROM audit_logs
      WHERE user_id = ? AND resource = ?
      ORDER BY created_at DESC
      LIMIT 200
    `).all(userId, `audit:${auditId}`) as any[];

    const parsedActivity = activity.map((entry: any) => ({
      ...entry,
      details: entry.details ? JSON.parse(entry.details) : null,
    }));

    res.json({
      audit,
      metrics,
      activity: parsedActivity,
    });
  } catch (error) {
    console.error('[VPAT] Error fetching dossier:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Dossiers' });
  }
});

// GET /api/vpat/audits/:auditId/dossier.csv - CSV export
router.get('/audits/:auditId/dossier.csv', requireMinPlan('pro'), (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId } = req.params;

    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId) as any;
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    const { workspace, wallet } = getBillingWorkspace(req);
    const credits = CREDIT_COSTS.VPAT_EXPORT.credits;
    if (credits > 0 && wallet.balance < credits) {
      return res.status(402).json({ error: 'Nicht genug Credits' });
    }

    const metrics = getAuditMetrics(auditId);
    const evaluations = db.prepare(`
      SELECT e.criterion_id, e.support_level, e.remarks_de, e.evidence_url, c.title_de
      FROM audit_evaluations e
      JOIN en301549_criteria c ON e.criterion_id = c.id
      WHERE e.audit_id = ?
      ORDER BY c.chapter ASC, c.section ASC
    `).all(auditId) as any[];

    const lines: string[] = [];
    lines.push('Section,Key,Value');
    lines.push(`Audit,Name,${csvEscape(audit.name)}`);
    lines.push(`Audit,Produkt,${csvEscape(audit.product_name)}`);
    lines.push(`Audit,Version,${csvEscape(audit.product_version || '')}`);
    lines.push(`Audit,Datum,${csvEscape(audit.audit_date)}`);
    lines.push(`Audit,Status,${csvEscape(audit.status)}`);
    lines.push(`Audit,Auditor,${csvEscape(audit.auditor_name || '')}`);
    lines.push(`Audit,E-Mail,${csvEscape(audit.auditor_email || '')}`);
    lines.push(`Audit,Organisation,${csvEscape(audit.organization || '')}`);
    lines.push(`Audit,Notizen,${csvEscape(audit.notes || '')}`);
    lines.push(`Audit,Freigabe Name,${csvEscape(audit.signoff_name || '')}`);
    lines.push(`Audit,Freigabe Rolle,${csvEscape(audit.signoff_role || '')}`);
    lines.push(`Audit,Freigabe E-Mail,${csvEscape(audit.signoff_email || '')}`);
    lines.push(`Audit,Freigabe Datum,${csvEscape(audit.signoff_at || '')}`);
    lines.push(`Audit,Compliance-Rate,${csvEscape(metrics.compliance_rate)}`);
    lines.push(`Audit,Abdeckung,${csvEscape(metrics.coverage_rate)}`);
    lines.push(`Audit,Nicht anwendbar,${csvEscape(metrics.na_rate)}`);
    lines.push('');
    lines.push('Kriterium,Support-Level,Titel,Kommentar,Evidence-URL');
    evaluations.forEach((e: any) => {
      lines.push([
        csvEscape(e.criterion_id),
        csvEscape(e.support_level),
        csvEscape(e.title_de),
        csvEscape(e.remarks_de || ''),
        csvEscape(e.evidence_url || ''),
      ].join(','));
    });

    const filename = `Audit_${audit.product_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;

    if (credits > 0) {
      spendCredits(workspace.id, credits, null, { costKey: 'VPAT_EXPORT', auditId, format: 'dossier_csv' });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));

    createAuditLog(userId, 'vpat_dossier_csv', 'success', `audit:${auditId}`, { filename }, ipHash);
  } catch (error) {
    console.error('[VPAT] Error exporting dossier CSV:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'insufficient_credits') {
      return res.status(402).json({ error: 'Nicht genug Credits' });
    }
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_dossier_csv', 'failure', 'audit:dossier_csv', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim CSV-Export' });
  }
});

// GET /api/vpat/audits/:auditId/dossier.pdf - PDF export
router.get('/audits/:auditId/dossier.pdf', requireMinPlan('pro'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId } = req.params;

    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId) as any;
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    const { workspace, wallet } = getBillingWorkspace(req);
    const credits = CREDIT_COSTS.VPAT_EXPORT.credits;
    if (credits > 0 && wallet.balance < credits) {
      return res.status(402).json({ error: 'Nicht genug Credits' });
    }

    const metrics = getAuditMetrics(auditId);
    const activity = db.prepare(`
      SELECT id, action, status, details, created_at
      FROM audit_logs
      WHERE user_id = ? AND resource = ?
      ORDER BY created_at DESC
      LIMIT 200
    `).all(userId, `audit:${auditId}`) as any[];

    const buffer = await generateAuditDossierPdf(audit, metrics, activity);
    const filename = `Audit_${audit.product_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (credits > 0) {
      spendCredits(workspace.id, credits, null, { costKey: 'VPAT_EXPORT', auditId, format: 'dossier_pdf' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

    createAuditLog(userId, 'vpat_dossier_pdf', 'success', `audit:${auditId}`, { filename }, ipHash);
  } catch (error) {
    console.error('[VPAT] Error exporting dossier PDF:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'insufficient_credits') {
      return res.status(402).json({ error: 'Nicht genug Credits' });
    }
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_dossier_pdf', 'failure', 'audit:dossier_pdf', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim PDF-Export' });
  }
});

// ============================================
// EXPORT
// ============================================

// POST /api/vpat/audits/:auditId/export/bitv - BITV HTML Export
router.post('/audits/:auditId/export/bitv', requireMinPlan('pro'), (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId } = req.params;
    const config = req.body;

    // Audit pruefen
    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId) as any;
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    const { workspace, wallet } = getBillingWorkspace(req);
    const credits = CREDIT_COSTS.VPAT_EXPORT.credits;
    if (credits > 0 && wallet.balance < credits) {
      return res.status(402).json({ error: 'Nicht genug Credits' });
    }

    // Bewertungen laden
    const evaluations = db.prepare(`
      SELECT e.*, c.title_de, c.title_en, c.wcag_criterion
      FROM audit_evaluations e
      JOIN en301549_criteria c ON e.criterion_id = c.id
      WHERE e.audit_id = ?
      ORDER BY c.chapter ASC, c.section ASC
    `).all(auditId) as any[];

    // Progress berechnen
    const progressData = db.prepare(`
      SELECT
        COUNT(*) as total_criteria,
        SUM(CASE WHEN support_level != 'not_evaluated' THEN 1 ELSE 0 END) as evaluated,
        SUM(CASE WHEN support_level = 'supports' THEN 1 ELSE 0 END) as supports,
        SUM(CASE WHEN support_level = 'partially_supports' THEN 1 ELSE 0 END) as partially_supports,
        SUM(CASE WHEN support_level = 'does_not_support' THEN 1 ELSE 0 END) as does_not_support,
        SUM(CASE WHEN support_level = 'not_applicable' THEN 1 ELSE 0 END) as not_applicable
      FROM audit_evaluations
      WHERE audit_id = ?
    `).get(auditId) as any;

    const applicable = progressData.total_criteria - progressData.not_applicable;
    const compliance_rate = applicable > 0
      ? Math.round(((progressData.supports + progressData.partially_supports * 0.5) / applicable) * 100)
      : 0;

    const progress = { ...progressData, compliance_rate };

    // HTML generieren
    const html = generateBITVDeclaration(audit, evaluations, progress, {
      declaration_date: config.declaration_date || new Date().toISOString().split('T')[0],
      contact_email: config.contact_email || '',
      contact_phone: config.contact_phone,
      feedback_url: config.feedback_url,
      enforcement_url: config.enforcement_url,
      include_methodology: config.include_methodology !== false,
      custom_css: config.custom_css,
    });

    if (credits > 0) {
      spendCredits(workspace.id, credits, null, { costKey: 'VPAT_EXPORT', auditId, format: 'bitv_html' });
    }

    res.json({ html });

    createAuditLog(userId, 'vpat_export_bitv', 'success', `audit:${auditId}`, {
      declaration_date: config.declaration_date || new Date().toISOString().split('T')[0],
    }, ipHash);
  } catch (error) {
    console.error('[VPAT] Error generating BITV declaration:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'insufficient_credits') {
      return res.status(402).json({ error: 'Nicht genug Credits' });
    }
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_export_bitv', 'failure', 'audit:export_bitv', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim Generieren der BITV-Erklaerung' });
  }
});

// POST /api/vpat/audits/:auditId/export/vpat - VPAT Word Export
router.post('/audits/:auditId/export/vpat', requireMinPlan('pro'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const ipHash = hashIP(req.ip || 'unknown');
    const { auditId } = req.params;
    const config = req.body;

    // Audit pruefen
    const audit = db.prepare('SELECT * FROM audits WHERE id = ? AND user_id = ?').get(auditId, userId) as any;
    if (!audit) {
      return res.status(404).json({ error: 'Audit nicht gefunden' });
    }

    const { workspace, wallet } = getBillingWorkspace(req);
    const credits = CREDIT_COSTS.VPAT_EXPORT.credits;
    if (credits > 0 && wallet.balance < credits) {
      return res.status(402).json({ error: 'Nicht genug Credits' });
    }

    // Bewertungen laden
    const evaluations = db.prepare(`
      SELECT e.*, c.title_de, c.title_en, c.wcag_criterion, c.chapter, c.level
      FROM audit_evaluations e
      JOIN en301549_criteria c ON e.criterion_id = c.id
      WHERE e.audit_id = ?
      ORDER BY c.chapter ASC, c.section ASC
    `).all(auditId) as any[];

    // Progress berechnen
    const progressData = db.prepare(`
      SELECT
        COUNT(*) as total_criteria,
        SUM(CASE WHEN support_level = 'supports' THEN 1 ELSE 0 END) as supports,
        SUM(CASE WHEN support_level = 'partially_supports' THEN 1 ELSE 0 END) as partially_supports,
        SUM(CASE WHEN support_level = 'does_not_support' THEN 1 ELSE 0 END) as does_not_support,
        SUM(CASE WHEN support_level = 'not_applicable' THEN 1 ELSE 0 END) as not_applicable
      FROM audit_evaluations
      WHERE audit_id = ?
    `).get(auditId) as any;

    const applicable = progressData.total_criteria - progressData.not_applicable;
    const compliance_rate = applicable > 0
      ? Math.round(((progressData.supports + progressData.partially_supports * 0.5) / applicable) * 100)
      : 0;

    const progress = { ...progressData, compliance_rate };

    // Word-Dokument generieren
    const buffer = await generateVPATDocument(audit, evaluations, progress, {
      format: 'word',
      language: config.language || 'de',
      include_not_applicable: config.include_not_applicable !== false,
      include_testing_guidance: config.include_testing_guidance || false,
      company_name: config.company_name,
    });

    // Als Download senden
    const filename = `VPAT_${audit.product_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.docx`;

    if (credits > 0) {
      spendCredits(workspace.id, credits, null, { costKey: 'VPAT_EXPORT', auditId, format: 'vpat_word' });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

    createAuditLog(userId, 'vpat_export_word', 'success', `audit:${auditId}`, {
      filename,
      language: config.language || 'de',
    }, ipHash);
  } catch (error) {
    console.error('[VPAT] Error generating VPAT document:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'insufficient_credits') {
      return res.status(402).json({ error: 'Nicht genug Credits' });
    }
    try {
      const userId = (req as any).user.id;
      const ipHash = hashIP(req.ip || 'unknown');
      createAuditLog(userId, 'vpat_export_word', 'failure', 'audit:export_word', { error: String(error) }, ipHash);
    } catch {}
    res.status(500).json({ error: 'Fehler beim Generieren des VPAT-Dokuments' });
  }
});

// ============================================
// COMPLIANCE TIMELINE (Premium Feature)
// ============================================

// Helper: Calculate trend between two values
function calculateTrend(current: number, previous: number): { trend: 'up' | 'down' | 'stable'; change: number } {
  const change = current - previous;
  if (change > 2) return { trend: 'up', change };
  if (change < -2) return { trend: 'down', change };
  return { trend: 'stable', change };
}

function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function effectiveAuditDate(auditDate?: string | null, createdAt?: string | null): string {
  if (auditDate) return auditDate;
  if (createdAt) {
    if (createdAt.includes('T')) return createdAt.split('T')[0];
    if (createdAt.includes(' ')) return createdAt.split(' ')[0];
    return createdAt;
  }
  return new Date().toISOString().split('T')[0];
}

// GET /api/vpat/timeline - Compliance Timeline Overview (Premium only)
router.get('/timeline',
  requireMinPlan('premium'),
  (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { product, product_type, status, from, to, trendScope = 'completed' } = req.query;

      const statusList = typeof status === 'string'
        ? status.split(',').map(s => s.trim()).filter(Boolean)
        : ['completed', 'in_progress'];

      let query = `
        SELECT
          a.*,
          COUNT(e.id) as total_criteria,
          SUM(CASE WHEN e.support_level != 'not_evaluated' THEN 1 ELSE 0 END) as evaluated_criteria,
          SUM(CASE WHEN e.support_level = 'supports' THEN 1 ELSE 0 END) as supports,
          SUM(CASE WHEN e.support_level = 'partially_supports' THEN 1 ELSE 0 END) as partially_supports,
          SUM(CASE WHEN e.support_level = 'does_not_support' THEN 1 ELSE 0 END) as does_not_support,
          SUM(CASE WHEN e.support_level = 'not_applicable' THEN 1 ELSE 0 END) as not_applicable
        FROM audits a
        LEFT JOIN audit_evaluations e ON a.id = e.audit_id
        WHERE a.user_id = ?
      `;
      const params: (string | number)[] = [userId];

      if (product) {
        query += ' AND LOWER(TRIM(a.product_name)) = ?';
        params.push(normalizeProductName(product as string));
      }
      if (product_type) {
        query += ' AND a.product_type = ?';
        params.push(product_type as string);
      }
      if (statusList.length > 0 && status !== 'all') {
        query += ` AND a.status IN (${statusList.map(() => '?').join(', ')})`;
        params.push(...statusList);
      }
      if (from) {
        query += ' AND date(COALESCE(a.audit_date, a.created_at)) >= date(?)';
        params.push(from as string);
      }
      if (to) {
        query += ' AND date(COALESCE(a.audit_date, a.created_at)) <= date(?)';
        params.push(to as string);
      }

      query += `
        GROUP BY a.id
        ORDER BY date(COALESCE(a.audit_date, a.created_at)) DESC
      `;

      const audits = db.prepare(query).all(...params) as any[];

      if (audits.length === 0) {
        return res.json({
          total_audits: 0,
          completed_audits: 0,
          products: [],
          timeline: [],
          history: [],
          overall_score: 0,
          overall_trend: 'stable',
          trend_change: 0,
          overall_coverage_rate: 0,
          overall_na_rate: 0,
          overall_total_criteria: 0,
          overall_evaluated_criteria: 0,
          overall_applicable_criteria: 0,
          overall_not_applicable: 0,
          first_audit_date: null,
        });
      }

      const auditsWithRates = audits.map(audit => {
        const total = Number(audit.total_criteria) || 0;
        const evaluated = Number(audit.evaluated_criteria) || 0;
        const supports = Number(audit.supports) || 0;
        const partial = Number(audit.partially_supports) || 0;
        const na = Number(audit.not_applicable) || 0;
        const applicable = Math.max(0, total - na);
        const compliance_rate = applicable > 0
          ? Math.round(((supports + partial * 0.5) / applicable) * 100)
          : 0;
        const coverage_rate = total > 0 ? Math.round((evaluated / total) * 100) : 0;
        const na_rate = total > 0 ? Math.round((na / total) * 100) : 0;
        const effective_date = effectiveAuditDate(audit.audit_date, audit.created_at);

        return {
          ...audit,
          total_criteria: total,
          evaluated_criteria: evaluated,
          applicable_criteria: applicable,
          compliance_rate,
          coverage_rate,
          na_rate,
          effective_date,
        };
      });

      // Build product summaries
      const productMap = new Map<string, { displayName: string; audits: any[] }>();
      for (const audit of auditsWithRates) {
        const key = normalizeProductName(audit.product_name);
        if (!productMap.has(key)) {
          productMap.set(key, { displayName: audit.product_name, audits: [] });
        }
        productMap.get(key)!.audits.push(audit);
      }
      const displayNameByKey = new Map<string, string>();
      for (const [key, value] of productMap.entries()) {
        displayNameByKey.set(key, value.displayName);
      }

      const buildTrendAudits = (auditsList: any[]) => {
        if (trendScope === 'all') {
          return auditsList.filter(a => a.status !== 'draft');
        }
        return auditsList.filter(a => a.status === 'completed');
      }

      const products = Array.from(productMap.entries()).map(([_, productData]) => {
        const productAudits = productData.audits;
        // Sort by date descending
        productAudits.sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
        const latest = productAudits[0];
        const trendAudits = buildTrendAudits(productAudits).sort(
          (a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
        );
        const previous = trendAudits[1];

        const { trend, change } = previous
          ? calculateTrend(latest.compliance_rate, previous.compliance_rate)
          : { trend: 'stable' as const, change: 0 };

        return {
          product_name: productData.displayName,
          product_type: latest.product_type,
          latest_audit_id: latest.id,
          latest_audit_date: latest.effective_date,
          latest_compliance_rate: latest.compliance_rate,
          latest_coverage_rate: latest.coverage_rate,
          latest_na_rate: latest.na_rate,
          latest_total_criteria: latest.total_criteria,
          latest_evaluated_criteria: latest.evaluated_criteria,
          latest_applicable_criteria: latest.applicable_criteria,
          audit_count: productAudits.length,
          trend,
          trend_change: change,
        };
      });

      // Build timeline data (for chart)
      const timeline = auditsWithRates
        .map(audit => ({
          date: audit.effective_date,
          product_name: displayNameByKey.get(normalizeProductName(audit.product_name)) || audit.product_name,
          compliance_rate: audit.compliance_rate,
          coverage_rate: audit.coverage_rate,
          na_rate: audit.na_rate,
          evaluated_criteria: audit.evaluated_criteria,
          total_criteria: audit.total_criteria,
          applicable_criteria: audit.applicable_criteria,
          audit_id: audit.id,
          audit_name: audit.name,
          status: audit.status,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Build audit history
      const history = auditsWithRates.map(audit => ({
        id: audit.id,
        name: audit.name,
        product_name: displayNameByKey.get(normalizeProductName(audit.product_name)) || audit.product_name,
        product_version: audit.product_version,
        product_type: audit.product_type,
        audit_date: audit.effective_date,
        status: audit.status,
        compliance_rate: audit.compliance_rate,
        coverage_rate: audit.coverage_rate,
        na_rate: audit.na_rate,
        evaluated_criteria: audit.evaluated_criteria,
        total_criteria: audit.total_criteria,
        applicable_criteria: audit.applicable_criteria,
        auditor_name: audit.auditor_name || null,
        auditor_email: audit.auditor_email || null,
        signoff_name: audit.signoff_name || null,
        signoff_role: audit.signoff_role || null,
        signoff_email: audit.signoff_email || null,
        signoff_at: audit.signoff_at || null,
      }));

      // Calculate overall score (average of latest audits per product)
      const latestScores = products.map(p => p.latest_compliance_rate);
      const overall_score = latestScores.length > 0
        ? Math.round(latestScores.reduce((a, b) => a + b, 0) / latestScores.length)
        : 0;
      const latestCoverage = products.map(p => p.latest_coverage_rate);
      const overall_coverage_rate = latestCoverage.length > 0
        ? Math.round(latestCoverage.reduce((a, b) => a + b, 0) / latestCoverage.length)
        : 0;
      const latestNa = products.map(p => p.latest_na_rate);
      const overall_na_rate = latestNa.length > 0
        ? Math.round(latestNa.reduce((a, b) => a + b, 0) / latestNa.length)
        : 0;

      const overall_total_criteria = products.reduce((sum, p) => sum + (p.latest_total_criteria || 0), 0);
      const overall_evaluated_criteria = products.reduce((sum, p) => sum + (p.latest_evaluated_criteria || 0), 0);
      const overall_applicable_criteria = products.reduce((sum, p) => sum + (p.latest_applicable_criteria || 0), 0);
      const overall_not_applicable = overall_total_criteria - overall_applicable_criteria;

      // Calculate overall trend (comparing oldest and newest completed audits)
      const completedAudits = auditsWithRates.filter(a => a.status === 'completed');
      let overall_trend: 'up' | 'down' | 'stable' = 'stable';
      let trend_change = 0;

      const trendAudits = trendScope === 'all'
        ? auditsWithRates.filter(a => a.status !== 'draft')
        : completedAudits;

      if (trendAudits.length >= 2) {
        const sorted = [...trendAudits].sort((a, b) =>
          new Date(a.effective_date).getTime() - new Date(b.effective_date).getTime()
        );
        const oldest = sorted[0];
        const newest = sorted[sorted.length - 1];
        const trendResult = calculateTrend(newest.compliance_rate, oldest.compliance_rate);
        overall_trend = trendResult.trend;
        trend_change = trendResult.change;
      }

      // First audit date
      const first_audit_date = auditsWithRates.length > 0
        ? auditsWithRates.reduce((min, a) => a.effective_date < min ? a.effective_date : min, auditsWithRates[0].effective_date)
        : null;

      res.json({
        total_audits: audits.length,
        completed_audits: completedAudits.length,
        products,
        timeline,
        history,
        overall_score,
        overall_trend,
        trend_change,
        overall_coverage_rate,
        overall_na_rate,
        overall_total_criteria,
        overall_evaluated_criteria,
        overall_applicable_criteria,
        overall_not_applicable,
        first_audit_date,
      });
    } catch (error) {
      console.error('[VPAT] Error fetching timeline:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Timeline' });
    }
  }
);

// GET /api/vpat/timeline/products/:productName - Timeline for specific product
router.get('/timeline/products/:productName',
  requireMinPlan('premium'),
  (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { productName } = req.params;

      const audits = db.prepare(`
        SELECT
          a.*,
          COUNT(e.id) as total_criteria,
          SUM(CASE WHEN e.support_level != 'not_evaluated' THEN 1 ELSE 0 END) as evaluated_criteria,
          SUM(CASE WHEN e.support_level = 'supports' THEN 1 ELSE 0 END) as supports,
          SUM(CASE WHEN e.support_level = 'partially_supports' THEN 1 ELSE 0 END) as partially_supports,
          SUM(CASE WHEN e.support_level = 'does_not_support' THEN 1 ELSE 0 END) as does_not_support,
          SUM(CASE WHEN e.support_level = 'not_applicable' THEN 1 ELSE 0 END) as not_applicable
        FROM audits a
        LEFT JOIN audit_evaluations e ON a.id = e.audit_id
        WHERE a.user_id = ? AND LOWER(TRIM(a.product_name)) = ?
        GROUP BY a.id
        ORDER BY date(COALESCE(a.audit_date, a.created_at)) DESC
      `).all(userId, normalizeProductName(productName)) as any[];

      const auditsWithRates = audits.map(audit => {
        const total = Number(audit.total_criteria) || 0;
        const evaluated = Number(audit.evaluated_criteria) || 0;
        const supports = Number(audit.supports) || 0;
        const partial = Number(audit.partially_supports) || 0;
        const na = Number(audit.not_applicable) || 0;
        const applicable = Math.max(0, total - na);
        const compliance_rate = applicable > 0
          ? Math.round(((supports + partial * 0.5) / applicable) * 100)
          : 0;
        const coverage_rate = total > 0 ? Math.round((evaluated / total) * 100) : 0;
        const na_rate = total > 0 ? Math.round((na / total) * 100) : 0;
        const effective_date = effectiveAuditDate(audit.audit_date, audit.created_at);

        return {
          ...audit,
          compliance_rate,
          coverage_rate,
          na_rate,
          evaluated_criteria: evaluated,
          total_criteria: total,
          applicable_criteria: applicable,
          effective_date,
        };
      });

      res.json({
        product_name: productName,
        audits: auditsWithRates,
      });
    } catch (error) {
      console.error('[VPAT] Error fetching product timeline:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Produkt-Timeline' });
    }
  }
);

export default router;
