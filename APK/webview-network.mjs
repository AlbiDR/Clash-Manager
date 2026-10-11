// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Older WebViews lack PerformanceResourceTiming.responseStatus. Observe the
// app's real snapshot reads through CDP instead; never fabricate browser data.
const SNAPSHOTS = ["roster_materialized", "headhunter_materialized", "recruit_blacklist_view"];

export function createSnapshotResponseTracker() {
  const requests = new Map();
  return {
    observe({ method, params = {} }) {
      if (method === "Network.requestWillBeSent") {
        // Redirects reuse request IDs. A redirected non-snapshot response must
        // not inherit the original request's identity and count as evidence.
        requests.delete(params.requestId);
        let url;
        try { url = new URL(params.request?.url); } catch { return; }
        const relation = url.pathname.split("/").at(-1);
        if (params.request?.method === "GET" && url.protocol === "https:"
          && url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/")
          && SNAPSHOTS.includes(relation)) {
          requests.set(params.requestId, { relation, status: null, completed: false, failed: false });
        }
      }
      const request = requests.get(params.requestId);
      if (!request) return;
      if (method === "Network.responseReceived") {
        const status = params.response?.status;
        request.status = Number.isInteger(status) && status >= 100 && status < 600 ? status : null;
      }
      if (method === "Network.loadingFinished") request.completed = true;
      if (method === "Network.loadingFailed") request.failed = true;
    },
    snapshot() {
      const responses = [...requests.values()];
      const successful = responses.filter(r => r.completed && !r.failed && r.status >= 200 && r.status < 300);
      const failed = responses.filter(r => r.failed || r.status >= 400);
      return {
        source: "CDP",
        ready: SNAPSHOTS.every(relation => successful.some(r => r.relation === relation)),
        responses,
        supabase: { total: responses.length, successful: successful.length, failed: failed.length,
          unknown: responses.length - successful.length - failed.length },
      };
    },
  };
}

/** A normal page reload preserves app storage and all Android permissions. */
export function observeSnapshotResponses(debuggerUrl, timeoutMs) {
  return new Promise((resolve, reject) => {
    const tracker = createSnapshotResponseTracker();
    const socket = new WebSocket(debuggerUrl);
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error(
      `Snapshot network observation timed out: ${JSON.stringify(tracker.snapshot())}`,
    )), timeoutMs);
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: "Network.enable" }));
    socket.onerror = () => finish(new Error("WebView network observation connection failed"));
    socket.onclose = () => finish(new Error("WebView closed during network observation"));
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); }
      catch { finish(new Error("WebView returned malformed network evidence")); return; }
      if (message.error) {
        finish(new Error(`WebView network command failed: ${message.error.message}`));
        return;
      }
      if (message.id === 1) socket.send(JSON.stringify({ id: 2, method: "Page.reload" }));
      tracker.observe(message);
      const snapshot = tracker.snapshot();
      if (snapshot.supabase.failed > 0) finish(new Error(`Snapshot request failed: ${JSON.stringify(snapshot)}`));
      else if (snapshot.ready) finish(null, snapshot);
    };
  });
}
