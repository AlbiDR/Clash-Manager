// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY_PATH = path.join(".github", "nightly-config", "stages.json");
const CONTRACT_LIST_FIELDS = [
  "detects",
  "doesNotDetect",
  "mayChange",
  "mustNotChange",
  "verification",
  "evidence",
];

function assertContract(condition, message) {
  if (!condition) throw new Error(message);
}

function validateStatement(value, label) {
  assertContract(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string.`);
}

function validateStatementList(value, label) {
  assertContract(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array.`);
  value.forEach((statement, index) => validateStatement(statement, `${label}[${index}]`));
  assertContract(new Set(value).size === value.length, `${label} must not contain duplicate statements.`);
}

export function validateStageContract(stage) {
  assertContract(stage && typeof stage === "object", "Stage contract owner must be an object.");
  assertContract(stage.contract && typeof stage.contract === "object", `Stage ${stage.number} needs a contract.`);
  assertContract(stage.contract.schemaVersion === 1, `Stage ${stage.number} contract schemaVersion must be 1.`);
  validateStatement(stage.contract.purpose, `Stage ${stage.number} contract purpose`);
  validateStatement(stage.contract.selection, `Stage ${stage.number} contract selection`);
  for (const field of CONTRACT_LIST_FIELDS) {
    validateStatementList(stage.contract[field], `Stage ${stage.number} contract ${field}`);
  }
  return stage.contract;
}

export function getContractFingerprint(stage) {
  validateStageContract(stage);
  return createHash("sha256")
    .update(JSON.stringify({ stage: stage.number, slug: stage.slug, contract: stage.contract }))
    .digest("hex");
}

function renderList(label, values) {
  return [label, ...values.map(value => `  - ${value}`)];
}

export function renderStageContract(stage) {
  validateStageContract(stage);
  const contract = stage.contract;
  return [
    `S${String(stage.number).padStart(2, "0")} ${stage.name}`,
    `Contract: v${contract.schemaVersion} ${getContractFingerprint(stage)}`,
    `Prompt: ${stage.prompt}`,
    `Purpose: ${contract.purpose}`,
    `Selection: ${contract.selection}`,
    ...renderList("Detects:", contract.detects),
    ...renderList("Does not detect:", contract.doesNotDetect),
    ...renderList("May change:", contract.mayChange),
    ...renderList("Must not change:", contract.mustNotChange),
    ...renderList("Verification:", contract.verification),
    ...renderList("Required evidence:", contract.evidence),
  ].join("\n");
}

export function renderCapabilityMatrix(registry) {
  const blocks = (registry.stages || []).map(stage => {
    validateStageContract(stage);
    return [
      `S${String(stage.number).padStart(2, "0")} ${stage.slug}`,
      `  Owns: ${stage.contract.purpose}`,
      `  Does not detect: ${stage.contract.doesNotDetect.join("; ")}`,
      `  Changes: ${stage.contract.mayChange.join("; ")}`,
      `  Does not own: ${stage.contract.mustNotChange.join("; ")}`,
    ].join("\n");
  });
  return ["Nightly Capability Map", "", ...blocks.flatMap(block => [block, ""])].join("\n").trimEnd();
}

export function loadContractRegistry(cwd = process.cwd()) {
  return JSON.parse(readFileSync(path.join(cwd, REGISTRY_PATH), "utf8"));
}

function getStageArgument(argv) {
  const at = argv.indexOf("--stage");
  if (at === -1) return null;
  const value = Number(argv[at + 1]);
  assertContract(Number.isInteger(value), "--stage requires an integer stage number.");
  return value;
}

export function executeContractCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command] = argv;
  const registry = loadContractRegistry(cwd);
  for (const stage of registry.stages || []) validateStageContract(stage);

  if (command === "capabilities") {
    console.log(argv.includes("--json")
      ? JSON.stringify(registry.stages.map(stage => ({
        stage: stage.number,
        slug: stage.slug,
        fingerprint: getContractFingerprint(stage),
        contract: stage.contract,
      })), null, 2)
      : renderCapabilityMatrix(registry));
    return;
  }

  assertContract(command === "inspect", "Usage: nightly-contract.mjs <inspect|capabilities> [--stage N] [--all] [--json]");
  const stageNumber = getStageArgument(argv);
  assertContract(stageNumber !== null || argv.includes("--all"), "inspect requires --stage N or --all.");
  const stages = stageNumber === null
    ? registry.stages
    : registry.stages.filter(stage => stage.number === stageNumber);
  assertContract(stages.length > 0, `Stage ${stageNumber} is not registered.`);

  if (argv.includes("--json")) {
    console.log(JSON.stringify(stages.map(stage => ({
      stage: stage.number,
      slug: stage.slug,
      name: stage.name,
      prompt: stage.prompt,
      fingerprint: getContractFingerprint(stage),
      contract: stage.contract,
    })), null, 2));
    return;
  }
  console.log(stages.map(renderStageContract).join("\n\n"));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    executeContractCli();
  } catch (error) {
    console.error(`Nightly contract inspection failed: ${error.message}`);
    process.exitCode = 1;
  }
}
