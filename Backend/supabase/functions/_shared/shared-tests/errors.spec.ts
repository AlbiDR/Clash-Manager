// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import {
  ProtocolError,
  PROTOCOL_ERROR_STATUS,
  CLIENT_SAFE_MESSAGE,
  toClientSafeMessage,
  classifyThrown,
  type ProtocolErrorCode,
} from "../errors";

describe("Backend Shared Errors Module", () => {
  describe("PROTOCOL_ERROR_STATUS Mapping", () => {
    it("should map UNAUTHORIZED to 401", () => {
      expect(PROTOCOL_ERROR_STATUS.UNAUTHORIZED).toBe(401);
    });

    it("should map METHOD_NOT_ALLOWED to 405", () => {
      expect(PROTOCOL_ERROR_STATUS.METHOD_NOT_ALLOWED).toBe(405);
    });

    it("should map MALFORMED_BODY to 400", () => {
      expect(PROTOCOL_ERROR_STATUS.MALFORMED_BODY).toBe(400);
    });

    it("should map MALFORMED_PAYLOAD to 400", () => {
      expect(PROTOCOL_ERROR_STATUS.MALFORMED_PAYLOAD).toBe(400);
    });

    it("should map RATE_LIMITED to 429", () => {
      expect(PROTOCOL_ERROR_STATUS.RATE_LIMITED).toBe(429);
    });

    it("should map TELEMETRY_UNAVAILABLE to 503", () => {
      expect(PROTOCOL_ERROR_STATUS.TELEMETRY_UNAVAILABLE).toBe(503);
    });

    it("should map INTERNAL_ERROR to 500", () => {
      expect(PROTOCOL_ERROR_STATUS.INTERNAL_ERROR).toBe(500);
    });
  });

  describe("CLIENT_SAFE_MESSAGE Mapping", () => {
    it("should provide clean safe messages devoid of internal topology", () => {
      expect(CLIENT_SAFE_MESSAGE.UNAUTHORIZED).toBe("Unauthorized");
      expect(CLIENT_SAFE_MESSAGE.METHOD_NOT_ALLOWED).toBe("Method Not Allowed");
      expect(CLIENT_SAFE_MESSAGE.MALFORMED_BODY).toBe("Malformed Request Body");
      expect(CLIENT_SAFE_MESSAGE.MALFORMED_PAYLOAD).toBe("Malformed Payload");
      expect(CLIENT_SAFE_MESSAGE.RATE_LIMITED).toBe("Too Many Requests");
      expect(CLIENT_SAFE_MESSAGE.TELEMETRY_UNAVAILABLE).toBe("Service Unavailable");
      expect(CLIENT_SAFE_MESSAGE.INTERNAL_ERROR).toBe("Internal Server Error");
    });
  });

  describe("ProtocolError Class", () => {
    it("should correctly set name, code, message, and httpStatus properties", () => {
      const error = new ProtocolError("UNAUTHORIZED", "Invalid token presented");
      expect(error.name).toBe("ProtocolError");
      expect(error.code).toBe("UNAUTHORIZED");
      expect(error.message).toBe("Invalid token presented");
      expect(error.httpStatus).toBe(401);
    });

    it("should preserve original error via cause in options if provided", () => {
      const originalError = new Error("Database timeout");
      const error = new ProtocolError("TELEMETRY_UNAVAILABLE", "Failed to log telemetry", {
        cause: originalError,
      });
      expect(error.cause).toBe(originalError);
    });

    it("should respect the prototype chain for instanceof checks", () => {
      const error = new ProtocolError("INTERNAL_ERROR", "Unexpected system fault");
      expect(error instanceof ProtocolError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("toClientSafeMessage Utility", () => {
    it("should return the correct client-safe message for known error codes", () => {
      expect(toClientSafeMessage("UNAUTHORIZED")).toBe("Unauthorized");
      expect(toClientSafeMessage("RATE_LIMITED")).toBe("Too Many Requests");
      expect(toClientSafeMessage("INTERNAL_ERROR")).toBe("Internal Server Error");
    });

    it("should fallback to internal error message for an unrecognized error code", () => {
      // @ts-expect-error - testing fallback for unknown codes at runtime
      expect(toClientSafeMessage("UNKNOWN_FAILURE_CODE")).toBe("Internal Server Error");
    });
  });

  describe("classifyThrown Utility", () => {
    it("should correctly preserve a ProtocolError's code and message", () => {
      const error = new ProtocolError("MALFORMED_PAYLOAD", "Valibot parse failed");
      const result = classifyThrown(error);
      expect(result.code).toBe("MALFORMED_PAYLOAD");
      expect(result.internalDetail).toBe("Valibot parse failed");
    });

    it("should classify a standard Error into INTERNAL_ERROR and preserve the error message", () => {
      const error = new Error("Uncaught reference error");
      const result = classifyThrown(error);
      expect(result.code).toBe("INTERNAL_ERROR");
      expect(result.internalDetail).toBe("Uncaught reference error");
    });

    it("should classify a plain string into INTERNAL_ERROR and use the string as detail", () => {
      const result = classifyThrown("Something bad happened!");
      expect(result.code).toBe("INTERNAL_ERROR");
      expect(result.internalDetail).toBe("Something bad happened!");
    });

    it("should classify other primitive types into INTERNAL_ERROR and stringify them", () => {
      expect(classifyThrown(404)).toEqual({
        code: "INTERNAL_ERROR",
        internalDetail: "404",
      });
      expect(classifyThrown(true)).toEqual({
        code: "INTERNAL_ERROR",
        internalDetail: "true",
      });
      expect(classifyThrown(null)).toEqual({
        code: "INTERNAL_ERROR",
        internalDetail: "null",
      });
      expect(classifyThrown(undefined)).toEqual({
        code: "INTERNAL_ERROR",
        internalDetail: "undefined",
      });
    });

    it("should classify an arbitrary object into INTERNAL_ERROR and stringify it", () => {
      const customObj = { foo: "bar" };
      const result = classifyThrown(customObj);
      expect(result.code).toBe("INTERNAL_ERROR");
      expect(result.internalDetail).toBe("[object Object]");
    });
  });
});
