# RecorDs Production Security Audit

## Implemented In The Application

- PostgreSQL supports either `DATABASE_URL` or separate `DB_*` variables and optional SSL.
- PostgreSQL pool errors are logged without connection credentials.
- `/health` returns only service/database availability and uses HTTP 503 when the database is unavailable.
- Unknown `/api/*` routes return a safe JSON 404 response.
- Security response headers are applied without changing the existing UI.
- Authentication uses bcrypt hashes, expiring JWTs, token-version invalidation on logout, generic login failures, and login throttling.
- Admin API routes require authenticated `admin` role checks.
- Record queries use parameterized values and branch staff records are restricted server-side.
- Audit logs include request IP and user-agent metadata without passwords, tokens, or request bodies.
- Search, branch, registration date, status, registrar, and pending-SMS indexes are created safely with `IF NOT EXISTS`.
- PostgreSQL backup creation and restore procedures are documented in `BACKUP_AND_RECOVERY.md`.

## Required Deployment Actions

- Rotate any credential that has ever been committed, pasted into chat, or stored in a shared folder. This includes `JWT_SECRET`, database credentials, Arkesel credentials, n8n secrets, and Google service-account keys.
- Keep `.env`, `.env.local`, `service-account.json`, and all backups outside the repository and deployment artifact. `.gitignore` prevents new accidental commits; it does not remove secrets from Git history.
- Set a random `JWT_SECRET` of at least 32 characters, `NODE_ENV=production`, `DB_SSL=true` where required, and an explicit `CORS_ORIGIN` containing only the trusted application origin.
- Set `TRUST_PROXY=true` only when the service is behind one trusted reverse proxy. Do not enable it on a directly exposed server.
- Use HTTPS for the application and n8n webhook. Do not expose Arkesel keys to browser code.
- Schedule encrypted PostgreSQL backups externally and perform regular restore tests.

## Remaining Risks To Review Before Public Launch

- The current browser client stores the bearer token in `localStorage`. This preserves the existing frontend architecture but means an XSS vulnerability could read the token. A future breaking security release should migrate authentication to short-lived HttpOnly, Secure, SameSite cookies plus CSRF protection.
- The login limiter is process-local memory. For multiple Railway instances, use a shared Redis-backed limiter or an edge/WAF rule.
- The direct manual SMS endpoint and the n8n scheduled workflow must share one idempotency/claim strategy before enabling both against the same records. Test concurrent sends and provider retry behavior in a non-production database.
- Run dependency scanning and restore-based integration tests in CI before deployment.
