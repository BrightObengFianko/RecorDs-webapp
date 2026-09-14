# RecorDs SMS Workflows

These are draft n8n workflow exports for the local RecorDs app.

Current inspection notes:
- The local n8n instance already has one active workflow named `OFFICE FLOW`.
- That workflow uses Google Sheets and Arkesel SMS HTTP nodes.
- There is no PostgreSQL credential configured in n8n yet.

Files:
- `ready-sms-dry-run.json` previews SMS messages without sending anything.
- `ready-sms-live.json` sends SMS for `Ready` records where `sms_sent = false`.

What you need to connect before the live workflow runs:
- A PostgreSQL credential in n8n for the RecorDs database named `Postgres account`.
- Environment variables in the n8n process:
  - `ARKESEL_API_KEY`
  - `ARKESEL_SENDER_ID`
  - `ARKESEL_SANDBOX` optional, set to `true` for provider-side test sends

For backend-triggered SMS, configure the RecorDs server with:

```text
N8N_WEBHOOK_URL=https://your-public-n8n-host/webhook/your-production-path
N8N_WEBHOOK_SECRET=<same-long-random-secret-used by the webhook check>
N8N_WEBHOOK_TIMEOUT_MS=10000
```

The backend sends the secret only in the `X-N8N-Webhook-Secret` request header. Configure the n8n Webhook workflow to reject requests unless that header exactly matches the secret. Never place the secret in browser code, n8n workflow response data, or frontend environment variables.

Use the production webhook URL for deployed RecorDs. A Railway/Render backend cannot reach n8n running on your computer's `localhost` or private LAN address. For local development, use a local URL in a local environment file only; for production, expose n8n through a secured HTTPS endpoint or tunnel.

Duplicate protection:
- The workflow only selects records whose normalized `sms_sent` value is not a sent/true value. The application compatibility schema stores this field as text, so the workflow casts it to text instead of assuming a PostgreSQL boolean.
- It updates `sms_sent` to the canonical text value `true` and sets `sms_date` only after the SMS provider call succeeds.
- The database remains the source of truth for whether a message has already been sent.

Test options:
- `ready-sms-dry-run.json` does not call Arkesel at all.
- `ready-sms-live.json` can call Arkesel in sandbox mode when `ARKESEL_SANDBOX=true`.

If you want stricter exactly-once delivery across restarts or concurrent runs, add a small processing lock column or outbox table later. I did not change your database schema in this step.
