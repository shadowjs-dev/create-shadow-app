import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CodemodName,
  MAX_CODEMOD_FILE_BYTES,
  runCodemod,
  transformSource,
} from "../src/codemod";

/**
 * Tests of the codemods, by id:
 * - CSA-CODEMOD-01 each codemod matches its golden output and is idempotent.
 * - CSA-CODEMOD-02 paths outside the working directory are refused and nothing is written.
 * - CSA-CODEMOD-03 node_modules, dist and files over 1 MiB are skipped.
 * - CSA-CODEMOD-04 a dry run returns a diff and writes nothing; a write is idempotent.
 * - CSA-CODEMOD-05 unsupported patterns are reported with a line and left alone.
 * - CSA-CODEMOD-06 scope: shadowed names, aliases and shorthand properties.
 * - CSA-CODEMOD-07 react: state kinds, effects, memos and callbacks.
 * - CSA-CODEMOD-08 solid: renames and the packages the names move to.
 * - CSA-CODEMOD-09 next: links and the router.
 * - CSA-CODEMOD-10 imports are merged, aliased and kept in the style of the file.
 * - CSA-CODEMOD-12 react-router: links, hooks, and what is refused.
 * - CSA-CODEMOD-11 preact: the React rules on preact/hooks and preact/compat, and the Preact names that are reported.
 */

const FIXTURES = fileURLToPath(new URL("./fixtures/codemod/", import.meta.url));

/** Reads one golden fixture file as UTF-8 text. */
function fixture(path: string): string {
  return readFileSync(join(FIXTURES, path), "utf8");
}

const GOLDEN = [
  { codemod: "react-to-shadow", name: "todos", filename: "todos.tsx" },
  { codemod: "preact-to-shadow", name: "counter", filename: "counter.tsx" },
  { codemod: "solid-to-shadow", name: "app", filename: "app.tsx" },
  { codemod: "next-router-to-shadow", name: "nav", filename: "nav.tsx" },
  { codemod: "react-router-to-shadow", name: "nav", filename: "nav.tsx" },
] as const;

/** Runs a codemod and returns the new text. */
async function out(codemod: CodemodName, source: string, filename = "a.tsx"): Promise<string> {
  return (await transformSource(codemod, filename, source)).output;
}

/** The lines of a source, joined with a final newline. */
const lines = (...rows: string[]): string => `${rows.join("\n")}\n`;

let root: string;
let app: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "csa-codemod-"));
  app = join(root, "app");
  mkdirSync(app);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("codemod golden fixtures", () => {
  it.each(GOLDEN)(
    "[CSA-CODEMOD-01] $codemod matches its golden output and is idempotent",
    async ({ codemod, name, filename }) => {
      const input = fixture(`${codemod}/${name}.input.txt`);
      const expected = fixture(`${codemod}/${name}.output.txt`);

      const first = await transformSource(codemod, filename, input);
      expect(first.output).toBe(expected);
      expect(first.changed).toBe(true);

      const second = await transformSource(codemod, filename, first.output);
      expect(second.output).toBe(first.output);
      expect(second.changed).toBe(false);
    },
  );
});

describe("codemod file guards", () => {
  const todos = fixture("react-to-shadow/todos.input.txt");

  it("[CSA-CODEMOD-02] refuses targets outside the working directory and writes nothing", async () => {
    const outside = join(root, "outside.tsx");
    writeFileSync(outside, todos);
    writeFileSync(join(app, "inside.tsx"), todos);

    const relative = await runCodemod({
      name: "react-to-shadow",
      targets: ["inside.tsx", "../outside.tsx"],
      cwd: app,
      write: true,
    });
    expect(relative.files.map((f) => [f.file, f.status, f.reason])).toEqual([
      ["inside.tsx", "changed", undefined],
      ["../outside.tsx", "refused", "outside-cwd"],
    ]);
    expect(relative.files[0]?.written).toBe(false);
    expect(readFileSync(join(app, "inside.tsx"), "utf8")).toBe(todos);

    const absolute = await runCodemod({
      name: "react-to-shadow",
      targets: [outside],
      cwd: app,
      write: true,
    });
    expect(absolute.files).toEqual([expect.objectContaining({ status: "refused" })]);
    expect(readFileSync(outside, "utf8")).toBe(todos);

    const missing = await runCodemod({
      name: "react-to-shadow",
      targets: ["nope.tsx"],
      cwd: app,
      write: true,
    });
    expect(missing.files).toEqual([
      expect.objectContaining({ status: "refused", reason: "missing" }),
    ]);
  });

  it("[CSA-CODEMOD-02] refuses a symbolic link that leaves the working directory", async () => {
    const outside = join(root, "outside.tsx");
    writeFileSync(outside, todos);
    try {
      symlinkSync(outside, join(app, "link.tsx"));
    } catch {
      return; // the platform does not allow links for this user
    }
    const run = await runCodemod({
      name: "react-to-shadow",
      targets: ["link.tsx"],
      cwd: app,
      write: true,
    });
    expect(run.files).toEqual([expect.objectContaining({ status: "refused" })]);
    expect(readFileSync(outside, "utf8")).toBe(todos);
  });

  it("[CSA-CODEMOD-03] skips node_modules, dist and files over 1 MiB", async () => {
    expect(MAX_CODEMOD_FILE_BYTES).toBe(1024 * 1024);

    for (const folder of ["node_modules/pkg", "dist"]) {
      mkdirSync(join(app, folder), { recursive: true });
      writeFileSync(join(app, folder, "index.tsx"), todos);
    }
    const big = join(app, "big.tsx");
    writeFileSync(
      big,
      `import { useState } from "react";\n${"// ".padEnd(MAX_CODEMOD_FILE_BYTES + 1, "x")}\n`,
    );
    writeFileSync(join(app, "types.d.ts"), 'import { useState } from "react";\n');
    writeFileSync(join(app, "todos.tsx"), todos);

    const walked = await runCodemod({
      name: "react-to-shadow",
      targets: ["."],
      cwd: app,
      write: true,
    });
    expect(walked.files.map((f) => [f.file, f.status, f.reason])).toEqual([
      ["big.tsx", "skipped", "too-large"],
      ["todos.tsx", "changed", undefined],
    ]);

    const explicit = await runCodemod({
      name: "react-to-shadow",
      targets: ["node_modules/pkg/index.tsx", "dist/index.tsx", "dist"],
      cwd: app,
      write: true,
    });
    expect(explicit.files.map((f) => [f.file, f.status, f.reason])).toEqual([
      ["node_modules/pkg/index.tsx", "skipped", "node_modules"],
      ["dist/index.tsx", "skipped", "dist"],
      ["dist", "skipped", "dist"],
    ]);
    expect(readFileSync(join(app, "node_modules/pkg/index.tsx"), "utf8")).toBe(todos);
    expect(readFileSync(join(app, "dist/index.tsx"), "utf8")).toBe(todos);
    expect(readFileSync(big, "utf8")).toContain('import { useState } from "react";');
  });

  it("[CSA-CODEMOD-03] skips a file that does not parse and says why", async () => {
    writeFileSync(join(app, "broken.tsx"), 'import { useState } from "react";\nconst = ;\n');
    const run = await runCodemod({
      name: "react-to-shadow",
      targets: ["broken.tsx"],
      cwd: app,
      write: true,
    });
    expect(run.files).toEqual([
      expect.objectContaining({
        status: "skipped",
        reason: "parse-error",
        message: expect.any(String),
      }),
    ]);
  });
});

describe("codemod unreadable files", () => {
  it("[CSA-CODEMOD-03] skips a file that is not UTF-8 and one that nests too deeply, without failing", async () => {
    writeFileSync(
      join(app, "latin1.ts"),
      Buffer.concat([
        Buffer.from('import { createSignal } from "solid-js";\n// '),
        Buffer.from([0xe9, 0x0a]),
      ]),
    );
    const terms = Array.from({ length: 30000 }, () => "1").join(" + ");
    writeFileSync(
      join(app, "deep.ts"),
      `import { createSignal } from "solid-js";\nexport const n = ${terms};\n`,
    );
    const run = await runCodemod({
      name: "solid-to-shadow",
      targets: ["latin1.ts", "deep.ts"],
      cwd: app,
      write: true,
    });
    expect(run.files.map((f) => [f.file, f.status, f.reason])).toEqual([
      ["latin1.ts", "skipped", "not-utf8"],
      ["deep.ts", "skipped", "too-deep"],
    ]);
    expect(readFileSync(join(app, "latin1.ts")).includes(0xe9)).toBe(true);
  });
});

describe("codemod run modes", () => {
  it("[CSA-CODEMOD-04] a dry run returns a unified diff and writes nothing; a write is idempotent", async () => {
    const input = fixture("react-to-shadow/todos.input.txt");
    const target = join(app, "todos.tsx");
    writeFileSync(target, input);

    const dry = await runCodemod({
      name: "react-to-shadow",
      targets: ["todos.tsx"],
      cwd: app,
      write: false,
    });
    const preview = dry.files[0];
    expect(preview).toMatchObject({ status: "changed", written: false });
    expect(preview?.diff).toMatch(/^--- a\/todos\.tsx\n\+\+\+ b\/todos\.tsx\n@@ /);
    expect(preview?.diff).toContain(
      '-import { useCallback, useEffect, useMemo, useRef, useState } from "react";',
    );
    expect(preview?.diff).toContain(
      '+import { onMount, useEffect, useMemo, useSignal, useStore } from "@shadow-js/core";',
    );
    expect(readFileSync(target, "utf8")).toBe(input);

    const written = await runCodemod({
      name: "react-to-shadow",
      targets: ["todos.tsx"],
      cwd: app,
      write: true,
    });
    expect(written.files[0]).toMatchObject({ status: "changed", written: true });
    expect(readFileSync(target, "utf8")).toBe(fixture("react-to-shadow/todos.output.txt"));

    const again = await runCodemod({
      name: "react-to-shadow",
      targets: ["todos.tsx"],
      cwd: app,
      write: true,
    });
    expect(again.files[0]).toMatchObject({ status: "unchanged", written: false });
    expect(readFileSync(target, "utf8")).toBe(fixture("react-to-shadow/todos.output.txt"));
  });

  it("[CSA-CODEMOD-04] a folder is walked in a stable order and unrelated files are untouched", async () => {
    mkdirSync(join(app, "src"));
    writeFileSync(join(app, "src", "b.tsx"), fixture("solid-to-shadow/app.input.txt"));
    writeFileSync(join(app, "src", "a.ts"), 'import { createSignal } from "solid-js";\n');
    writeFileSync(join(app, "src", "plain.ts"), "export const answer = 42;\n");
    writeFileSync(join(app, "src", "notes.md"), 'import { createSignal } from "solid-js";\n');

    const run = await runCodemod({
      name: "solid-to-shadow",
      targets: ["src"],
      cwd: app,
      write: false,
    });
    expect(run.files.map((f) => [f.file, f.status])).toEqual([
      ["src/a.ts", "changed"],
      ["src/b.tsx", "changed"],
      ["src/plain.ts", "unchanged"],
    ]);
  });
});

describe("codemod reports", () => {
  it("[CSA-CODEMOD-05] react reports what it leaves and what it did, with the line", async () => {
    const result = await transformSource(
      "react-to-shadow",
      "todos.tsx",
      fixture("react-to-shadow/todos.input.txt"),
    );
    expect(result.reports.map((r) => [r.line, r.level])).toEqual([
      [1, "warning"],
      [4, "note"],
      [6, "note"],
      [7, "note"],
      [10, "note"],
      [14, "note"],
    ]);
    expect(result.reports[0]?.message).toMatch(/`useRef`.*createRef/);
    expect(result.reports[3]?.message).toMatch(/dependency array of useMemo/);
    expect(result.reports[4]?.message).toMatch(/onMount/);
    expect(result.reports[5]?.message).toMatch(/dependency array of useEffect/);
  });

  it("[CSA-CODEMOD-05] unsupported react patterns stay as written and are reported", async () => {
    const source = lines(
      'import React, { useState, useReducer, useCallback, useLayoutEffect } from "react";',
      "export function A() {",
      "  const state = useState(0);",
      "  const [lazy] = useState(() => { return 1; });",
      "  const [none] = useState();",
      "  const [a, b] = useReducer(reduce, 0, init);",
      "  const handler = useCallback(handle, deps);",
      "  React.useMemo(() => 1, []);",
      "  useLayoutEffect(() => {});",
      "  return null;",
      "}",
    );
    const result = await transformSource("react-to-shadow", "a.tsx", source);
    expect(result.output).toBe(source);
    expect(result.changed).toBe(false);
    const found = result.reports.map((r) => `${r.line}:${r.level}`);
    expect(found).toEqual(
      expect.arrayContaining([
        "1:warning",
        "3:warning",
        "4:warning",
        "5:warning",
        "6:warning",
        "7:warning",
        "8:warning",
      ]),
    );
    expect(result.reports.find((r) => r.line === 8)?.message).toMatch(/React\.useMemo/);
    expect(
      result.reports.find((r) => r.line === 1 && /useLayoutEffect/.test(r.message))?.message,
    ).toMatch(/useRenderEffect/);
  });

  it("[CSA-CODEMOD-05] unsupported solid patterns stay as written and are reported", async () => {
    const source = lines(
      'import { createSignal, createEffect, createMemo, on, createStore, createResource } from "solid-js";',
      "export function A() {",
      "  const [a] = createSignal();",
      "  createEffect((prev) => prev, 0);",
      "  const m = createMemo(() => 1, 0);",
      "  return null;",
      "}",
    );
    const result = await transformSource("solid-to-shadow", "a.tsx", source);
    expect(result.output).toBe(source);
    const messages = result.reports.map((r) => `${r.line}: ${r.message}`).join("\n");
    expect(messages).toMatch(/3: `createSignal`: ShadowJS needs an initial value/);
    expect(messages).toMatch(/4: `createEffect`/);
    expect(messages).toMatch(/5: `createMemo`/);
    expect(messages).toMatch(/1: `on` from "solid-js".*useEffect\(deps, fn/);
    expect(messages).toMatch(/1: `createStore`/);
    expect(messages).toMatch(/1: `createResource`.*single|one resource/);
  });

  it("[CSA-CODEMOD-05] unsupported next patterns stay as written and are reported", async () => {
    const source = lines(
      'import Link from "next/link";',
      'import { useRouter, useSearchParams, redirect } from "next/navigation";',
      "export function A() {",
      "  const router = useRouter();",
      '  router.push("/a", { scroll: false });',
      "  const { query } = router;",
      '  return <Link href={{ pathname: "/a" }} replace scroll={false}>a</Link>;',
      "}",
    );
    const result = await transformSource("next-router-to-shadow", "a.tsx", source);
    expect(result.output).toBe(source);
    const lineNumbers = new Set(result.reports.map((r) => r.line));
    for (const line of [2, 5, 6, 7]) expect(lineNumbers.has(line), `line ${line}`).toBe(true);
    const messages = result.reports.map((r) => r.message).join("\n");
    expect(messages).toMatch(/useSearchParams.*useSearch\(\)/);
    expect(messages).toMatch(/redirect.*Navigate/);
  });
});

describe("codemod scope handling", () => {
  it("[CSA-CODEMOD-06] rewrites only the binding that useState declared", async () => {
    const result = await out(
      "react-to-shadow",
      lines(
        'import { useState } from "react";',
        "export function Counter() {",
        "  const [count, setCount] = useState(0);",
        "  const show = (count: number) => count + 1;",
        "  const inner = () => { const count = 2; return count; };",
        "  return <p onClick={() => setCount(count + 1)}>{count}{show(1)}</p>;",
        "}",
      ),
    );
    expect(result).toContain("const show = (count: number) => count + 1;");
    expect(result).toContain("const inner = () => { const count = 2; return count; };");
    expect(result).toContain("{count()}");
    expect(result).toContain("setCount(count() + 1)");
  });

  it("[CSA-CODEMOD-06] keeps an alias and rewrites shorthand properties", async () => {
    const aliased = await out(
      "react-to-shadow",
      lines(
        'import { useState as useLocal } from "react";',
        "export function Pair() {",
        "  const [n, setN] = useLocal(0);",
        "  const snapshot = { n };",
        "  return <p onClick={() => setN(n + 1)}>{n}</p>;",
        "}",
      ),
    );
    expect(aliased).toContain('import { useStore as useLocal } from "@shadow-js/core";');
    expect(aliased).toContain("const [n, setN] = useLocal(0);");
    expect(aliased).toContain("const snapshot = { n: n() };");
    expect(aliased).toContain("setN(n() + 1)");
    expect(aliased).toContain("{n()}");
  });

  it("[CSA-CODEMOD-06] refuses to guess when state is reassigned or re-exported", async () => {
    const source = lines(
      'import { useState } from "react";',
      "export function A() {",
      "  let [n, setN] = useState(0);",
      "  n = 3;",
      "  return <p>{n}</p>;",
      "}",
    );
    const result = await transformSource("react-to-shadow", "a.tsx", source);
    expect(result.output).toBe(source);
    expect(result.reports.some((r) => r.line === 4 && r.level === "warning")).toBe(true);
  });

  it("[CSA-CODEMOD-06] does not rename a solid function that a local declaration shadows", async () => {
    const result = await out(
      "solid-to-shadow",
      lines(
        'import { createSignal } from "solid-js";',
        "export const a = createSignal(1);",
        "export function f(createSignal: (n: number) => number) { return createSignal(2); }",
      ),
      "a.ts",
    );
    expect(result).toContain("export const a = useSignal(1);");
    expect(result).toContain("return createSignal(2);");
  });
});

describe("react-to-shadow", () => {
  it("[CSA-CODEMOD-07] chooses useStore for values and objects and useSignal for the rest", async () => {
    const result = await out(
      "react-to-shadow",
      lines(
        'import { useState } from "react";',
        "export function A({ start, list }: { start: number; list: string[] }) {",
        "  const [a] = useState(0);",
        "  const [b] = useState(-1);",
        "  const [c] = useState<string | null>(null);",
        "  const [d] = useState(`x`);",
        "  const [e] = useState(new Date());",
        "  const [f] = useState([] as string[]);",
        "  const [g] = useState({ n: 1 });",
        "  const [h] = useState(start);",
        "  const [i] = useState(list.slice());",
        "  return null;",
        "}",
      ),
    );
    const kinds = [...result.matchAll(/const \[(\w)\] = (use\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(kinds).toEqual([
      "a:useStore",
      "b:useStore",
      "c:useStore",
      "d:useStore",
      "e:useStore",
      "f:useStore",
      "g:useStore",
      "h:useSignal",
      "i:useSignal",
    ]);
    expect(result).toContain('import { useSignal, useStore } from "@shadow-js/core";');
    expect(result).toContain("const [d] = useStore(`x`);");
  });

  it("[CSA-CODEMOD-07] leaves a store's reads alone and unwraps a lazy initializer", async () => {
    const result = await out(
      "react-to-shadow",
      lines(
        'import { useState } from "react";',
        "export function A() {",
        "  const [store, setStore] = useState({ n: 1 });",
        "  const [lazy] = useState(() => compute());",
        "  const [lazyObject] = useState(() => ({ n: 1 }));",
        "  return <p>{store.n}{lazy}{lazyObject.n}</p>;",
        "}",
      ),
    );
    expect(result).toContain("const [store, setStore] = useStore({ n: 1 });");
    expect(result).toContain("const [lazy] = useSignal(compute());");
    expect(result).toContain("const [lazyObject] = useStore({ n: 1 });");
    expect(result).toContain("{store.n}{lazy()}{lazyObject.n}");
  });

  it("[CSA-CODEMOD-07] turns an empty dependency array into onMount and removes the others", async () => {
    const result = await out(
      "react-to-shadow",
      lines(
        'import { useEffect, useState } from "react";',
        "export function A() {",
        "  const [n, setN] = useState(0);",
        "  useEffect(() => { start(); return stop; }, []);",
        "  useEffect(() => { log(n); }, [n]);",
        "  useEffect(() => { log(n); });",
        "  return null;",
        "}",
      ),
    );
    expect(result).toContain('import { onMount, useEffect, useStore } from "@shadow-js/core";');
    expect(result).toContain("onMount(() => { start(); return stop; });");
    expect(result).toContain("useEffect(() => { log(n()); });\n  useEffect(() => { log(n()); });");
  });

  it("[CSA-CODEMOD-07] drops useCallback and keeps the function", async () => {
    const result = await out(
      "react-to-shadow",
      lines(
        'import { useCallback } from "react";',
        "export function A({ send }: { send: () => void }) {",
        "  const a = useCallback((x: number) => x + 1, []);",
        "  const b = useCallback(send, [send]);",
        "  return <button onClick={useCallback(() => send(), [send])}>{a(1)}{b}</button>;",
        "}",
      ),
    );
    expect(result).toBe(
      lines(
        "export function A({ send }: { send: () => void }) {",
        "  const a = (x: number) => x + 1;",
        "  const b = send;",
        "  return <button onClick={() => send()}>{a(1)}{b}</button>;",
        "}",
      ),
    );
  });

  it("[CSA-CODEMOD-07] makes useReducer's state and useMemo's value accessors", async () => {
    const result = await out(
      "react-to-shadow",
      lines(
        'import { useMemo, useReducer } from "react";',
        "export function A() {",
        "  const [state, dispatch] = useReducer(reduce, { n: 0 });",
        "  const total = useMemo(() => state.n * 2, [state.n]);",
        "  return <p onClick={() => dispatch({ type: 'inc' })}>{state.n}{total}</p>;",
        "}",
      ),
    );
    expect(result).toContain('import { useMemo, useReducer } from "@shadow-js/core";');
    expect(result).toContain("const total = useMemo(() => state().n * 2);");
    expect(result).toContain("{state().n}{total()}");
  });

  it("[CSA-CODEMOD-07] moves the same-shape imports and keeps the type imports", async () => {
    const result = await out(
      "react-to-shadow",
      lines(
        'import { createContext, Fragment, lazy, Suspense, useContext, useEffectEvent, useId, type ReactNode } from "react";',
        "export const Ctx = createContext(1);",
        "export function A({ children }: { children: ReactNode }) {",
        "  const id = useId();",
        "  const value = useContext(Ctx);",
        "  const onTick = useEffectEvent(() => value);",
        "  return <Fragment><Suspense fallback={null}>{children}{id}{onTick}</Suspense></Fragment>;",
        "}",
        "export const Page = lazy(() => import('./page'));",
      ),
    );
    expect(result).toContain('import { type ReactNode } from "react";');
    expect(result).toContain(
      'import { createContext, useContext, useEvent, useId } from "@shadow-js/core";',
    );
    expect(result).toContain('import { Fragment, Suspense, lazy } from "@shadow-js/web";');
    expect(result).toContain("const onTick = useEvent(() => value);");
  });
});

describe("solid-to-shadow", () => {
  it("[CSA-CODEMOD-08] renames the primitives and moves each name to its package", async () => {
    const result = await out(
      "solid-to-shadow",
      lines(
        'import { createContext, createRoot, createSelector, createUniqueId, onCleanup, Show, Suspense } from "solid-js";',
        'import { Dynamic, hydrate, isServer, Portal, renderToString } from "solid-js/web";',
        'import { produce, reconcile } from "solid-js/store";',
        "export const id = createUniqueId();",
        "export const sel = createSelector(() => 1);",
      ),
      "a.ts",
    );
    expect(result).toBe(
      lines(
        'import { createContext, createRoot, isServer, onCleanup, produce, reconcile, useId, useSelector } from "@shadow-js/core";',
        'import { Dynamic, Portal, Show, Suspense, hydrate } from "@shadow-js/web";',
        'import { renderToString } from "@shadow-js/web/server";',
        "export const id = useId();",
        "export const sel = useSelector(() => 1);",
      ),
    );
  });

  it("[CSA-CODEMOD-08] keeps a local alias of a renamed import", async () => {
    const result = await out(
      "solid-to-shadow",
      lines('import { createSignal as signal } from "solid-js";', "export const s = signal(0);"),
      "a.ts",
    );
    expect(result).toBe(
      lines(
        'import { useSignal as signal } from "@shadow-js/core";',
        "export const s = signal(0);",
      ),
    );
  });

  it("[CSA-CODEMOD-08] falls back to an alias when the new name is taken", async () => {
    const result = await out(
      "solid-to-shadow",
      lines(
        'import { createSignal } from "solid-js";',
        "const useSignal = 1;",
        "export const s = [createSignal(0), useSignal];",
      ),
      "a.ts",
    );
    expect(result).toContain('import { useSignal as createSignal } from "@shadow-js/core";');
    expect(result).toContain("createSignal(0)");
  });
});

describe("next-router-to-shadow", () => {
  it("[CSA-CODEMOD-09] renames the router methods as the guide's table says", async () => {
    const result = await out(
      "next-router-to-shadow",
      lines(
        'import { useRouter } from "next/navigation";',
        "export function A() {",
        "  const router = useRouter();",
        '  router.push("/a");',
        "  router.replace(`/b`);",
        "  router.forward();",
        "  router.refresh();",
        '  useRouter().prefetch("/c");',
        "}",
      ),
    );
    expect(result).toBe(
      lines(
        'import { useRouter } from "@shadow-js/router";',
        "export function A() {",
        "  const router = useRouter();",
        '  router.navigate("/a");',
        "  router.navigate(`/b`, { replace: true });",
        "  router.history.forward();",
        "  router.invalidate();",
        '  useRouter().preload("/c");',
        "}",
      ),
    );
  });

  it("[CSA-CODEMOD-09] renames a default import under any name and an existing A forces an alias", async () => {
    const renamed = await out(
      "next-router-to-shadow",
      lines(
        'import NextLink from "next/link";',
        "export const a = <NextLink href='/'>x</NextLink>;",
      ),
    );
    expect(renamed).toBe(
      lines('import { A } from "@shadow-js/router";', "export const a = <A href='/'>x</A>;"),
    );

    const taken = await out(
      "next-router-to-shadow",
      lines(
        'import Link from "next/link";',
        "const A = 1;",
        "export const a = [A, <Link href='/'>x</Link>];",
      ),
    );
    expect(taken).toContain('import { A as Link } from "@shadow-js/router";');
    expect(taken).toContain("<Link href='/'>x</Link>");
  });
});

describe("codemod imports", () => {
  it("[CSA-CODEMOD-10] merges into an existing import of the package and does not repeat a name", async () => {
    const result = await out(
      "solid-to-shadow",
      lines(
        'import { useMemo } from "@shadow-js/core";',
        'import { createMemo, createSignal } from "solid-js";',
        "export const a = [createMemo(() => 1), createSignal(0), useMemo(() => 2)];",
      ),
      "a.ts",
    );
    expect(result).toBe(
      lines(
        'import { useMemo, useSignal } from "@shadow-js/core";',
        "export const a = [useMemo(() => 1), useSignal(0), useMemo(() => 2)];",
      ),
    );
  });

  it("[CSA-CODEMOD-10] keeps a default import and the quote and semicolon style of the file", async () => {
    const result = await out(
      "react-to-shadow",
      "import React, { useId } from 'react'\nexport const a = React.createElement('p', null, useId())\n",
    );
    expect(result).toBe(
      "import { useId } from '@shadow-js/core'\nimport React from 'react'\nexport const a = React.createElement('p', null, useId())\n",
    );
  });

  it("[CSA-CODEMOD-10] keeps CRLF line endings and a byte order mark", async () => {
    const source =
      '﻿import { createSignal } from "solid-js";\r\nexport const a = createSignal(0);\r\n';
    const result = await out("solid-to-shadow", source, "a.ts");
    expect(result).toBe(
      '﻿import { useSignal } from "@shadow-js/core";\r\nexport const a = useSignal(0);\r\n',
    );

    const split = await out(
      "solid-to-shadow",
      'import { createSignal, tick } from "solid-js";\r\nexport const a = [createSignal(0), tick];\r\n',
      "a.ts",
    );
    expect(split).toBe(
      'import { useSignal } from "@shadow-js/core";\r\nimport { tick } from "solid-js";\r\nexport const a = [useSignal(0), tick];\r\n',
    );
  });

  it("[CSA-CODEMOD-10] keeps a multi-line import list formatted as written", async () => {
    const result = await out(
      "solid-to-shadow",
      lines(
        "import {",
        "  createSignal,",
        "  tick,",
        "  untrack,",
        '} from "solid-js";',
        "export const a = [createSignal(0), tick, untrack];",
      ),
      "a.ts",
    );
    expect(result).toBe(
      lines(
        'import { untrack, useSignal } from "@shadow-js/core";',
        "import {",
        "  tick,",
        '} from "solid-js";',
        "export const a = [useSignal(0), tick, untrack];",
      ),
    );
  });

  it("[CSA-CODEMOD-10] leaves a file without the migrated imports byte for byte", async () => {
    for (const codemod of [
      "react-to-shadow",
      "solid-to-shadow",
      "next-router-to-shadow",
    ] as const) {
      const source = lines(
        'import { useState } from "preact/hooks";',
        "export const x = useState;",
      );
      const result = await transformSource(codemod, "a.ts", source);
      expect(result).toEqual({ output: source, changed: false, reports: [] });
    }
  });
});

describe("preact-to-shadow", () => {
  it("[CSA-CODEMOD-11] migrates hooks from preact/hooks and preact/compat like React's, and the context helpers of preact", async () => {
    const output = await out(
      "preact-to-shadow",
      lines(
        'import { createContext, Fragment } from "preact";',
        'import { useState } from "preact/hooks";',
        'import { useMemo, Suspense } from "preact/compat";',
        "const Theme = createContext(1);",
        "export function A() {",
        "  const [n, setN] = useState(0);",
        "  const double = useMemo(() => n * 2, [n]);",
        "  return <Suspense><Fragment>{double}</Fragment></Suspense>;",
        "}",
      ),
    );
    expect(output).toContain('from "@shadow-js/core"');
    expect(output).toContain('import { Fragment, Suspense } from "@shadow-js/web"');
    expect(output).toContain("const [n, setN] = useStore(0)");
    expect(output).toContain("const double = useMemo(() => n() * 2)");
    expect(output).not.toContain("preact");
  });

  it("[CSA-CODEMOD-11] reports render, Component and the signals package, and keeps their imports", async () => {
    const result = await transformSource(
      "preact-to-shadow",
      "a.tsx",
      lines(
        'import { Component, h, render } from "preact";',
        'import { computed, signal } from "@preact/signals";',
        "export const total = signal(1);",
        "export const double = computed(() => total.value * 2);",
        "render(h('p', null), document.body);",
      ),
    );
    expect(result.changed).toBe(false);
    const messages = result.reports.map((report) => report.message);
    for (const name of ["Component", "h", "render", "computed", "signal"]) {
      expect(messages.some((message) => message.startsWith(`\`${name}\` from`))).toBe(true);
    }
    expect(messages.every((message) => message.includes("/guides/migrate/preact/"))).toBe(true);
  });
});

describe("react-router-to-shadow", () => {
  const imports = 'import { Link, NavLink, useNavigate } from "react-router-dom";';

  it("[CSA-CODEMOD-12] refuses what A cannot do and keeps those imports", async () => {
    const cases: Array<[string, string]> = [
      ["<Link to={{ pathname: '/a' }}>x</Link>", "An object `to`"],
      ["<Link to='/a' reloadDocument>x</Link>", "`reloadDocument` has no equivalent"],
      [
        "<NavLink to='/a' className={({ isActive }) => (isActive ? 'on' : '')}>x</NavLink>",
        "as a function of `{ isActive }`",
      ],
      ["<Link to='/a' {...rest}>x</Link>", "A spread of props"],
      ["<Link to='/a' prefetch={mode}>x</Link>", "`prefetch` is not one of the literals"],
    ];
    for (const [jsx, message] of cases) {
      const result = await transformSource(
        "react-router-to-shadow",
        "a.tsx",
        lines(imports, `export const view = (rest, mode) => ${jsx};`),
      );
      expect(result.output, jsx).toContain("react-router-dom");
      expect(result.reports.map((report) => report.message).join("\n"), jsx).toContain(message);
    }
  });

  it("[CSA-CODEMOD-12] refuses navigate with a number, and a navigate function that is passed around", async () => {
    const back = await transformSource(
      "react-router-to-shadow",
      "a.tsx",
      lines(
        imports,
        "export function Back() {",
        "  const navigate = useNavigate();",
        "  return <button onClick={() => navigate(-1)}>Back</button>;",
        "}",
      ),
    );
    expect(back.output).toContain("react-router-dom");
    expect(back.reports.map((report) => report.message).join("\n")).toContain("history.back()");
    const passed = await transformSource(
      "react-router-to-shadow",
      "a.tsx",
      lines(
        imports,
        "export function Go() {",
        "  const navigate = useNavigate();",
        "  return <Child go={navigate} />;",
        "}",
      ),
    );
    expect(passed.output).toContain("react-router-dom");
  });

  it("[CSA-CODEMOD-12] reports the route table and keeps the other React Router names", async () => {
    const result = await transformSource(
      "react-router-to-shadow",
      "a.tsx",
      lines(
        'import { BrowserRouter, Routes, Route, useSearchParams } from "react-router-dom";',
        "export const app = <BrowserRouter><Routes><Route path='/' element={null} /></Routes></BrowserRouter>;",
      ),
    );
    expect(result.changed).toBe(false);
    const messages = result.reports.map((report) => report.message);
    for (const name of ["BrowserRouter", "Routes", "Route", "useSearchParams"]) {
      expect(messages.some((message) => message.startsWith(`\`${name}\` from`))).toBe(true);
    }
  });

  it("[CSA-CODEMOD-12] reads the same names from react-router and the Remix package", async () => {
    for (const source of ["react-router", "@remix-run/react"]) {
      const output = await out(
        "react-router-to-shadow",
        lines(`import { Link } from "${source}";`, "export const a = <Link to='/x'>x</Link>;"),
      );
      expect(output).toContain('import { A } from "@shadow-js/router"');
      expect(output).toContain("<A to='/x'>x</A>");
    }
  });
});
