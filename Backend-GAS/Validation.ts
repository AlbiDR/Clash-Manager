/**
 * ============================================================================
 * MODULE: VALIDATION SCEMAS
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized registry of Valibot schemas for API payload validation.
 * ROLE: Ingress Filtering & Boundary Hardening.
 * VERSION: 1.0.0
 * ============================================================================
 */

import * as v from 'valibot';

const VER_VALIDATION = "1.0.0";

// Base schema to extract 'action' field safely
export const BaseActionSchema = v.object({
  action: v.optional(v.string())
});

export const DismissRecruitItemSchema = v.union([
  v.string(),
  v.object({
    id: v.string(),
    score: v.optional(v.union([v.string(), v.number()])),
    potentialRawScore: v.optional(v.union([v.string(), v.number()])),
    rawScore: v.optional(v.union([v.string(), v.number()]))
  })
]);

export const DismissRecruitsPayloadSchema = v.object({
  action: v.optional(v.string()),
  items: v.optional(v.array(DismissRecruitItemSchema)),
  ids: v.optional(v.array(v.string()))
});

export const UndismissRecruitsPayloadSchema = v.object({
  action: v.optional(v.string()),
  ids: v.array(v.string())
});

export const TriggerUpdatePayloadSchema = v.object({
  action: v.optional(v.string()),
  target: v.string()
});

export const PlayerProfilePayloadSchema = v.object({
  action: v.optional(v.string()),
  tag: v.string()
});

export const LoggerPayloadSchema = v.object({
  action: v.optional(v.string()),
  level: v.optional(v.string()),
  message: v.optional(v.string()),
  context: v.optional(v.string())
});

/**
 * [GUARD] GENERIC PAYLOAD: Catch-all for unclassified actions.
 * THREAT: The "any Plague" (Target B [4]).
 * Rationale: Replacing v.any() with v.unknown() ensures that unvalidated
 * data cannot be accessed without explicit type narrowing or parsing.
 */
export const GenericPayloadSchema = v.objectWithRest(
  { action: v.optional(v.string()) },
  v.unknown()
);

(function(scope: any) {
  Object.assign(scope, {
    VER_VALIDATION,
    BaseActionSchema,
    DismissRecruitsPayloadSchema,
    UndismissRecruitsPayloadSchema,
    TriggerUpdatePayloadSchema,
    PlayerProfilePayloadSchema,
    LoggerPayloadSchema,
    GenericPayloadSchema,
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));
