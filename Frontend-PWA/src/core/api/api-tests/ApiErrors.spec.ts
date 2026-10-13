// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { NetworkError } from "../ApiErrors";

describe("ApiErrors", () => {
  describe("NetworkError", () => {
    it("instantiates with the provided error message and correct error name", () => {
      const errorMessage = "Network timeout occurred while fetching resources";
      const error = new NetworkError(errorMessage);

      expect(error.message).toBe(errorMessage);
      expect(error.name).toBe("NetworkError");
    });

    it("correctly sets up the prototype chain for instanceof checks", () => {
      const error = new NetworkError("Connection refused");

      expect(error).toBeInstanceOf(NetworkError);
      expect(error).toBeInstanceOf(Error);
    });

    it("captures stack traces correctly", () => {
      const error = new NetworkError("DNS resolution failed");

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe("string");
      expect(error.stack).toContain("NetworkError: DNS resolution failed");
    });
  });
});
