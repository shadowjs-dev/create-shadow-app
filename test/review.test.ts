import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { walk } from "../src/codemod";
import { buildProject, scaffold } from "../src/index";
import { EXIT_USAGE, run } from "../src/run";
import { harness } from "./support/context";

const temp = (): string => mkdtempSync(join(tmpdir(), "csa-rev-"));

describe("[CSA-REV-1] a project cannot be named like one of its own dependencies", () => {
  it("[CSA-REV-1.1] buildProject refuses vite, typescript and a ShadowJS package, naming the problem", () => {
    for (const name of ["vite", "typescript", "@shadow-js/web"]) {
      expect(() => buildProject({ name }), name).toThrow(/cannot be installed into itself/);
    }
  });

  it("[CSA-REV-1.2] the refusal depends on the dependencies the options add", () => {
    expect(() => buildProject({ name: "vitest" })).not.toThrow();
    expect(() => buildProject({ name: "vitest", vitest: true })).toThrow(/vitest/);
    expect(() => buildProject({ name: "tailwindcss" })).not.toThrow();
    expect(() => buildProject({ name: "tailwindcss", tailwind: true })).toThrow(/tailwindcss/);
  });

  it("[CSA-REV-1.3] a name that is only a property of Object.prototype is an ordinary name", () => {
    expect(() => buildProject({ name: "constructor" })).not.toThrow();
  });

  it("[CSA-REV-1.4] scaffold writes nothing for such a name", () => {
    const dir = join(temp(), "app");
    expect(() => scaffold(dir, { name: "vite" })).toThrow(/vite/);
    expect(() => readdirSync(dir)).toThrow();
  });

  it("[CSA-REV-1.5] the command exits with the usage code and the invalid-name code, and writes nothing", async () => {
    const cwd = temp();
    const h = harness(cwd);
    const code = await run(["vite", "--yes", "--no-install", "--no-git"], h.ctx);
    expect(code).toBe(EXIT_USAGE);
    expect(h.stderr()).toContain("cannot be installed into itself");
    expect(readdirSync(cwd)).toEqual([]);
    const json = harness(cwd);
    const jsonCode = await run(["vite", "--json", "--no-install", "--no-git"], json.ctx);
    expect(jsonCode).toBe(EXIT_USAGE);
    expect(JSON.parse(json.stdout())).toMatchObject({
      ok: false,
      error: { code: "CREATE_SHADOW_APP_INVALID_NAME" },
    });
  });
});

describe("[CSA-REV-2] an add-on a starter cannot take is a wrong command line", () => {
  it("[CSA-REV-2.1] --template content --convex exits 2 and says which add-on", async () => {
    const cwd = temp();
    const h = harness(cwd);
    const code = await run(
      ["site", "--template", "content", "--convex", "--yes", "--no-install", "--no-git"],
      h.ctx,
    );
    expect(code).toBe(EXIT_USAGE);
    expect(h.stderr()).toContain("The content template does not combine with --convex.");
    expect(readdirSync(cwd)).toEqual([]);
  });

  it("[CSA-REV-2.2] --json names an option error, not an unexpected one", async () => {
    const h = harness(temp());
    const code = await run(
      ["api", "--template", "api", "--clerk", "--json", "--no-install", "--no-git"],
      h.ctx,
    );
    expect(code).toBe(EXIT_USAGE);
    const document = JSON.parse(h.stdout());
    expect(document.error.code).toBe("CREATE_SHADOW_APP_INVALID_OPTION");
    expect(document.error.message).toContain("--clerk");
  });
});

describe("[CSA-R2-9] the folder walk of the codemods does not recurse", () => {
  /** A fake tree: `d` inside `d` inside `d`... `depth` times, with one file at the bottom. */
  const nested = (depth: number) => {
    const folder = (name: string) => ({
      name,
      isDirectory: () => true,
      isFile: () => false,
    });
    const file = (name: string) => ({ name, isDirectory: () => false, isFile: () => true });
    return (dir: string) => {
      const levels = dir === "/r" ? 0 : dir.split("/").length - 2;
      return levels >= depth ? [file("deep.ts")] : [folder("d")];
    };
  };

  it("[CSA-R2-9.1] a tree 20000 folders deep is read to its file without overflowing the stack", () => {
    const found = walk("/r", nested(20_000));
    expect(found).toHaveLength(1);
    expect(found[0]?.endsWith("/deep.ts")).toBe(true);
    expect(found[0]?.split("/")).toHaveLength(20_000 + 3);
  });

  it("[CSA-R2-9.2] files and folders come out in name order, a folder's files where it sorts", () => {
    const entry = (name: string, kind: "file" | "dir") => ({
      name,
      isDirectory: () => kind === "dir",
      isFile: () => kind === "file",
    });
    const tree: Record<string, ReturnType<typeof entry>[]> = {
      "/r": [
        entry("z.ts", "file"),
        entry("b", "dir"),
        entry("a.tsx", "file"),
        entry("node_modules", "dir"),
        entry("dist", "dir"),
        entry(".git", "dir"),
        entry("types.d.ts", "file"),
        entry("notes.md", "file"),
        entry("c", "dir"),
      ],
      "/r/b": [entry("y.js", "file"), entry("a", "dir"), entry("x.ts", "file")],
      "/r/b/a": [entry("m.ts", "file")],
      "/r/c": [],
    };
    expect(walk("/r", (dir) => tree[dir] ?? [])).toEqual([
      "/r/a.tsx",
      "/r/b/a/m.ts",
      "/r/b/x.ts",
      "/r/b/y.js",
      "/r/z.ts",
    ]);
  });

  it("[CSA-R2-9.3] a folder with 200000 files is collected without a spread argument list", () => {
    const entries = Array.from({ length: 200_000 }, (_, index) => ({
      name: `f${String(index).padStart(6, "0")}.ts`,
      isDirectory: () => false,
      isFile: () => true,
    }));
    const tree = (dir: string) =>
      dir === "/r" ? [{ name: "sub", isDirectory: () => true, isFile: () => false }] : entries;
    expect(walk("/r", tree)).toHaveLength(200_000);
  });

  it("[CSA-R2-9.4] the real file system gives the same files as before", () => {
    const root = temp();
    mkdirSync(join(root, "src", "nested"), { recursive: true });
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "src", "nested", "a.tsx"), "");
    writeFileSync(join(root, "src", "b.ts"), "");
    writeFileSync(join(root, "src", "c.d.ts"), "");
    writeFileSync(join(root, "node_modules", "pkg", "i.js"), "");
    expect(walk(root).map((path) => path.slice(root.length))).toEqual([
      `${sep}src${sep}b.ts`,
      `${sep}src${sep}nested${sep}a.tsx`,
    ]);
  });
});
