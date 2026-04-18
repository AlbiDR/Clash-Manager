// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// Import the actual middleware from index.ts to ensure we're testing the real logic.
import { authMiddleware } from "../index.js";

describe("Authentication Middleware", () => {
  let app: express.Express;
  const secret = "test-secret";

  beforeEach(() => {
    process.env["REMOTE_WORKER_SECRET"] = secret;
    app = express();

    app.use(authMiddleware);
    app.get("/", (_req, res) => res.status(200).send("OK"));
    app.get("/hub/state", (_req, res) => res.status(200).send("DATA"));
    app.get("/health", (_req, res) => res.status(200).send("HEALTHY"));
  });

  it("should allow unauthenticated access to /", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
  });

  it("should block unauthenticated access to /hub/state", async () => {
    const res = await request(app).get("/hub/state");
    expect(res.status).toBe(401);
  });

  it("should allow unauthenticated access to /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("should handle trailing slashes in public routes via normalization", async () => {
    const res = await request(app).get("/health/");
    expect(res.status).toBe(200);
  });

  it("should allow authenticated access to /hub/state", async () => {
    const res = await request(app)
      .get("/hub/state")
      .set("Authorization", `Bearer ${secret}`);
    expect(res.status).toBe(200);
  });
});
