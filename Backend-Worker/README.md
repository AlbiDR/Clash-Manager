Clash Manager Worker (Cloud Run)

Overview
- Small Express app designed to perform bulk URL fetches with controlled concurrency and retries.
- Intended to be deployed to Cloud Run and invoked by Google Apps Script as a proxy/offloader for many UrlFetch calls.

Usage
1. Build + push:
   gcloud builds submit --tag gcr.io/PROJECT_ID/clash-manager-worker

2. Deploy to Cloud Run:
   gcloud run deploy clash-manager-worker --image gcr.io/PROJECT_ID/clash-manager-worker --region us-central1 --platform managed --allow-unauthenticated

3. Configuration:
- Set WORKER_CONCURRENCY (default 8) and WORKER_TIMEOUT_SEC (default 45) as needed.
- If you need authentication, restrict invocation and use an auth header (e.g. provide `Authorization: Bearer <secret>` in Apps Script).

Endpoint
- GET / -> health check
- POST /fetch { urls: string[], apiKeys?: string[] } -> { results: [{ code: number, content: object|string }, ...] }

Notes
- This service should be protected in production; use IAM, signed tokens, or restrict to internal traffic.
- The worker returns numeric `code` and `content` (parsed JSON or string) per URL to keep the GAS side logic simple.
