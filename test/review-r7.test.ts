import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeProject } from "../src/writer";

const temp = (): string => mkdtempSync(join(tmpdir(), "csa-r7-"));

describe("writeProject and symbolic links inside the target", () => {
  it("[CSA-R7-1] refuses a symlinked file in the target, writes nothing, and leaves the link's destination alone", () => {
    const outside = temp();
    writeFileSync(join(outside, "elsewhere.json"), "original");
    const dir = temp();
    symlinkSync(join(outside, "elsewhere.json"), join(dir, "package.json"));
    const files = new Map([
      ["README.md", "# app\n"],
      ["package.json", "{}\n"],
    ]);
    expect(() => writeProject(dir, files, { force: true })).toThrow(/symbolic link/);
    expect(readFileSync(join(outside, "elsewhere.json"), "utf8")).toBe("original");
    expect(existsSync(join(dir, "README.md"))).toBe(false);
  });

  it("[CSA-R7-1] refuses a symlinked folder in the target, and a dangling link", () => {
    const outside = temp();
    mkdirSync(join(outside, "dir"));
    const dir = temp();
    symlinkSync(join(outside, "dir"), join(dir, "src"));
    const files = new Map([["src/main.tsx", "export {};\n"]]);
    expect(() => writeProject(dir, files, { force: true })).toThrow(/symbolic link/);
    expect(readdirSync(join(outside, "dir"))).toEqual([]);

    const other = temp();
    symlinkSync(join(outside, "missing.txt"), join(other, "notes.txt"));
    expect(() => writeProject(other, new Map([["notes.txt", "x"]]), { force: true })).toThrow(
      /symbolic link/,
    );
    expect(existsSync(join(outside, "missing.txt"))).toBe(false);
  });

  it("[CSA-R7-1] a target folder that is itself a link, and real files in it, still work", () => {
    const real = temp();
    const holder = temp();
    const link = join(holder, "app");
    symlinkSync(real, link);
    const result = writeProject(link, new Map([["src/main.tsx", "export {};\n"]]), { force: true });
    expect(result.files).toEqual(["src/main.tsx"]);
    expect(readFileSync(join(real, "src", "main.tsx"), "utf8")).toBe("export {};\n");
  });
});
