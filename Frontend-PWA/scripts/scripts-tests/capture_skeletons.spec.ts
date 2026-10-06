// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * Drives a real headless Chromium against a local fixture page, so it needs
 * Playwright's Chromium. Where that browser is not installed (Auto Tag and
 * Intel Checks never install it) the suite is reported as skipped, never as
 * passed: a capture test that could not run must not read as one that did.
 */
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CAPTURE_HOST, openCapturePage, waitForCaptureReady } from "../capture_skeletons";

const chromiumInstalled = existsSync(chromium.executablePath());

type FixtureWindow = { __stallSettled: boolean };

/**
 * A page shaped like the failure: it asks a host other than the capture host
 * for something that never answers (an HTTP request and a WebSocket), renders
 * its bones a frame after load, enters with a transition whose start state
 * shrinks the card, and keeps one bone far off screen under
 * `content-visibility: auto`. It also carries the one piece of the real app's
 * contract the ready signal reads: a mounted Vue app exposing its router.
 */
function fixturePage(externalHost: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; }
  .card { width: 120px; height: 40px; transition: transform 200ms; }
  .card.list-enter-active { transform: scale(0.5); }
  .spacer { height: 3000px; }
  .far { content-visibility: auto; }
  .far > div { height: 40px; }
</style></head><body><div id="app"></div><script>
  window.__stallSettled = false;
  fetch("http://${externalHost}/stall").catch(() => {}).finally(() => { window.__stallSettled = true; });
  try { new WebSocket("ws://${externalHost}/socket"); } catch (error) { console.warn(error); }
  const app = document.getElementById("app");
  app.__vue_app__ = { config: { globalProperties: { $router: { isReady: () => Promise.resolve() } } } };
  requestAnimationFrame(() => {
    app.innerHTML = '<div class="card list-enter-active" data-bone="Fixture.card"></div>'
      + '<div class="spacer"></div><div class="far" data-bone="Fixture.far"><div></div></div>';
    const card = app.querySelector(".card");
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove("list-enter-active")));
  });
</script></body></html>`;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, CAPTURE_HOST, () => resolve((server.address() as AddressInfo).port));
  });
}

describe.skipIf(!chromiumInstalled)("capture page against a stalling third-party host", () => {
  let browser: Browser;
  let stallServer: Server;
  let appServer: Server;
  let stallPort: number;
  let fixtureUrl: string;
  // Every request the stalling host received; it accepts each one and never answers.
  const reachedStallHost: string[] = [];

  beforeAll(async () => {
    stallServer = createServer((request) => {
      reachedStallHost.push(request.url ?? "");
    });
    stallServer.on("upgrade", (request) => {
      reachedStallHost.push(request.url ?? "");
    });
    stallPort = await listen(stallServer);
    // Same machine, different host name: "localhost" is not the capture host,
    // so the capture page must treat it exactly like a remote third party.
    const externalHost = `localhost:${stallPort}`;
    appServer = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(fixturePage(externalHost));
    });
    fixtureUrl = `http://${CAPTURE_HOST}:${await listen(appServer)}/`;
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    for (const server of [stallServer, appServer]) {
      server?.closeAllConnections();
      server?.close();
    }
  });

  it("control: an ordinary page leaves the stalled request open, so networkidle could never arrive", async () => {
    const page = await browser.newPage();
    const before = reachedStallHost.length;
    await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await expect.poll(() => reachedStallHost.length).toBeGreaterThan(before);
    // The host has the request and will never answer it, so it is still in
    // flight: exactly the state the old `networkidle` wait timed out on.
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).__stallSettled)).toBe(false);
    await page.close();
  });

  it("aborts and logs the third-party host, then measures settled geometry", async () => {
    const blocked = new Set<string>();
    const { context, page } = await openCapturePage(browser, blocked);
    const before = reachedStallHost.length;

    await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await waitForCaptureReady(page);

    const size = (bone: string) =>
      page.$eval(`[data-bone="${bone}"]`, (element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
    // Measured after the entry transition, not at its shrunken start state.
    expect(await size("Fixture.card")).toEqual({ width: 120, height: 40 });
    // Laid out at its real height although it is far off screen.
    expect((await size("Fixture.far")).height).toBe(40);

    expect([...blocked].sort()).toEqual([`http://localhost:${stallPort}/stall`, `ws://localhost:${stallPort}/socket`]);
    expect(reachedStallHost.length).toBe(before);
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).__stallSettled)).toBe(true);
    await context.close();
  });
});
