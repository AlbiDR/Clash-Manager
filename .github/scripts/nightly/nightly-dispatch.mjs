// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: NIGHTLY DISPATCH
 * ----------------------------------------------------------------------------
 * Creates the Jules session for a single nightly stage, sourced entirely from
 * repo-committed files (.github/nightly-config/stages.json for identity and
 * .github/nightly-prompts/0N-*.md for prompt content) rather than a per-stage
 * scheduled task configured by hand inside the Jules UI.
 *
 * This only replaces WHERE a stage gets triggered. It does not change how the
 * session's PR gets published (still Jules' own AUTO_CREATE_PR automation) or
 * how a stuck session gets recovered (still Nightly Watchdog).
 * ============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRegistryData } from "./nightly-stage.mjs";
import { loadLedger, saveLedger, upsertStageEntry } from "./nightly-ledger.mjs";
import { createRedactor } from "./nightly-redact.mjs";

const REGISTRY_PATH = ".github/nightly-config/stages.json";
const JULES_API_BASE = "https://jules.googleapis.com/v1alpha";

const CONFIG = {
  owner: process.env.GITHUB_REPOSITORY?.split("/")[0] ?? "",
  repo: process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "",
  julesApiKey: process.env.JULES_API_KEY ?? "",
};

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  const args = { stage: null, date: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--stage") args.stage = Number(argv[i + 1]);
    if (argv[i] === "--date") args.date = argv[i + 1];
  }
  return args;
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function loadRegistry() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  validateRegistryData(registry);
  return registry;
}

export function stageDisplayNumber(stageNumber) {
  invariant(Number.isInteger(stageNumber) && stageNumber >= 1 && stageNumber <= 13, "Stage number must be 1-13.");
  return `S${String(stageNumber).padStart(2, "0")}`;
}

export function stageSessionTitle(stage, date) {
  invariant(stage?.name, "Stage name is required.");
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")), "Session title date must be YYYY-MM-DD.");
  return `${stageDisplayNumber(stage.number)}: ${stage.name} (${date})`;
}

// Mirrors the payload shape google-labs-code/jules-action uses to invoke
// Jules from a GitHub Actions step (POST /v1alpha/sessions,
// automationMode: AUTO_CREATE_PR). The stage prompt itself only points at
// `.github/nightly-prompts/00-nightly-agent-contract.md` rather than
// inlining it: Jules is given full repo access via githubRepoContext, the
// same as when a stage is triggered by its own scheduled task, so the prompt
// text does not need to embed anything the session can read itself.
async function createJulesSession(stage, registry, date, redact) {
  invariant(CONFIG.julesApiKey, "JULES_API_KEY is missing.");
  invariant(CONFIG.owner && CONFIG.repo, "GITHUB_REPOSITORY is missing or malformed.");

  const prompt = fs.readFileSync(stage.prompt, "utf8");
  const payload = {
    prompt,
    title: stageSessionTitle(stage, date),
    sourceContext: {
      source: `sources/github/${CONFIG.owner}/${CONFIG.repo}`,
      githubRepoContext: {
        startingBranch: registry.targetBranch,
      },
    },
    requirePlanApproval: false,
    automationMode: "AUTO_CREATE_PR",
  };

  const res = await fetch(`${JULES_API_BASE}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": CONFIG.julesApiKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Jules API ${res.status} ${res.statusText}: ${redact(text)}`);

  const body = JSON.parse(text);
  invariant(body.name, "Jules session response is missing a session name/id.");
  return body;
}

async function main() {
  const { stage: stageNumber, date: dateArg } = parseArgs(process.argv.slice(2));
  invariant(
    Number.isInteger(stageNumber) && stageNumber >= 1 && stageNumber <= 13,
    "Usage: nightly-dispatch.mjs --stage <1-13> [--date YYYY-MM-DD]",
  );

  const redact = createRedactor([CONFIG.julesApiKey]);
  const registry = loadRegistry();
  const stage = registry.stages.find(candidate => candidate.number === stageNumber);
  invariant(stage, `Stage ${stageNumber} is not defined in ${REGISTRY_PATH}.`);

  const date = dateArg || utcToday();

  console.log(`[${stageDisplayNumber(stageNumber)}] Creating Jules session for "${stage.name}" (target: ${registry.targetBranch})...`);
  const session = await createJulesSession(stage, registry, date, redact);
  console.log(redact(`[${stageDisplayNumber(stageNumber)}] Session created: ${session.name}`));

  const ledger = loadLedger();
  const priorAttempts = ledger.runs?.[date]?.[String(stageNumber)]?.attempts || 0;
  const entry = upsertStageEntry(ledger, registry, date, stageNumber, {
    state: "RUNNING",
    evidence: { dispatchSessionName: session.name },
    attempts: priorAttempts + 1,
  });
  saveLedger(ledger);

  console.log(`[${stageDisplayNumber(stageNumber)}] Ledger updated: state=${entry.state}, attempts=${entry.attempts}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}
