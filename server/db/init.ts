import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database path - stored in data directory
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'voxdrop.db');
const AUDIT_LOG_RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize schema
const initSchema = () => {
  db.exec(`
    -- Users table (with security and GDPR fields)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      totp_secret TEXT,
      mfa_enabled INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      subscription TEXT DEFAULT 'free' CHECK(subscription IN ('free', 'premium', 'team')),
      organization TEXT,
      -- Security: Account lockout
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until DATETIME,
      last_failed_login DATETIME,
      -- GDPR: Consent tracking
      consent_version TEXT,
      consent_given_at DATETIME,
      -- GDPR: Deletion request
      deletion_requested_at DATETIME,
      -- Email verification (Double Opt-in)
      email_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      verification_token_expires DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      ip_hash TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Audit logs table (KRITIS requirement - extended)
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT,
      status TEXT NOT NULL CHECK(status IN ('success', 'failure')),
      details TEXT,
      ip_hash TEXT,
      -- KRITIS: Extended audit fields
      session_id TEXT,
      request_id TEXT,
      user_agent TEXT,
      response_time_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Usage tracking table
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      transcriptions_count INTEGER DEFAULT 0,
      videos_count INTEGER DEFAULT 0,
      last_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Jobs table for async processing
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      queue TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'completed', 'failed')),
      priority INTEGER NOT NULL DEFAULT 3,
      input_data TEXT,
      result_data TEXT,
      result_file_path TEXT,
      progress_stage TEXT,
      phase TEXT,
      progress_percent INTEGER DEFAULT 0,
      error_message TEXT,
      error_code TEXT,
      retry_count INTEGER DEFAULT 0,
      gpu_wait_ms INTEGER DEFAULT 0,
      last_heartbeat_at DATETIME,
      queue_attempt INTEGER DEFAULT 0,
      queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      input_path TEXT,
      input_checksum TEXT,
      attempts INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Short Links table for URL shortener
    CREATE TABLE IF NOT EXISTS short_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      short_code TEXT UNIQUE NOT NULL,
      target_url TEXT NOT NULL,
      title TEXT,
      user_id INTEGER NOT NULL,
      clicks INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_queue ON jobs(queue);
    CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
    CREATE INDEX IF NOT EXISTS idx_short_links_code ON short_links(short_code);
    CREATE INDEX IF NOT EXISTS idx_short_links_user ON short_links(user_id);
  `);

  console.log(`[DB] SQLite database initialized at ${DB_PATH}`);
};

// Run initialization
initSchema();

// Migration: Add email verification columns if they don't exist
const migrateEmailVerification = () => {
  try {
    // Check if columns exist
    const tableInfo = db.pragma('table_info(users)') as Array<{ name: string }>;
    const columnNames = tableInfo.map(col => col.name);

    if (!columnNames.includes('email_verified')) {
      db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`);
      console.log('[DB] Migration: Added email_verified column');
    }
    if (!columnNames.includes('verification_token')) {
      db.exec(`ALTER TABLE users ADD COLUMN verification_token TEXT`);
      console.log('[DB] Migration: Added verification_token column');
    }
    if (!columnNames.includes('verification_token_expires')) {
      db.exec(`ALTER TABLE users ADD COLUMN verification_token_expires DATETIME`);
      console.log('[DB] Migration: Added verification_token_expires column');
    }
  } catch (error) {
    console.error('[DB] Migration error:', error);
  }
};

// Run migration
migrateEmailVerification();

// Migration: Add URL shortener extended columns
const migrateUrlShortener = () => {
  try {
    // Check if columns exist in short_links
    const tableInfo = db.pragma('table_info(short_links)') as Array<{ name: string }>;
    const columnNames = tableInfo.map(col => col.name);

    if (!columnNames.includes('password_hash')) {
      db.exec(`ALTER TABLE short_links ADD COLUMN password_hash TEXT`);
      console.log('[DB] Migration: Added password_hash column to short_links');
    }
    if (!columnNames.includes('is_paused')) {
      db.exec(`ALTER TABLE short_links ADD COLUMN is_paused INTEGER DEFAULT 0`);
      console.log('[DB] Migration: Added is_paused column to short_links');
    }

    // Create link_clicks table for daily click statistics
    db.exec(`
      CREATE TABLE IF NOT EXISTS link_clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_id INTEGER NOT NULL,
        clicked_at DATE NOT NULL,
        click_count INTEGER DEFAULT 1,
        FOREIGN KEY (link_id) REFERENCES short_links(id) ON DELETE CASCADE,
        UNIQUE(link_id, clicked_at)
      );
      CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id ON link_clicks(link_id);
      CREATE INDEX IF NOT EXISTS idx_link_clicks_date ON link_clicks(clicked_at);
    `);
    console.log('[DB] Migration: Created link_clicks table');
  } catch (error) {
    // Ignore errors if table/index already exists
    if (!(error as Error).message.includes('already exists')) {
      console.error('[DB] URL shortener migration error:', error);
    }
  }
};

// Run URL shortener migration
migrateUrlShortener();

// Migration: Add blog posts table (admin-managed CMS-lite)
const migrateBlogPosts = () => {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        excerpt TEXT NOT NULL DEFAULT '',
        content_md TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
      CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at);
      CREATE INDEX IF NOT EXISTS idx_blog_posts_updated ON blog_posts(updated_at);
    `);
    console.log('[DB] Migration: Created blog_posts table');
  } catch (error) {
    if (!(error as Error).message.includes('already exists')) {
      console.error('[DB] Blog posts migration error:', error);
    }
  }
};

migrateBlogPosts();

// Migration: Add achievements table
const migrateAchievements = () => {
  try {
    db.exec(`
      -- User achievements table for gamification
      CREATE TABLE IF NOT EXISTS user_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        achievement_id TEXT NOT NULL,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, achievement_id)
      );
      CREATE INDEX IF NOT EXISTS idx_achievements_user ON user_achievements(user_id);

      -- User streaks table for tracking daily activity
      CREATE TABLE IF NOT EXISTS user_streaks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_activity_date DATE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    console.log('[DB] Migration: Created achievements tables');
  } catch (error) {
    if (!(error as Error).message.includes('already exists')) {
      console.error('[DB] Achievements migration error:', error);
    }
  }
};

// Run achievements migration
migrateAchievements();

// Migration: Add BFSG-Kompass tables (lead capture + scan cache)
const migrateBfsg = () => {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bfsg_scans (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        score INTEGER,
        result_json TEXT,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        expires_at DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_bfsg_scans_url ON bfsg_scans(url);
      CREATE INDEX IF NOT EXISTS idx_bfsg_scans_status ON bfsg_scans(status);
      CREATE INDEX IF NOT EXISTS idx_bfsg_scans_expires ON bfsg_scans(expires_at);

      CREATE TABLE IF NOT EXISTS bfsg_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        name TEXT,
        company TEXT,
        newsletter INTEGER DEFAULT 0,
        url TEXT,
        scan_id TEXT,
        scope_result_json TEXT,
        ip_hash TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (scan_id) REFERENCES bfsg_scans(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_bfsg_leads_email ON bfsg_leads(email);
      CREATE INDEX IF NOT EXISTS idx_bfsg_leads_created ON bfsg_leads(created_at);
      CREATE INDEX IF NOT EXISTS idx_bfsg_leads_scan_id ON bfsg_leads(scan_id);
    `);
    console.log('[DB] Migration: Created BFSG tables');
  } catch (error) {
    if (!(error as Error).message.includes('already exists')) {
      console.error('[DB] BFSG migration error:', error);
    }
  }
};

migrateBfsg();

// Migration: Add user_recordings table for 24h recording storage
const migrateUserRecordings = () => {
  try {
    db.exec(`
      -- User recordings table for 24h backup storage
      CREATE TABLE IF NOT EXISTS user_recordings (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        duration_seconds REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_recordings_user ON user_recordings(user_id);
      CREATE INDEX IF NOT EXISTS idx_recordings_expires ON user_recordings(expires_at);
    `);
    console.log('[DB] Migration: Created user_recordings table');
  } catch (error) {
    if (!(error as Error).message.includes('already exists')) {
      console.error('[DB] User recordings migration error:', error);
    }
  }
};

// Run user recordings migration
migrateUserRecordings();

// Migration: Add shared_files table for file sharing
const migrateSharedFiles = () => {
  try {
    db.exec(`
      -- Shared files table for file sharing feature
      CREATE TABLE IF NOT EXISTS shared_files (
        id TEXT PRIMARY KEY,
        user_id INTEGER,  -- NULL for anonymous uploads
        token TEXT UNIQUE NOT NULL,  -- Short download token
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        alt_text TEXT,  -- Auto-generated for images
        password_hash TEXT,  -- Optional password protection
        downloads INTEGER DEFAULT 0,
        max_downloads INTEGER,  -- Optional download limit
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        ip_hash TEXT,  -- GDPR: anonymized uploader IP
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_shared_files_token ON shared_files(token);
      CREATE INDEX IF NOT EXISTS idx_shared_files_expires ON shared_files(expires_at);
      CREATE INDEX IF NOT EXISTS idx_shared_files_user ON shared_files(user_id);
    `);
    console.log('[DB] Migration: Created shared_files table');
  } catch (error) {
    if (!(error as Error).message.includes('already exists')) {
      console.error('[DB] Shared files migration error:', error);
    }
  }
};

// Run shared files migration
migrateSharedFiles();

// Migration: Add workspace projects and storage scope columns
const migrateWorkspaceStorage = () => {
  try {
    db.exec(`
      -- Workspace projects (shared folders)
      CREATE TABLE IF NOT EXISTS workspace_projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workspace_projects_workspace ON workspace_projects(workspace_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_projects_unique ON workspace_projects(workspace_id, name);
    `);
    console.log('[DB] Migration: Created workspace_projects table');
  } catch (error) {
    if (!(error as Error).message.includes('already exists')) {
      console.error('[DB] Workspace projects migration error:', error);
    }
  }

  try {
    const recordingColumns = db.pragma('table_info(user_recordings)') as Array<{ name: string }>;
    const recordingColumnNames = recordingColumns.map(col => col.name);
    if (!recordingColumnNames.includes('storage_scope')) {
      db.exec(`ALTER TABLE user_recordings ADD COLUMN storage_scope TEXT DEFAULT 'user'`);
      console.log('[DB] Migration: Added storage_scope to user_recordings');
    }
    if (!recordingColumnNames.includes('workspace_id')) {
      db.exec(`ALTER TABLE user_recordings ADD COLUMN workspace_id TEXT`);
      console.log('[DB] Migration: Added workspace_id to user_recordings');
    }
    if (!recordingColumnNames.includes('project_id')) {
      db.exec(`ALTER TABLE user_recordings ADD COLUMN project_id TEXT`);
      console.log('[DB] Migration: Added project_id to user_recordings');
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_recordings_workspace ON user_recordings(workspace_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_recordings_project ON user_recordings(project_id)`);
  } catch (error) {
    console.error('[DB] User recordings column migration error:', error);
  }

  try {
    const sharedColumns = db.pragma('table_info(shared_files)') as Array<{ name: string }>;
    const sharedColumnNames = sharedColumns.map(col => col.name);
    if (!sharedColumnNames.includes('storage_scope')) {
      db.exec(`ALTER TABLE shared_files ADD COLUMN storage_scope TEXT DEFAULT 'user'`);
      console.log('[DB] Migration: Added storage_scope to shared_files');
    }
    if (!sharedColumnNames.includes('workspace_id')) {
      db.exec(`ALTER TABLE shared_files ADD COLUMN workspace_id TEXT`);
      console.log('[DB] Migration: Added workspace_id to shared_files');
    }
    if (!sharedColumnNames.includes('project_id')) {
      db.exec(`ALTER TABLE shared_files ADD COLUMN project_id TEXT`);
      console.log('[DB] Migration: Added project_id to shared_files');
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_shared_files_workspace ON shared_files(workspace_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_shared_files_project ON shared_files(project_id)`);
  } catch (error) {
    console.error('[DB] Shared files column migration error:', error);
  }
};

// Run workspace storage migrations
migrateWorkspaceStorage();

// Migration: Workspace invites
const migrateWorkspaceInvites = () => {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_invites (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'creator',
        token TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'revoked', 'expired')),
        invited_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        accepted_at DATETIME,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON workspace_invites(email);
      CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token);
    `);
    console.log('[DB] Migration: Created workspace_invites table');
  } catch (error) {
    if (!(error as Error).message.includes('already exists')) {
      console.error('[DB] Workspace invites migration error:', error);
    }
  }
};

// Run workspace invites migration
migrateWorkspaceInvites();

// Migration: Add VPAT/EN 301 549 compliance tables
const migrateVPATTables = () => {
  try {
    db.exec(`
      -- EN 301 549 Kriterien-Katalog (statische Referenzdaten)
      CREATE TABLE IF NOT EXISTS en301549_criteria (
        id TEXT PRIMARY KEY,
        chapter INTEGER NOT NULL,
        section TEXT NOT NULL,
        title_de TEXT NOT NULL,
        title_en TEXT NOT NULL,
        description_de TEXT,
        level TEXT NOT NULL CHECK(level IN ('A', 'AA', 'AAA')),
        wcag_criterion TEXT,
        bitv_reference TEXT,
        applies_to TEXT NOT NULL,
        is_additional INTEGER DEFAULT 0,
        testing_guidance_de TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Audits / Compliance-Projekte
      CREATE TABLE IF NOT EXISTS audits (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_version TEXT,
        product_type TEXT NOT NULL CHECK(product_type IN ('web', 'pdf', 'app', 'document')),
        organization TEXT,
        audit_date DATE NOT NULL,
        auditor_name TEXT,
        auditor_email TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'in_progress', 'completed')),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Bewertungen pro Kriterium
      CREATE TABLE IF NOT EXISTS audit_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id TEXT NOT NULL,
        criterion_id TEXT NOT NULL,
        support_level TEXT NOT NULL DEFAULT 'not_evaluated'
          CHECK(support_level IN ('supports', 'partially_supports', 'does_not_support', 'not_applicable', 'not_evaluated')),
        remarks_de TEXT,
        remarks_en TEXT,
        evidence_url TEXT,
        evaluated_at DATETIME,
        evaluated_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
        UNIQUE(audit_id, criterion_id)
      );

      -- Indizes für Performance
      CREATE INDEX IF NOT EXISTS idx_audits_user ON audits(user_id);
      CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
      CREATE INDEX IF NOT EXISTS idx_audits_product_type ON audits(product_type);
      CREATE INDEX IF NOT EXISTS idx_evaluations_audit ON audit_evaluations(audit_id);
      CREATE INDEX IF NOT EXISTS idx_evaluations_criterion ON audit_evaluations(criterion_id);
      CREATE INDEX IF NOT EXISTS idx_evaluations_support ON audit_evaluations(support_level);
      CREATE INDEX IF NOT EXISTS idx_criteria_chapter ON en301549_criteria(chapter);
      CREATE INDEX IF NOT EXISTS idx_criteria_wcag ON en301549_criteria(wcag_criterion);
      CREATE INDEX IF NOT EXISTS idx_criteria_level ON en301549_criteria(level);
    `);
    console.log('[DB] Migration: Created VPAT/EN 301 549 compliance tables');
  } catch (error) {
    if (!(error as Error).message.includes('already exists')) {
      console.error('[DB] VPAT tables migration error:', error);
    }
  }
};

// Run VPAT migration
migrateVPATTables();

// Migration: Add billing/workspace/credits tables
const migrateBillingTables = () => {
  try {
    db.exec(`
      -- Workspaces (multi-tenant)
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Workspace members (RBAC + seat types)
      CREATE TABLE IF NOT EXISTS workspace_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'billing_admin', 'creator', 'reviewer', 'viewer')),
        seat_type TEXT DEFAULT 'creator' CHECK(seat_type IN ('creator', 'reviewer')),
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'invited', 'removed')),
        invited_email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workspace_id, user_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Subscriptions (Stripe metadata placeholder)
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL UNIQUE,
        stripe_customer_id TEXT,
        stripe_sub_id TEXT,
        status TEXT,
        current_period_start DATETIME,
        current_period_end DATETIME,
        cancel_at_period_end INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      -- Credit wallets (available balance + reserved)
      CREATE TABLE IF NOT EXISTS credit_wallets (
        workspace_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        reserved INTEGER NOT NULL DEFAULT 0,
        last_allocation_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      -- Credit ledger (auditable usage)
      CREATE TABLE IF NOT EXISTS credit_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('ALLOCATION', 'CONSUME', 'RESERVE', 'RELEASE', 'PURCHASE', 'ADJUST')),
        amount INTEGER NOT NULL,
        job_id TEXT,
        meta TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_workspaces_plan ON workspaces(plan_id);
      CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_credit_ledger_workspace ON credit_ledger(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_credit_ledger_created ON credit_ledger(created_at);
    `);
    console.log('[DB] Migration: Created billing/workspace tables');
  } catch (error) {
    if (!(error as Error).message.includes('already exists')) {
      console.error('[DB] Billing tables migration error:', error);
    }
  }

  try {
    const userColumns = db.pragma('table_info(users)') as Array<{ name: string }>;
    const userColumnNames = userColumns.map(col => col.name);
    if (!userColumnNames.includes('default_workspace_id')) {
      db.exec(`ALTER TABLE users ADD COLUMN default_workspace_id TEXT`);
      console.log('[DB] Migration: Added default_workspace_id to users');
    }
  } catch (error) {
    console.error('[DB] Users column migration error:', error);
  }

  try {
    const auditColumns = db.pragma('table_info(audit_logs)') as Array<{ name: string }>;
    const auditColumnNames = auditColumns.map(col => col.name);
    if (!auditColumnNames.includes('workspace_id')) {
      db.exec(`ALTER TABLE audit_logs ADD COLUMN workspace_id TEXT`);
      console.log('[DB] Migration: Added workspace_id to audit_logs');
    }
  } catch (error) {
    console.error('[DB] Audit logs column migration error:', error);
  }

  try {
    const jobColumns = db.pragma('table_info(jobs)') as Array<{ name: string }>;
    const jobColumnNames = jobColumns.map(col => col.name);
    if (!jobColumnNames.includes('workspace_id')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN workspace_id TEXT`);
      console.log('[DB] Migration: Added workspace_id to jobs');
    }
    if (!jobColumnNames.includes('job_type')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN job_type TEXT`);
      console.log('[DB] Migration: Added job_type to jobs');
    }
    if (!jobColumnNames.includes('estimated_credits')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN estimated_credits INTEGER DEFAULT 0`);
      console.log('[DB] Migration: Added estimated_credits to jobs');
    }
    if (!jobColumnNames.includes('consumed_credits')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN consumed_credits INTEGER DEFAULT 0`);
      console.log('[DB] Migration: Added consumed_credits to jobs');
    }
    if (!jobColumnNames.includes('storage_scope')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN storage_scope TEXT DEFAULT 'user'`);
      console.log('[DB] Migration: Added storage_scope to jobs');
    }
    if (!jobColumnNames.includes('project_id')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN project_id TEXT`);
      console.log('[DB] Migration: Added project_id to jobs');
    }
    if (!jobColumnNames.includes('phase')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN phase TEXT`);
      console.log('[DB] Migration: Added phase to jobs');
    }
    if (!jobColumnNames.includes('error_code')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN error_code TEXT`);
      console.log('[DB] Migration: Added error_code to jobs');
    }
    if (!jobColumnNames.includes('retry_count')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN retry_count INTEGER DEFAULT 0`);
      console.log('[DB] Migration: Added retry_count to jobs');
    }
    if (!jobColumnNames.includes('gpu_wait_ms')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN gpu_wait_ms INTEGER DEFAULT 0`);
      console.log('[DB] Migration: Added gpu_wait_ms to jobs');
    }
    if (!jobColumnNames.includes('last_heartbeat_at')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN last_heartbeat_at DATETIME`);
      console.log('[DB] Migration: Added last_heartbeat_at to jobs');
    }
    if (!jobColumnNames.includes('queue_attempt')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN queue_attempt INTEGER DEFAULT 0`);
      console.log('[DB] Migration: Added queue_attempt to jobs');
    }
    if (!jobColumnNames.includes('queued_at')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN queued_at DATETIME`);
      db.exec(`UPDATE jobs SET queued_at = COALESCE(queued_at, created_at) WHERE queued_at IS NULL`);
      console.log('[DB] Migration: Added queued_at to jobs');
    }
    if (!jobColumnNames.includes('finished_at')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN finished_at DATETIME`);
      console.log('[DB] Migration: Added finished_at to jobs');
    }
    if (!jobColumnNames.includes('input_path')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN input_path TEXT`);
      console.log('[DB] Migration: Added input_path to jobs');
    }
    if (!jobColumnNames.includes('input_checksum')) {
      db.exec(`ALTER TABLE jobs ADD COLUMN input_checksum TEXT`);
      console.log('[DB] Migration: Added input_checksum to jobs');
    }
  } catch (error) {
    console.error('[DB] Jobs column migration error:', error);
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_workspace_scope ON jobs(workspace_id, storage_scope)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id)`);
  } catch (error) {
    console.error('[DB] Jobs index migration error:', error);
  }
};

// Run billing/workspace migrations
migrateBillingTables();

// Migration: Add audit signoff fields and indexes
const migrateAuditSignoff = () => {
  try {
    const tableInfo = db.pragma('table_info(audits)') as Array<{ name: string }>;
    const columnNames = tableInfo.map(col => col.name);

    if (!columnNames.includes('signoff_name')) {
      db.exec(`ALTER TABLE audits ADD COLUMN signoff_name TEXT`);
      console.log('[DB] Migration: Added signoff_name column to audits');
    }
    if (!columnNames.includes('signoff_role')) {
      db.exec(`ALTER TABLE audits ADD COLUMN signoff_role TEXT`);
      console.log('[DB] Migration: Added signoff_role column to audits');
    }
    if (!columnNames.includes('signoff_email')) {
      db.exec(`ALTER TABLE audits ADD COLUMN signoff_email TEXT`);
      console.log('[DB] Migration: Added signoff_email column to audits');
    }
    if (!columnNames.includes('signoff_at')) {
      db.exec(`ALTER TABLE audits ADD COLUMN signoff_at DATETIME`);
      console.log('[DB] Migration: Added signoff_at column to audits');
    }
    if (!columnNames.includes('signoff_notes')) {
      db.exec(`ALTER TABLE audits ADD COLUMN signoff_notes TEXT`);
      console.log('[DB] Migration: Added signoff_notes column to audits');
    }

    db.exec(`CREATE INDEX IF NOT EXISTS idx_audits_user_date ON audits(user_id, audit_date)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audits_user_product ON audits(user_id, product_name)`);
  } catch (error) {
    console.error('[DB] Audit signoff migration error:', error);
  }
};

migrateAuditSignoff();

// Seed EN 301 549 criteria if table is empty
const seedVPATCriteriaIfNeeded = () => {
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM en301549_criteria').get() as { count: number };
    if (count.count === 0) {
      // Dynamic import to avoid circular dependency
      import('./seed-en301549').then(({ seedEN301549Criteria }) => {
        seedEN301549Criteria();
      }).catch(err => {
        console.error('[DB] Failed to seed EN 301 549 criteria:', err);
      });
    }
  } catch (error) {
    // Table might not exist yet on first run
  }
};

// Run seeding after a short delay to ensure tables are created
setTimeout(seedVPATCriteriaIfNeeded, 100);

// Migration: Make user_id nullable in jobs table for anonymous uploads
const migrateJobsNullableUserId = () => {
  try {
    const tableExists = (tableName: string) => {
      const row = db
        .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`)
        .get(tableName) as { ok?: 1 } | undefined;
      return row?.ok === 1;
    };

    // Clean up / recover from a previous interrupted run.
    // If `jobs_new` exists alongside `jobs`, it's safe to drop `jobs_new` because `jobs` is still the source of truth.
    // If `jobs` is missing but `jobs_new` exists, finalize by renaming `jobs_new` back to `jobs`.
    if (tableExists('jobs_new')) {
      if (tableExists('jobs')) {
        db.exec(`DROP TABLE IF EXISTS jobs_new;`);
      } else {
        db.exec(`ALTER TABLE jobs_new RENAME TO jobs;`);
      }
    }

    // Check if we need to migrate by checking if foreign key constraint exists
    // SQLite doesn't allow modifying constraints, so we recreate the table
    const tableInfo = db.pragma('table_info(jobs)') as Array<{ name: string; notnull: number }>;
    const userIdCol = tableInfo.find(col => col.name === 'user_id');

    if (userIdCol && userIdCol.notnull === 1) {
      console.log('[DB] Migration: Making user_id nullable in jobs table...');

      db.exec(`PRAGMA foreign_keys=OFF;`);
      try {
        db.exec(`
          BEGIN;

          CREATE TABLE jobs_new (
            id TEXT PRIMARY KEY,
            queue TEXT NOT NULL,
            user_id INTEGER,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'completed', 'failed')),
            priority INTEGER NOT NULL DEFAULT 3,
            input_data TEXT,
            result_data TEXT,
            result_file_path TEXT,
            progress_stage TEXT,
            phase TEXT,
            progress_percent INTEGER DEFAULT 0,
            error_message TEXT,
            error_code TEXT,
            retry_count INTEGER DEFAULT 0,
            gpu_wait_ms INTEGER DEFAULT 0,
            last_heartbeat_at DATETIME,
            queue_attempt INTEGER DEFAULT 0,
            queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME,
            input_path TEXT,
            input_checksum TEXT,
            attempts INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            completed_at DATETIME,
            expires_at DATETIME,
            workspace_id TEXT,
            job_type TEXT,
            estimated_credits INTEGER DEFAULT 0,
            consumed_credits INTEGER DEFAULT 0,
            storage_scope TEXT DEFAULT 'user',
            project_id TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );

          INSERT INTO jobs_new (
            id,
            queue,
            user_id,
            status,
            priority,
            input_data,
            result_data,
            result_file_path,
            progress_stage,
            phase,
            progress_percent,
            error_message,
            error_code,
            retry_count,
            gpu_wait_ms,
            last_heartbeat_at,
            queue_attempt,
            queued_at,
            finished_at,
            input_path,
            input_checksum,
            attempts,
            created_at,
            started_at,
            completed_at,
            expires_at,
            workspace_id,
            job_type,
            estimated_credits,
            consumed_credits,
            storage_scope,
            project_id
          )
          SELECT
            id,
            queue,
            user_id,
            status,
            priority,
            input_data,
            result_data,
            result_file_path,
            progress_stage,
            phase,
            progress_percent,
            error_message,
            error_code,
            retry_count,
            gpu_wait_ms,
            last_heartbeat_at,
            queue_attempt,
            queued_at,
            finished_at,
            input_path,
            input_checksum,
            attempts,
            created_at,
            started_at,
            completed_at,
            expires_at,
            workspace_id,
            job_type,
            estimated_credits,
            consumed_credits,
            storage_scope,
            project_id
          FROM jobs;

          DROP TABLE jobs;
          ALTER TABLE jobs_new RENAME TO jobs;

          CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
          CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
          CREATE INDEX IF NOT EXISTS idx_jobs_queue ON jobs(queue);
          CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
          CREATE INDEX IF NOT EXISTS idx_jobs_workspace_scope ON jobs(workspace_id, storage_scope);
          CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);

          COMMIT;
        `);
      } catch (e) {
        try {
          db.exec(`ROLLBACK;`);
        } catch {
          // ignore rollback errors (e.g. no active transaction)
        }
        throw e;
      } finally {
        db.exec(`PRAGMA foreign_keys=ON;`);
      }

      console.log('[DB] Migration: jobs table migrated successfully');
    }
  } catch (error) {
    console.error('[DB] Jobs nullable user_id migration error:', error);
  }
};

// Run jobs migration
migrateJobsNullableUserId();

// Cleanup expired sessions periodically
const cleanupExpiredSessions = () => {
  const result = db.prepare(`
    DELETE FROM sessions WHERE expires_at < datetime('now')
  `).run();

  if (result.changes > 0) {
    console.log(`[DB] Cleaned up ${result.changes} expired sessions`);
  }
};

// Cleanup expired jobs periodically (DSGVO: Speicherbegrenzung)
const cleanupExpiredJobsFromDB = () => {
  // Get expired jobs with result files
  const expiredJobs = db.prepare(`
    SELECT id, result_file_path, result_data FROM jobs
    WHERE expires_at < datetime('now')
      AND (result_file_path IS NOT NULL OR result_data IS NOT NULL)
  `).all() as { id: string; result_file_path: string | null; result_data: string | null }[];

  // Delete result files
  for (const job of expiredJobs) {
    if (job.result_file_path) {
      try {
        fs.unlinkSync(job.result_file_path);
      } catch (error) {
        // File may already be deleted
      }
    }
    if (job.result_data) {
      try {
        const parsed = JSON.parse(job.result_data) as { chapterOutputDir?: string };
        if (parsed?.chapterOutputDir && fs.existsSync(parsed.chapterOutputDir)) {
          fs.rmSync(parsed.chapterOutputDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore malformed result_data
      }
    }
  }

  // Delete expired job records
  const result = db.prepare(`
    DELETE FROM jobs WHERE expires_at < datetime('now')
  `).run();

  if (result.changes > 0) {
    console.log(`[DB] Cleaned up ${result.changes} expired jobs (DSGVO compliance)`);
  }
};

// Cleanup expired recordings periodically (DSGVO: 24h Speicherbegrenzung)
const cleanupExpiredRecordings = () => {
  // Get expired recordings with files
  const expiredRecordings = db.prepare(`
    SELECT id, file_path FROM user_recordings
    WHERE expires_at < datetime('now')
  `).all() as { id: string; file_path: string }[];

  // Delete recording files
  for (const recording of expiredRecordings) {
    if (recording.file_path) {
      try {
        fs.unlinkSync(recording.file_path);
      } catch (error) {
        // File may already be deleted
      }
    }
  }

  // Delete expired recording records
  const result = db.prepare(`
    DELETE FROM user_recordings WHERE expires_at < datetime('now')
  `).run();

  if (result.changes > 0) {
    console.log(`[DB] Cleaned up ${result.changes} expired recordings (24h limit)`);
  }
};

// Cleanup expired shared files periodically (DSGVO: 24-72h Speicherbegrenzung)
const cleanupExpiredSharedFiles = () => {
  // Get expired shared files
  const expiredFiles = db.prepare(`
    SELECT id, file_path FROM shared_files
    WHERE expires_at < datetime('now')
  `).all() as { id: string; file_path: string }[];

  // Delete files from filesystem
  for (const file of expiredFiles) {
    if (file.file_path) {
      try {
        fs.unlinkSync(file.file_path);
      } catch (error) {
        // File may already be deleted
      }
    }
  }

  // Delete expired file records
  const result = db.prepare(`
    DELETE FROM shared_files WHERE expires_at < datetime('now')
  `).run();

  if (result.changes > 0) {
    console.log(`[DB] Cleaned up ${result.changes} expired shared files`);
  }
};

// Cleanup old audit logs periodically (DSGVO: Speicherbegrenzung)
const cleanupOldAuditLogs = () => {
  const result = db.prepare(`
    DELETE FROM audit_logs
    WHERE created_at < datetime('now', '-' || ? || ' days')
  `).run(AUDIT_LOG_RETENTION_DAYS);

  if (result.changes > 0) {
    console.log(`[DB] Cleaned up ${result.changes} audit logs (retention ${AUDIT_LOG_RETENTION_DAYS} days)`);
  }
};

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
setInterval(cleanupExpiredJobsFromDB, 60 * 60 * 1000);
setInterval(cleanupExpiredRecordings, 60 * 60 * 1000);
setInterval(cleanupExpiredSharedFiles, 60 * 60 * 1000);
setInterval(cleanupOldAuditLogs, 24 * 60 * 60 * 1000);

// Run initial cleanup
cleanupExpiredSessions();
cleanupExpiredJobsFromDB();
cleanupExpiredRecordings();
cleanupExpiredSharedFiles();
cleanupOldAuditLogs();

export default db;
export { DB_PATH, DATA_DIR };
