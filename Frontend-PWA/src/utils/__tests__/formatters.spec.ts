import { describe, it, expect } from "vitest";
import { parseTimeAgoValue, getScoreTone, formatRole, cleanTag } from "../formatters";

describe("Formatters - parseTimeAgoValue", () => {
  it("returns 0 for 'Just now', '-' or empty", () => {
    expect(parseTimeAgoValue("Just now")).toBe(0);
    expect(parseTimeAgoValue("-")).toBe(0);
    expect(parseTimeAgoValue("")).toBe(0);
    expect(parseTimeAgoValue(null)).toBe(0);
  });

  it("correctly parses minutes", () => {
    expect(parseTimeAgoValue("5m ago")).toBe(5);
    expect(parseTimeAgoValue("10m ago")).toBe(10);
  });

  it("correctly parses hours", () => {
    expect(parseTimeAgoValue("1h ago")).toBe(60);
    expect(parseTimeAgoValue("3h ago")).toBe(180);
  });

  it("correctly parses days", () => {
    expect(parseTimeAgoValue("1d ago")).toBe(1440);
    expect(parseTimeAgoValue("7d ago")).toBe(10080);
  });

  it("correctly parses years", () => {
    expect(parseTimeAgoValue("1y ago")).toBe(525600);
  });

  it("returns a large number for unmatchable strings", () => {
    expect(parseTimeAgoValue("unknown")).toBe(99999999);
    expect(parseTimeAgoValue("5w ago")).toBe(99999999);
  });
});

describe("Formatters - getScoreTone", () => {
  it("returns tone-high for score >= 80", () => {
    expect(getScoreTone(80)).toBe("tone-high");
    expect(getScoreTone(95)).toBe("tone-high");
  });

  it("returns tone-mid for score >= 50 and < 80", () => {
    expect(getScoreTone(50)).toBe("tone-mid");
    expect(getScoreTone(79)).toBe("tone-mid");
  });

  it("returns tone-low for score < 50", () => {
    expect(getScoreTone(49)).toBe("tone-low");
    expect(getScoreTone(10)).toBe("tone-low");
    expect(getScoreTone(undefined)).toBe("tone-low");
  });
});

describe("Formatters - formatRole", () => {
  it("identifies leader", () => {
    expect(formatRole("leader").label).toBe("Leader");
  });
  it("identifies coleader", () => {
    expect(formatRole("coleader").label).toBe("Co-Lead");
    expect(formatRole("co-leader").label).toBe("Co-Lead");
  });
  it("identifies elder", () => {
    expect(formatRole("elder").label).toBe("Elder");
  });
  it("defaults to member", () => {
    expect(formatRole("member").label).toBe("Member");
    expect(formatRole("unknown").label).toBe("Member");
  });
});

describe("Formatters - cleanTag", () => {
  it("removes # and uppercases", () => {
    expect(cleanTag("#abc")).toBe("ABC");
    expect(cleanTag("def")).toBe("DEF");
    expect(cleanTag("  #ghi  ")).toBe("GHI");
  });
});
