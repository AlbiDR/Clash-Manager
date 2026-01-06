const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '2mb' }));

const DEFAULT_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '8', 10);
const DEFAULT_TIMEOUT = parseInt(process.env.WORKER_TIMEOUT_SEC || '45', 10) * 1000;
const MAX_RETRIES = parseInt(process.env.WORKER_RETRIES || '2', 10);

function timeoutFetch(url, opts = {}, timeout = DEFAULT_TIMEOUT) {
  return Promise.race([
    fetch(url, { ...opts, timeout }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout)),
  ]);
}

async function fetchWithRetries(url, opts, retries = MAX_RETRIES) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= retries) {
    try {
      const res = await timeoutFetch(url, opts);
      const code = res.status;
      let content = null;
      const text = await res.text();
      try {
        content = JSON.parse(text);
      } catch (e) {
        content = text;
      }
      return { code, content };
    } catch (e) {
      lastErr = e;
      // Retry on network or 5xx
      attempt++;
      if (attempt <= retries) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { code: 520, content: `Fetch failed: ${lastErr ? lastErr.message : 'unknown'}` };
}

async function processBatch(urls = [], apiKeys = [], concurrency = DEFAULT_CONCURRENCY) {
  const results = new Array(urls.length);
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= urls.length) return;
      const url = urls[i];

      const headers = {
        'User-Agent': 'ClanManagerWorker/1.0',
        'Accept-Encoding': 'gzip'
      };
      if (apiKeys && apiKeys.length > 0) {
        const key = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        headers.Authorization = `Bearer ${key}`;
      }

      const res = await fetchWithRetries(url, { method: 'GET', headers });
      results[i] = res;
    }
  }

  const workers = [];
  const spawn = Math.min(concurrency, urls.length);
  for (let i = 0; i < spawn; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// Simple auth middleware - check Bearer token if WORKER_SECRET is set
function checkAuth(req, res, next) {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return next();
  const auth = (req.get('authorization') || '').trim();
  if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  return next();
}

app.get('/', (req, res) => res.send('Clash Manager Worker is running'));

// Capabilities endpoint for health and config (simple) - used by GAS preflight
app.get('/capabilities', checkAuth, (req, res) => {
  return res.json({
    version: '0.1.0',
    concurrency: DEFAULT_CONCURRENCY,
    timeoutMs: DEFAULT_TIMEOUT,
    maxRetries: MAX_RETRIES,
  });
});

app.post('/fetch', checkAuth, async (req, res) => {
  try {
    const { urls, apiKeys } = req.body;
    if (!Array.isArray(urls)) return res.status(400).json({ error: 'urls must be array' });
    const concurrency = Number(process.env.WORKER_CONCURRENCY || req.query.c || DEFAULT_CONCURRENCY);

    const results = await processBatch(urls, apiKeys || [], concurrency);
    return res.json({ results });
  } catch (e) {
    console.error('Failed /fetch', e);
    return res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Worker listening on ${PORT} (concurrency=${DEFAULT_CONCURRENCY})`));
