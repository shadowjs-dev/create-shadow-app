import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CODEMOD_NAMES } from "../src/codemod";
import { ERROR_CODES, type JsonDocument } from "../src/json";
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, run } from "../src/run";
import { harness } from "./support/context";

/**
 * `create-shadow-app codemod <name> [paths...]` through `run()`, by id:
 * - CSA-CODEMOD-CLI-01 a dry run prints the diff on stdout, the reports on stderr, and writes nothing.
 * - CSA-CODEMOD-CLI-02 `--write` changes the files and a second run changes nothing.
 * - CSA-CODEMOD-CLI-03 a path outside the working directory fails with exit code 1 and no write.
 * - CSA-CODEMOD-CLI-04 a wrong command line is a usage error (exit code 2).
 * - CSA-CODEMOD-CLI-05 `--json` prints one document with the files, the diffs and the warnings.
 * - CSA-CODEMOD-CLI-06 help, the completion scripts and the codes in the document agree.
 */

const FIXTURES = fileURLToPath(new URL("./fixtures/codemod/", import.meta.url));
const fixture = (path: string): string => readFileSync(join(FIXTURES, path), "utf8");

let root: string;
let app: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "csa-codemod-cli-"));
  app = join(root, "app");
  mkdirSync(app);
  writeFileSync(join(app, "todos.tsx"), fixture("react-to-shadow/todos.input.txt"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function exec(...argv: string[]): Promise<{
  code: number;
  out: string;
  err: string;
}> {
  const h = harness(app);
  const code = await run(argv, h.ctx);
  return { code, out: h.stdout(), err: h.stderr() };
}

describe("create-shadow-app codemod", () => {
  it("[CSA-CODEMOD-CLI-01] a dry run prints the diff, reports on stderr, and writes nothing", async () => {
    const { code, out, err } = await exec("codemod", "react-to-shadow", "todos.tsx");
    expect(code).toBe(EXIT_OK);
    expect(out).toContain("--- a/todos.tsx\n+++ b/todos.tsx\n@@ ");
    expect(out).toContain("-  const [items, setItems] = useState(initial);");
    expect(out).toContain("+  const [items, setItems] = useSignal(initial);");
    expect(out).toContain("1 file would change. Run again with --write to apply.");
    expect(err).toContain(
      'warning todos.tsx:1: `useRef` from "react" is not migrated automatically.',
    );
    expect(err).toContain("note todos.tsx:10: `useEffect(fn, [])` became `onMount(fn)`");
    expect(readFileSync(join(app, "todos.tsx"), "utf8")).toBe(
      fixture("react-to-shadow/todos.input.txt"),
    );

    const explicit = await exec("codemod", "react-to-shadow", "todos.tsx", "--dry-run");
    expect(explicit.out).toBe(out);
  });

  it("[CSA-CODEMOD-CLI-02] --write changes the files, and a second run has nothing to do", async () => {
    const first = await exec("codemod", "react-to-shadow", "--write");
    expect(first.code).toBe(EXIT_OK);
    expect(first.out).toContain("updated todos.tsx");
    expect(first.out).toContain("Changed 1 file.");
    expect(readFileSync(join(app, "todos.tsx"), "utf8")).toBe(
      fixture("react-to-shadow/todos.output.txt"),
    );

    const second = await exec("codemod", "react-to-shadow", "--write");
    expect(second.code).toBe(EXIT_OK);
    expect(second.out).toContain("Nothing to change.");
    expect(readFileSync(join(app, "todos.tsx"), "utf8")).toBe(
      fixture("react-to-shadow/todos.output.txt"),
    );
  });

  it("[CSA-CODEMOD-CLI-03] a path outside the working directory fails and nothing is written", async () => {
    writeFileSync(join(root, "outside.tsx"), fixture("react-to-shadow/todos.input.txt"));
    const { code, err } = await exec(
      "codemod",
      "react-to-shadow",
      "todos.tsx",
      "../outside.tsx",
      "--write",
    );
    expect(code).toBe(EXIT_FAILURE);
    expect(err).toContain("Nothing was changed: ../outside.tsx is outside the current directory");
    expect(readFileSync(join(app, "todos.tsx"), "utf8")).toBe(
      fixture("react-to-shadow/todos.input.txt"),
    );
    expect(readFileSync(join(root, "outside.tsx"), "utf8")).toBe(
      fixture("react-to-shadow/todos.input.txt"),
    );

    const missing = await exec("codemod", "react-to-shadow", "gone.tsx");
    expect(missing.code).toBe(EXIT_FAILURE);
    expect(missing.err).toContain("gone.tsx does not exist");
  });

  it("[CSA-CODEMOD-CLI-04] a wrong command line is a usage error", async () => {
    for (const argv of [
      ["codemod"],
      ["codemod", "vue-to-shadow"],
      ["codemod", "react-to-shadow", "--bogus"],
      ["codemod", "react-to-shadow", "--write", "--dry-run"],
    ]) {
      const { code, err } = await exec(...argv);
      expect(code, argv.join(" ")).toBe(EXIT_USAGE);
      expect(err).toContain("error");
    }
    const missing = await exec("codemod");
    expect(missing.err).toContain(
      "Missing codemod name: expected react-to-shadow, preact-to-shadow, solid-to-shadow, next-router-to-shadow or react-router-to-shadow.",
    );
    expect(readFileSync(join(app, "todos.tsx"), "utf8")).toBe(
      fixture("react-to-shadow/todos.input.txt"),
    );
  });

  it("[CSA-CODEMOD-CLI-04] `--` ends the options, so a file may start with a dash", async () => {
    writeFileSync(join(app, "-odd.tsx"), 'import { createSignal } from "solid-js";\n');
    const { code, out } = await exec("codemod", "solid-to-shadow", "--", "-odd.tsx");
    expect(code).toBe(EXIT_OK);
    expect(out).toContain('+import { useSignal } from "@shadow-js/core";');
  });

  it("[CSA-CODEMOD-CLI-05] --json prints one document with the files, the diffs and the warnings", async () => {
    const { code, out, err } = await exec("codemod", "react-to-shadow", "todos.tsx", "--json");
    expect(code).toBe(EXIT_OK);
    expect(err).toContain("note todos.tsx:10");
    const doc = JSON.parse(out) as JsonDocument & {
      data: {
        codemod: string;
        mode: string;
        files: Array<{ file: string; status: string; written: boolean; diff: string }>;
        summary: Record<string, number>;
      };
    };
    expect(doc).toMatchObject({
      schema: 1,
      command: "create-shadow-app codemod",
      ok: true,
      data: {
        codemod: "react-to-shadow",
        mode: "dry-run",
        summary: { changed: 1, unchanged: 0, skipped: 0, refused: 0, written: 0 },
      },
    });
    expect(doc.data.files).toEqual([
      expect.objectContaining({ file: "todos.tsx", status: "changed", written: false }),
    ]);
    expect(doc.data.files[0]?.diff).toContain("+import { onMount, useEffect");
    const codes = new Set(doc.warnings.map((w) => w.code));
    expect(codes).toEqual(
      new Set(["CREATE_SHADOW_APP_CODEMOD_UNSUPPORTED", "CREATE_SHADOW_APP_CODEMOD_NOTE"]),
    );
    expect(doc.warnings[0]?.message).toMatch(/^todos\.tsx:1: /);
    for (const warning of doc.warnings) expect(ERROR_CODES).toContain(warning.code);
  });

  it("[CSA-CODEMOD-CLI-05] --json also describes a refusal and a usage error as documents", async () => {
    const refused = await exec("codemod", "react-to-shadow", "../x.tsx", "--json");
    expect(refused.code).toBe(EXIT_FAILURE);
    const failure = JSON.parse(refused.out) as JsonDocument;
    expect(failure).toMatchObject({
      ok: false,
      command: "create-shadow-app codemod",
      error: { code: "CREATE_SHADOW_APP_CODEMOD_REFUSED" },
      data: { summary: { refused: 1, written: 0 } },
    });

    const usage = await exec("--json", "codemod", "nope");
    expect(usage.code).toBe(EXIT_USAGE);
    expect(JSON.parse(usage.out)).toMatchObject({
      ok: false,
      command: "create-shadow-app codemod",
      error: { code: "CREATE_SHADOW_APP_UNKNOWN_CODEMOD" },
    });
  });

  it("[CSA-CODEMOD-CLI-05] a skipped file is a warning, not a failure", async () => {
    writeFileSync(join(app, "broken.tsx"), 'import { createSignal } from "solid-js";\nconst = ;\n');
    const { code, out } = await exec("codemod", "solid-to-shadow", "broken.tsx", "--json");
    expect(code).toBe(EXIT_OK);
    const doc = JSON.parse(out) as JsonDocument;
    expect(doc.warnings).toEqual([
      expect.objectContaining({ code: "CREATE_SHADOW_APP_CODEMOD_SKIPPED" }),
    ]);
    expect(doc.warnings[0]?.message).toMatch(/^broken\.tsx: skipped: it does not parse/);
  });

  it("[CSA-CODEMOD-CLI-06] --help prints the usage, in text and in JSON, and a folder named codemod still scaffolds", async () => {
    const help = await exec("codemod", "--help");
    expect(help.code).toBe(EXIT_OK);
    for (const name of CODEMOD_NAMES) expect(help.out).toContain(name);
    expect(help.out).toContain("--dry-run");
    expect(help.out).toContain("--write");

    const asJson = await exec("codemod", "--help", "--json");
    expect(JSON.parse(asJson.out)).toMatchObject({ ok: true, data: { usage: expect.any(String) } });

    const scaffold = await exec("./codemod", "--yes", "--no-install", "--no-git");
    expect(scaffold.code).toBe(EXIT_OK);
    expect(scaffold.out).toContain("Created codemod");
  });

  it("[CSA-CODEMOD-CLI-06] the completion scripts offer the command and the codemod names", async () => {
    for (const shell of ["bash", "zsh", "fish"]) {
      const { out } = await exec("completion", shell);
      expect(out, shell).toContain("codemod");
      for (const name of CODEMOD_NAMES) expect(out, `${shell} ${name}`).toContain(name);
    }
  });
});
