// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, expect, it } from "vitest";
import {
  BOOT_MOTION_SCRIPT,
  resolveMotionPreference,
} from "../motionContract";

describe("motion preference contract", () => {
  it.each([
    [null, "system"],
    ["system", "system"],
    ["reduced", "reduced"],
    ["standard", "standard"],
    ["invalid", "system"],
  ] as const)("resolves %s to %s", (storedPreference, expectedPreference) => {
    expect(resolveMotionPreference(storedPreference)).toBe(expectedPreference);
  });

  it("prepares the root preference before application bootstrap", () => {
    const attributes = new Map<string, string>();
    const localStorage = { getItem: () => "reduced" };
    const document = {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
    };

    const run = new Function("localStorage", "document", BOOT_MOTION_SCRIPT);
    run(localStorage, document);

    expect(attributes.get("data-motion-preference")).toBe("reduced");
  });
});
