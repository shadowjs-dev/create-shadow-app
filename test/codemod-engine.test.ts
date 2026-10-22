import { describe, expect, it } from "vitest";
import {
  applyEdits,
  EditConflict,
  Module,
  type Node,
  ParseFailure,
  parseProgram,
} from "../src/codemods/ast";
import { unifiedDiff } from "../src/codemods/diff";

/**
 * Tests of the codemod engine, by id:
 * - CSA-CODEMOD-ENG-01 the diff prints hunks with context and the no-newline marker.
 * - CSA-CODEMOD-ENG-02 edits apply by range and conflicts are an error.
 * - CSA-CODEMOD-ENG-03 references resolve to the declaration that is in scope.
 * - CSA-CODEMOD-ENG-04 the parser rejects invalid files and reads each language.
 */

async function moduleOf(source: string, filename = "a.tsx"): Promise<Module> {
  return new Module(await parseProgram(filename, source), source);
}

/** The first declaration identifier named `name`, found by a walk of the program. */
function declarationOf(module: Module, name: string, nth = 0): Node {
  const found: Node[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const candidate = node as Node;
    if (module.references().some((r) => r.declaration === candidate && r.name === name)) {
      if (!found.includes(candidate)) found.push(candidate);
    }
    for (const value of Object.values(candidate)) visit(value);
  };
  visit(module.program);
  const declaration = found[nth];
  if (declaration === undefined) throw new Error(`no declaration of ${name} is used`);
  return declaration;
}

describe("unifiedDiff", () => {
  it("[CSA-CODEMOD-ENG-01] prints nothing for equal texts and one hunk with context for one change", () => {
    expect(unifiedDiff("a.ts", "same\n", "same\n")).toBe("");
    const before = lines(1, 12);
    const after = before.replace("line 6\n", "six\n");
    expect(unifiedDiff("a.ts", before, after)).toBe(
      [
        "--- a/a.ts",
        "+++ b/a.ts",
        "@@ -3,7 +3,7 @@",
        " line 3",
        " line 4",
        " line 5",
        "-line 6",
        "+six",
        " line 7",
        " line 8",
        " line 9",
        "",
      ].join("\n"),
    );
  });

  it("[CSA-CODEMOD-ENG-01] splits distant changes into hunks and joins near ones", () => {
    const before = lines(1, 30);
    const far = before.replace("line 2\n", "two\n").replace("line 28\n", "twenty-eight\n");
    const farDiff = unifiedDiff("a.ts", before, far);
    expect(farDiff.match(/^@@/gm)).toHaveLength(2);
    expect(farDiff).toContain("@@ -1,5 +1,5 @@");
    expect(farDiff).toContain("@@ -25,6 +25,6 @@");

    const near = before.replace("line 10\n", "ten\n").replace("line 14\n", "fourteen\n");
    expect(unifiedDiff("a.ts", before, near).match(/^@@/gm)).toHaveLength(1);
  });

  it("[CSA-CODEMOD-ENG-01] handles insertions, deletions and a missing final newline", () => {
    expect(unifiedDiff("a.ts", "a\nb\n", "a\nx\nb\n")).toBe(
      "--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,3 @@\n a\n+x\n b\n",
    );
    expect(unifiedDiff("a.ts", "a\nb\nc\n", "a\nc\n")).toBe(
      "--- a/a.ts\n+++ b/a.ts\n@@ -1,3 +1,2 @@\n a\n-b\n c\n",
    );
    expect(unifiedDiff("a.ts", "a\nb", "a\nb\n")).toBe(
      "--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n",
    );
    expect(unifiedDiff("a.ts", "", "a\n")).toBe("--- a/a.ts\n+++ b/a.ts\n@@ -0,0 +1 @@\n+a\n");
  });
});

/** `line <from>` .. `line <to>`, one per line. */
function lines(from: number, to: number): string {
  let out = "";
  for (let n = from; n <= to; n++) out += `line ${n}\n`;
  return out;
}

describe("applyEdits", () => {
  it("[CSA-CODEMOD-ENG-02] applies edits by range in any order, with insertions before replacements", () => {
    const source = "abcdef";
    expect(
      applyEdits(source, [
        { start: 4, end: 6, text: "X" },
        { start: 0, end: 0, text: ">" },
        { start: 1, end: 3, text: "" },
        { start: 3, end: 3, text: "|" },
        { start: 3, end: 3, text: "!" },
      ]),
    ).toBe(">a|!dX");
    expect(applyEdits(source, [])).toBe(source);
  });

  it("[CSA-CODEMOD-ENG-02] collapses identical edits and refuses overlapping ones", () => {
    expect(
      applyEdits("abc", [
        { start: 1, end: 2, text: "X" },
        { start: 1, end: 2, text: "X" },
      ]),
    ).toBe("aXc");
    expect(() =>
      applyEdits("abcdef", [
        { start: 1, end: 4, text: "X" },
        { start: 3, end: 5, text: "Y" },
      ]),
    ).toThrow(EditConflict);
    expect(() =>
      applyEdits("abcdef", [
        { start: 1, end: 4, text: "X" },
        { start: 2, end: 2, text: "Y" },
      ]),
    ).toThrow(EditConflict);
  });
});

describe("Module", () => {
  it("[CSA-CODEMOD-ENG-03] resolves a use to the nearest declaration of its name", async () => {
    const module = await moduleOf(
      [
        "import { a } from 'x';",
        "const b = a;",
        "function f(a) { return a; }",
        "function g() { { let a = 1; a; } return a; }",
        "try {} catch (a) { a; }",
        "for (const a of []) { a; }",
        "var h = () => { var a = 1; return a; };",
      ].join("\n"),
      "a.ts",
    );
    const imported = declarationOf(module, "a", 0);
    const uses = module.references().filter((r) => r.name === "a");
    const resolved = uses.map((use) => (use.declaration === imported ? "import" : "local"));
    // b = a (import); f's `a` (param); g: block `a`, then `return a` (import); catch; for; arrow `a`.
    expect(resolved).toEqual(["import", "local", "local", "import", "local", "local", "local"]);
    expect(module.referencesTo(imported)).toHaveLength(2);
  });

  it("[CSA-CODEMOD-ENG-03] does not count property names, labels, import names or types as uses", async () => {
    const module = await moduleOf(
      [
        "const o = { a: 1, b() {} };",
        "o.a; o.b();",
        "type T = { a: number };",
        "interface I { a: string }",
        "const c: typeof o = o;",
        "label: for (;;) { break label; }",
        "class K { a = 1; m() { return this.a; } }",
      ].join("\n"),
    );
    const names = module.references().map((r) => r.name);
    expect(names).not.toContain("a");
    expect(names).not.toContain("b");
    expect(names).not.toContain("label");
    expect(names).not.toContain("T");
    expect(names.filter((n) => n === "o")).toHaveLength(3);
  });

  it("[CSA-CODEMOD-ENG-03] classifies reads, writes, shorthand properties, JSX names and exports", async () => {
    const module = await moduleOf(
      [
        "let n = 0, Tag = 'p';",
        "n = 1; n++; [n] = [2]; ({ n } = { n: 3 });",
        "const o = { n };",
        "const read = n + 1;",
        "export const el = <Tag a={n}><Tag.x /></Tag>;",
        "export { n };",
      ].join("\n"),
    );
    const kinds = module
      .references()
      .filter((r) => r.name === "n")
      .map((r) => r.kind);
    expect(kinds).toEqual([
      "write",
      "write",
      "write",
      "write",
      "shorthand",
      "read",
      "read",
      "export",
    ]);
    const tags = module
      .references()
      .filter((r) => r.name === "Tag")
      .map((r) => r.kind);
    expect(tags).toEqual(["jsx", "jsx", "jsx"]);
  });

  it("[CSA-CODEMOD-ENG-03] reports lines and leaves globals unresolved", async () => {
    const module = await moduleOf("a;\nb;\r\nc;\n");
    expect(module.lineOf(0)).toBe(1);
    expect(module.lineOf(3)).toBe(2);
    expect(module.lineOf(7)).toBe(3);
    expect(module.references().map((r) => r.declaration)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(module.declaredNames.size).toBe(0);
  });
});

describe("parseProgram", () => {
  it("[CSA-CODEMOD-ENG-04] reads TypeScript, TSX, JSX and plain scripts, and rejects invalid text", async () => {
    await expect(parseProgram("a.ts", "const x: number = <number>1;")).resolves.toMatchObject({
      type: "Program",
    });
    await expect(parseProgram("a.tsx", "const x = <div />;")).resolves.toMatchObject({
      type: "Program",
    });
    await expect(parseProgram("a.js", "const x = <div />;")).resolves.toMatchObject({
      type: "Program",
    });
    await expect(parseProgram("a.mjs", "export default 1;")).resolves.toMatchObject({
      type: "Program",
    });
    await expect(parseProgram("a.ts", "const = ;")).rejects.toBeInstanceOf(ParseFailure);
  });
});
