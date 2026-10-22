import { describe, expect, it } from "vitest";
import type { ScaffoldOptions } from "../src/options";
import { projectFiles } from "../src/project";
import { label } from "./support/combos";

/** The options of a Dusk project, with every add-on off. */
function duskOptions(extra: Partial<ScaffoldOptions> = {}): ScaffoldOptions {
  return { name: "app", template: "dusk", ...extra };
}

describe("the public env file in the scaffold", () => {
  it("[ENV-19] a Dusk project ships .env.public with names and no secret-looking value", () => {
    const files = projectFiles(duskOptions());
    const publicFile = files.get(".env.public");
    expect(publicFile, "the .env.public example").toBeDefined();
    const assignments = (publicFile ?? "")
      .split("\n")
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(assignments.length).toBeGreaterThan(0);
    for (const line of assignments) {
      expect(line, "each line is NAME=value").toMatch(/^[A-Za-z_][A-Za-z0-9_]*=[^\s"'`]*$/);
      const value = line.slice(line.indexOf("=") + 1);
      expect(value, "no key, token or credential in a public file").not.toMatch(
        /sk_(live|test)_|BEGIN [A-Z ]*PRIVATE KEY|:\/\/[^\s/:@]+:[^\s/@]+@|\beyJ[A-Za-z0-9_-]{8,}\./,
      );
    }
  });

  it("[ENV-20] the scaffold ignores the local env files and never ignores .env.public", () => {
    const files = projectFiles(duskOptions());
    const ignored = (files.get(".gitignore") ?? "").split("\n").map((line) => line.trim());
    expect(ignored).toContain(".env.local");
    expect(ignored).toContain(".env.*.local");
    expect(ignored).not.toContain(".env.public");
    expect(ignored).not.toContain(".env*");
  });

  it("[ENV-21] .env.example says that browser-visible values belong in .env.public", () => {
    const example = projectFiles(duskOptions()).get(".env.example") ?? "";
    expect(example).toContain(".env.public");
    expect(example).toContain("APP_URL=http://localhost:3000");
  });

  it("[ENV-22] the Dusk template is the only one that ships .env.public (a Vite SPA does not read it)", () => {
    for (const template of ["spa"] as const) {
      const files = projectFiles(duskOptions({ template }));
      expect(files.has(".env.public"), label(duskOptions({ template }))).toBe(false);
    }
  });
});
