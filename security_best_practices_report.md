# Security Best Practices Report

## Scope
- Date: 2026-02-14
- Repository path: `/Users/davidwegener/Desktop/Apps/Voxdrop-neu2601`
- Reviewed areas: authentication/session cookie handling, headers, public redirect flows, and frontend sinks.

## Executive summary
No critical vulnerabilities were found in the reviewed code. The highest risks are:
- relaxed production Content-Security-Policy settings that include `unsafe-eval`
- unguarded state-changing, cookie-based endpoints without explicit CSRF validation
- arbitrary target URL redirects in short-link handlers.

## Critical
None identified.

## High

### H1. Production CSP allows `unsafe-eval`
- **Evidence**
  - `server/index.ts:39-45` defines `script-src 'self' 'unsafe-eval'` in production and additionally allows `unsafe-inline` in development.
- **Impact**
  - In a single successful script injection (e.g., via reflected or stored XSS elsewhere), `unsafe-eval` enables execution paths that CSP otherwise blocks, increasing blast radius and persistence options.
- **Recommended remediation**
  - Remove `unsafe-eval` and `unsafe-inline` from CSP in production.
  - Prefer script nonces/hashes with `style-src`/`script-src` hardening.
  - Keep `unsafe-eval` only in explicit temporary, local-only development exceptions.

### H2. Cookie-auth state-mutating endpoints lack explicit CSRF defenses
- **Evidence**
  - Auth cookies are set as cookie-based auth on login (`server/auth/routes.ts:81-90`) and reused for session checks (`server/auth/middleware.ts:28-39`, `server/auth/middleware.ts:60-93`).
  - Stateful mutating endpoints exist without CSRF checks (examples):
    - `server/auth/routes.ts:397-405` (`POST /auth/logout`)
    - `server/auth/routes.ts:648-685` (`POST /auth/refresh`)
    - `server/routes/session-routes.ts:343-347` (mutating upload init), `server/routes/session-routes.ts:412-413` (chunk upload), `server/routes/session-routes.ts:466-467` (chunk complete), `server/routes/session-routes.ts:868-869` (`DELETE /api/session/files/:fileId`), `server/routes/session-routes.ts:888-889` (`DELETE /api/session`)
  - Cookie policy is `SameSite=Lax` (`server/auth/config.ts:48`), not strict.
- **Impact**
  - A browser session can be forced to execute cross-site state changes if CSRF protections are bypassed or if compatibility requirements relax cookie protections.
- **Recommended remediation**
  - Implement CSRF protection (double-submit or synchronizer token) for all authenticated `POST/PUT/PATCH/DELETE` routes, including auth/session management endpoints.
  - Consider enforcing `SameSite=Strict` where possible and adding `Origin`/`Referer` validation as defense-in-depth.
  - Keep CSRF audits in `POST /logout` and `/refresh` paths explicitly.

## Medium

### M1. Open redirection risk in short-link flows
- **Evidence**
  - URL creation and updates only enforce protocol (`http`/`https`) and length checks (`server/routes.ts:4996`, `server/routes.ts:5021` and `server/routes.ts:5066-5072`), not allowlist/anti-phishing restrictions.
  - Protected link handler redirects on client side using unvalidated stored target: `server/routes.ts:5425` (`window.location.href = data.targetUrl`).
  - Public handler performs direct HTTP redirect: `server/routes.ts:5444-5446` (`res.redirect(302, status.link.target_url)`), and preview render uses `href` with server-provided target URL: `server/routes.ts:5650`.
- **Impact**
  - Users can be sent to attacker-controlled domains if a permitted user creates a short link with a trusted domain and then shares it; this can materially increase phishing/safety risk and may bypass internal trust assumptions.
- **Recommended remediation**
  - Introduce optional allowlisting / domain policy for redirect targets.
  - Add explicit interstitial warning for non-allowlisted external hosts and block risky protocols.
  - Keep redirect logs and abuse detection around suspicious target changes and high-velocity link creation.

## Low

### L1. `dangerouslySetInnerHTML` in chart component
- **Evidence**
  - `client/src/components/ui/chart.tsx:80-99` uses `dangerouslySetInnerHTML` to inject style text built from `config`.
- **Impact**
  - If `config` can be influenced by user-provided input without validation, CSS injection or style-based attacks become possible.
- **Recommended remediation**
  - Restrict chart color/theme inputs to strict enums at both API and UI layers.
  - Add structural validation and explicit escaping before interpolation, or avoid string-template injection entirely.
  - Add source-of-trust documentation for all props passed into `ChartContainer`.

### L2. Client-side session identifier in LocalStorage
- **Evidence**
  - Session ID is persisted in LocalStorage (`client/src/hooks/use-session.ts:133-150`).
  - Session mutation endpoints trust `x-session-id` headers from client requests (`server/routes/session-routes.ts:868-870`, `server/routes/session-routes.ts:889-890`).
- **Impact**
  - XSS on the frontend could read the session ID and act as that session against authenticated requests.
- **Recommended remediation**
  - Minimize LocalStorage usage for sensitive identifiers where practical.
  - Rotate session IDs on sensitive actions and bind to short-lived server-side keys.
  - Strengthen CSP and input handling to reduce XSS preconditions.

## Open questions / assumptions
- The review assumes `target_url` values are creator-controlled content stored in DB; if those values have strict ownership and validation controls not shown in this pass, adjust the redirect risk accordingly.
- The `dangerouslySetInnerHTML` risk is contingent on upstream `ChartConfig` data provenance.

## Suggested next steps
1. Decide whether `unsafe-eval` removal is acceptable in your production CSP build.
2. Add a single CSRF middleware and apply it to all state-changing cookie-authenticated routes.
3. Add an allowlist/intersitial policy for short-link redirect targets.
4. If you want, I can draft the first code changes for items H1 and H2 directly.
