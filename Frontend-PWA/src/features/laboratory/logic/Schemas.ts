// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * 🛡️ VALIDATION BOUNDARY: Laboratory Input
 * Enforces structural integrity for raw data entering the Laboratory engine.
 * Rationale: Laboratory accepts data from both internal cache and external API.
 * This schema ensures that malformed input is caught before it reaches the simulation loop.
 * Target B [1]: Enforce strict validation boundary for Royale API data.
 */

export * from "@core/api/DataSchemas";
