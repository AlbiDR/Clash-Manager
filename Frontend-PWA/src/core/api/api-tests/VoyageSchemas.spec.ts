// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  VoyageEventSchema,
  VoyageContributionSchema,
  VoyageSummarySchema,
} from "../VoyageSchemas";

describe("VoyageSchemas", () => {
  describe("VoyageEventSchema", () => {
    it("should parse valid voyage event", () => {
      const input = {
        id: 1,
        status: "ACTIVE",
        target_crowns: 600,
        start_at: "2026-01-01T00:00:00Z",
        end_at: null
      };
      const result = v.parse(VoyageEventSchema, input);
      expect(result.id).toBe(1);
      expect(result.status).toBe("ACTIVE");
    });

    it("should fail for invalid status", () => {
      const input = {
        id: 1,
        status: "INVALID",
        target_crowns: 600,
        start_at: "2026-01-01T00:00:00Z",
        end_at: null
      };
      const result = v.safeParse(VoyageEventSchema, input);
      expect(result.success).toBe(false);
    });
  });

  describe("VoyageContributionSchema", () => {
    it("should parse valid contribution", () => {
      const input = {
        player_tag: "#ABC",
        player_name: "Player",
        total_voyage_crowns: 100,
        percentage_voyage_crowns: 0.16
      };
      const result = v.parse(VoyageContributionSchema, input);
      expect(result.player_tag).toBe("#ABC");
      expect(result.total_voyage_crowns).toBe(100);
    });
  });

  describe("VoyageSummarySchema", () => {
    it("should parse valid summary", () => {
      const input = {
        event: {
          id: 1,
          status: "COMPLETED",
          target_crowns: 600,
          start_at: "2026-01-01T00:00:00Z",
          end_at: "2026-01-02T00:00:00Z"
        },
        total_voyage_crowns: 650,
        progress_ratio: 1.08
      };
      const result = v.parse(VoyageSummarySchema, input);
      expect(result.event.status).toBe("COMPLETED");
      expect(result.total_voyage_crowns).toBe(650);
    });
  });
});
