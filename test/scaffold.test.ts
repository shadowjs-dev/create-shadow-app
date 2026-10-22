import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isValidPackageName, projectFiles, scaffold, toPackageName } from "../src/index";

const temp = (): string => mkdtempSync(join(tmpdir(), "csa-"));
const read = (dir: string, file: string): string => readFileSync(join(dir, file), "utf8");

describe("package names", () => {
  it("[CSA-01] accepts valid npm names and rejects invalid ones", () => {
    for (const ok of ["app", "my-app", "@scope/app", "a.b_c", "a1"])
      expect(isValidPackageName(ok)).toBe(true);
    for (const bad of [
      "",
      "My App",
      "UPPER",
      "_x",
      ".x",
      "a b",
      "a/b",
      "@scope",
      "x".repeat(215),
      "../x",
    ]) {
      expect(isValidPackageName(bad)).toBe(false);
    }
  });
  it("[CSA-02] derives a valid name from a directory", () => {
    expect(toPackageName("/tmp/My Cool_App")).toBe("my-cool_app");
    expect(toPackageName("./Foo!!Bar")).toBe("foo-bar");
    expect(toPackageName("/tmp/___")).toBeUndefined();
  });
});

describe("scaffold", () => {
  it("[CSA-03] writes the full project with valid JSON and framework wiring", () => {
    const dir = join(temp(), "app");
    const result = scaffold(dir, { name: "app", tailwind: false, biome: true });
    expect(result.files).toContain("src/App.tsx");
    const pkg = JSON.parse(read(dir, "package.json"));
    expect(pkg.name).toBe("app");
    expect(pkg.dependencies["@shadow-js/web"]).toBe("^1.0.0");
    expect(pkg.devDependencies["@biomejs/biome"]).toBeDefined();
    expect(pkg.devDependencies.tailwindcss).toBeUndefined();
    expect(JSON.parse(read(dir, "tsconfig.json")).compilerOptions.jsxImportSource).toBe(
      "@shadow-js/web",
    );
    expect(read(dir, "vite.config.ts")).toContain("shadow()");
    expect(read(dir, "index.html")).toContain("<title>app</title>");
  });

  it("[CSA-04] tailwind option adds the plugin, stylesheet import and classes", () => {
    const dir = join(temp(), "tw");
    scaffold(dir, { name: "tw", tailwind: true, biome: false });
    const pkg = JSON.parse(read(dir, "package.json"));
    expect(pkg.devDependencies["@tailwindcss/vite"]).toBeDefined();
    expect(read(dir, "vite.config.ts")).toContain("tailwindcss()");
    expect(read(dir, "src/index.css")).toContain('@import "tailwindcss"');
    expect(pkg.devDependencies["@biomejs/biome"]).toBeUndefined();
    expect(() => read(dir, "biome.json")).toThrow();
  });

  it("[CSA-05] refuses a non-empty directory and leaves it untouched", () => {
    const dir = temp();
    writeFileSync(join(dir, "keep.txt"), "x");
    expect(() => scaffold(dir, { name: "app", tailwind: false, biome: false })).toThrow(
      /not empty/,
    );
    expect(read(dir, "keep.txt")).toBe("x");
  });

  it("[CSA-06] accepts an existing empty directory", () => {
    const dir = temp();
    mkdirSync(join(dir, "sub"));
    expect(
      scaffold(join(dir, "sub"), { name: "app", tailwind: false, biome: false }).files.length,
    ).toBeGreaterThan(5);
  });

  it("[CSA-07] rejects an invalid package name before writing anything", () => {
    const dir = join(temp(), "x");
    expect(() => scaffold(dir, { name: "Bad Name", tailwind: false, biome: false })).toThrow(
      /valid npm package name/,
    );
    expect(() => read(dir, "package.json")).toThrow();
  });

  it("[CSA-08] every generated file is deterministic and project-relative", () => {
    const options = { name: "app", tailwind: true, biome: true };
    const a = projectFiles(options);
    const b = projectFiles(options);
    expect([...a]).toEqual([...b]);
    for (const path of a.keys()) {
      expect(path.startsWith("/")).toBe(false);
      expect(path.includes("..")).toBe(false);
    }
  });

  it("[CSA-09] generated sources use only the documented ShadowJS API", () => {
    const files = projectFiles({ name: "app", tailwind: false, biome: false });
    const app = files.get("src/App.tsx") as string;
    expect(app).toContain('from "@shadow-js/core"');
    expect(app).toContain('from "@shadow-js/web"');
    expect(app).not.toMatch(/from "react|solid-js/);
  });
});
