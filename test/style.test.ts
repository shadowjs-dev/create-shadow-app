import { describe, expect, it } from "vitest";
import { createStyle, supportsColor } from "../src/style";

describe("colors", () => {
  it("[CSA-70] NO_COLOR wins, FORCE_COLOR forces, a dumb or non-terminal output is plain", () => {
    expect(supportsColor({}, true)).toBe(true);
    expect(supportsColor({}, false)).toBe(false);
    expect(supportsColor({ NO_COLOR: "1" }, true)).toBe(false);
    expect(supportsColor({ NO_COLOR: "1", FORCE_COLOR: "1" }, true)).toBe(false);
    expect(supportsColor({ NO_COLOR: "" }, true)).toBe(true);
    expect(supportsColor({ FORCE_COLOR: "1" }, false)).toBe(true);
    expect(supportsColor({ FORCE_COLOR: "0" }, true)).toBe(false);
    expect(supportsColor({ TERM: "dumb" }, true)).toBe(false);
  });

  it("[CSA-71] style functions wrap in ANSI codes only when enabled", () => {
    expect(createStyle(false).green("ok")).toBe("ok");
    expect(createStyle(false).bold("x")).toBe("x");
    expect(createStyle(true).green("ok")).toBe("\u001b[32mok\u001b[39m");
    expect(createStyle(true).enabled).toBe(true);
  });
});
