// Auth Types for KRITIS-compliant authentication

export interface User {
  id: number;
  email: string;
  password_hash: string;
  totp_secret: string | null;
  mfa_enabled: number;
  role: 'user' | 'admin';
  subscription: 'free' | 'premium' | 'team';
  organization: string | null;
  default_workspace_id?: string | null;
  deletion_requested_at?: string | null;
  failed_login_attempts?: number;
  locked_until?: string | null;
  consent_version?: string | null;
  consent_given_at?: string | null;
  // Email verification
  email_verified: number;
  verification_token: string | null;
  verification_token_expires: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  workspace_id?: string | null;
  action: string;
  resource: string | null;
  status: 'success' | 'failure';
  details: string | null;
  ip_hash: string | null;
  created_at: string;
}

export interface Usage {
  id: number;
  user_id: number;
  transcriptions_count: number;
  videos_count: number;
  last_reset: string;
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  subscription: string;
  mfaVerified?: boolean;
}

export interface AuthRequest {
  user?: User;
  userId?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  organization?: string;
  consentGiven?: boolean;
  consentVersion?: string;
}

export interface MFASetupResponse {
  secret: string;
  qrCode: string;
  otpauthUrl: string;
}
