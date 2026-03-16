# DSGVO Compliance Checklist (Ops)

Short, ongoing checklist to keep VoxDrop aligned with DSGVO/Privacy commitments.

## Regular (monthly)
- Review audit log retention (default 90 days): `AUDIT_LOG_RETENTION_DAYS`
- Verify data cleanup jobs are running (sessions, jobs, recordings, shared files)
- Confirm backups/exports are stored in EU/DE only (if enabled)
- Check external subprocessors list matches reality (Resend, optional OpenAI, etc.)

## On Every Release
- Confirm Datenschutzerklaerung matches behavior (storage, retention, subprocessors)
- Validate consent flow still enforced server-side
- Verify data export includes all user data tables
- Validate account deletion removes user-owned files
- Review logging changes for sensitive data leakage

## Infrastructure / Config
- `ALLOW_OPENAI_WHISPER=false` unless DPA/SCCs are in place and disclosure updated
- `CORS_ORIGINS` set only if browser access to microservices is required
- Ensure microservices are not exposed publicly (internal network only)

## Incident Response
- If a data incident occurs: document, notify DPO, evaluate 72h notification need
- Rotate JWT secret + IP hash salt if compromise suspected

## Evidence / Documentation
- Keep records of:
  - Subprocessor agreements (AVV, SCC)
  - Retention policy decisions
  - Security updates and audits
