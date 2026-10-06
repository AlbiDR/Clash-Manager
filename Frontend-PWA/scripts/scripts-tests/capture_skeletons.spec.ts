// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * The capture-page suite drives a real headless Chromium against a local
 * fixture page, so it needs Playwright's Chromium. Where that browser is not
 * installed (Auto Tag and Intel Checks never install it) that suite is
 * reported as skipped, never as passed: a capture test that could not run
 * must not read as one that did. The other suites need no browser.
 */
import { existsSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";
import { createServer as createViteServer } from "vite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_HOST,
  ensureBonesFresh,
  initCapturePage,
  validateCaptureReady,
  validateCapturedGroups,
} from "../capture_skeletons";
import { readCache, writeCache } from "../lib/capture-cache";
import { ensureBonesSeed } from "../seed_bones";

// Pass-through wrappers: every module behaves exactly as the real one unless a
// test overrides it, so the browser suite below runs against real code. Only
// the bootstrap tests swap in implementations, and they touch no real file.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(actual.existsSync), writeFileSync: vi.fn(actual.writeFileSync) };
});
vi.mock("vite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vite")>();
  return { ...actual, createServer: vi.fn(actual.createServer) };
});
vi.mock("../seed_bones", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../seed_bones")>();
  return { ...actual, ensureBonesSeed: vi.fn(actual.ensureBonesSeed) };
});
vi.mock("../lib/capture-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/capture-cache")>();
  return { ...actual, readCache: vi.fn(actual.readCache), writeCache: vi.fn(actual.writeCache) };
});

const chromiumInstalled = existsSync(chromium.executablePath());

type FixtureWindow = { __stallSettled: boolean };

describe("validateCapturedGroups", () => {
  const memberCard = { MemberCard: { mobile: { card: { width: 336, height: 74 } } } };

  it("throws when nothing was measured and no earlier capture exists, naming the routes", () => {
    expect(() => validateCapturedGroups({}, ["MemberCard", "VaultCard"], ["/roster", "/laboratory"], [])).toThrow(
      /measured no bones on any route \(\/roster, \/laboratory\) and no earlier capture exists/,
    );
  });

  it("returns the expected groups that rendered nothing when others did", () => {
    expect(
      validateCapturedGroups(memberCard, ["MemberCard", "VaultCard", "SummaryCard"], ["/roster", "/laboratory"], []),
    ).toEqual(["VaultCard", "SummaryCard"]);
  });

  it("reports, not throws, groups that have never rendered, even when other groups have stored geometry", () => {
    // The laboratory case: the other groups are cached, so a run visits
    // /laboratory alone and measures nothing there, and no laboratory group
    // has ever been captured.
    expect(validateCapturedGroups({}, ["VaultCard", "SummaryCard"], ["/laboratory"], ["MemberCard"])).toEqual([
      "VaultCard",
      "SummaryCard",
    ]);
  });

  it("throws when a group an earlier capture measured now renders nothing", () => {
    const recruitCard = { RecruitCard: { mobile: { card: { width: 336, height: 96 } } } };
    expect(() =>
      validateCapturedGroups(recruitCard, ["MemberCard", "RecruitCard", "VaultCard"], ["/roster", "/headhunter"], [
        "MemberCard",
        "RecruitCard",
      ]),
    ).toThrow(/MemberCard rendered no bones on \/roster, \/headhunter although an earlier capture measured them/);
  });
});

describe("capture bootstrap", () => {
  const stopped = new Error("dev server deliberately not started by this test");

  beforeEach(async () => {
    const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.stubEnv("VITE_SUPABASE_URL", "https://placeholder.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "placeholder");
    // Every group stale, no stored bones and no index.html to keep, and no
    // write reaches the disk: the bootstrap runs up to the dev server and stops.
    vi.mocked(readCache).mockReturnValueOnce({});
    vi.mocked(existsSync).mockImplementation((path) =>
      String(path).endsWith("chromium") ? realFs.existsSync(path) : false,
    );
    vi.mocked(writeFileSync).mockImplementation(() => undefined);
    vi.mocked(writeCache).mockImplementation(() => undefined);
    vi.mocked(ensureBonesSeed).mockReturnValue(true);
    vi.mocked(createViteServer).mockRejectedValueOnce(stopped);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const realSeed = await vi.importActual<typeof import("../seed_bones")>("../seed_bones");
    const realCache = await vi.importActual<typeof import("../lib/capture-cache")>("../lib/capture-cache");
    vi.mocked(existsSync).mockImplementation(realFs.existsSync);
    vi.mocked(writeFileSync).mockImplementation(realFs.writeFileSync);
    vi.mocked(writeCache).mockImplementation(realCache.writeCache);
    vi.mocked(ensureBonesSeed).mockImplementation(realSeed.ensureBonesSeed);
    vi.mocked(ensureBonesSeed).mockClear();
    vi.mocked(createViteServer).mockClear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("seeds bones.generated.json before it boots the dev server the app is loaded from", async () => {
    vi.stubEnv("BONES_REQUIRE_CAPTURE", "");
    await ensureBonesFresh();

    expect(ensureBonesSeed).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ensureBonesSeed).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createViteServer).mock.invocationCallOrder[0],
    );
    // Without BONES_REQUIRE_CAPTURE a failed capture degrades, and says so.
    expect(console.warn).toHaveBeenCalledWith(stopped.message);
    expect(writeCache).not.toHaveBeenCalled();
  });

  it("fails the capture under BONES_REQUIRE_CAPTURE instead of degrading", async () => {
    vi.stubEnv("BONES_REQUIRE_CAPTURE", "true");
    await expect(ensureBonesFresh()).rejects.toBe(stopped);
    expect(ensureBonesSeed).toHaveBeenCalledTimes(1);
  });
});

/**
 * A page shaped like the failure: it asks a host other than the capture host
 * for something that never answers (an HTTP request and a WebSocket), renders
 * its bones a frame after load, enters with a transition whose start state
 * shrinks the card, and keeps one bone far off screen under
 * `content-visibility: auto`. It also carries the one piece of the real app's
 * contract the ready signal reads: a mounted Vue app exposing its router.
 */
function getFixturePage(externalHost: string): string {
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

/** Starts listening on the capture host and resolves with the assigned port. */
function initServer(server: Server): Promise<number> {
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
    stallPort = await initServer(stallServer);
    // Same machine, different host name: "localhost" is not the capture host,
    // so the capture page must treat it exactly like a remote third party.
    const externalHost = `localhost:${stallPort}`;
    appServer = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(getFixturePage(externalHost));
    });
    fixtureUrl = `http://${CAPTURE_HOST}:${await initServer(appServer)}/`;
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
    // Resolved by the stalling host itself the moment the request lands.
    const stallReached = new Promise<void>((resolve) => stallServer.once("request", () => resolve()));
    await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await stallReached;
    // The host has the request and will never answer it, so it is still in
    // flight: exactly the state the old `networkidle` wait timed out on.
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).__stallSettled)).toBe(false);
    await page.close();
  });

  it("aborts and logs the third-party host, then measures settled geometry", async () => {
    const blocked = new Set<string>();
    const { context, page } = await initCapturePage(browser, blocked);
    const before = reachedStallHost.length;

    await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await validateCaptureReady(page);

    const getBoneSize = (bone: string) =>
      page.$eval(`[data-bone="${bone}"]`, (element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
    // Measured after the entry transition, not at its shrunken start state.
    expect(await getBoneSize("Fixture.card")).toEqual({ width: 120, height: 40 });
    // Laid out at its real height although it is far off screen.
    expect((await getBoneSize("Fixture.far")).height).toBe(40);

    expect([...blocked].sort()).toEqual([`http://localhost:${stallPort}/stall`, `ws://localhost:${stallPort}/socket`]);
    expect(reachedStallHost.length).toBe(before);
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).__stallSettled)).toBe(true);
    await context.close();
  });
});
