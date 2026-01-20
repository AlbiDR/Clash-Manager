# Clash Manager — Remote Worker (Cloud Run)

[![Version](https://img.shields.io/badge/Version-10.0.0-0066CC?style=flat-square)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../docs/ARCHITECTURE.md)

The **Scaling Engine**. A high-concurrency Express.js proxy designed to offload bulk URL fetching from the Google Apps Script environment, circumventing platform quotas and execution timeouts.

---

## Technical Specifications

- **Runtime**: Node.js (Express)
- **Capacity**: Configurable concurrency (default `8`) with automatic retries.
- **Security**: Supports Bearer token authentication and IAM-restricted invocation.

---

## Deployment Workflow

### 1. Build & Push

Deploy the container to Google Container Registry:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/clash-manager-worker
```

### 2. Provisioning

Deploy to Cloud Run with optimal scaling parameters:

```bash
gcloud run deploy clash-manager-worker \
  --image gcr.io/PROJECT_ID/clash-manager-worker \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

---

## Protocol Interface

The worker operates as a transparent bulk-fetching proxy for the GAS `RemoteWorker` engine.

### `POST /fetch`

**Payload**:

```json
{
  "urls": ["https://api.clashroyale.com/...", ...],
  "apiKeys": ["sk_...", ...]
}
```

**Response**:
A serialized result set containing status codes and parsed JSON/string content for each target URI.

---

## Configuration

- `WORKER_CONCURRENCY`: Adjust based on target API rate limits.
- `WORKER_TIMEOUT_SEC`: Standardized at `45` seconds to respect serverless request windows.

---

## License

Proprietary. © 2026 AlbiDR. All rights reserved.
