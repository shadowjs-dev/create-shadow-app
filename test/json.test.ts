import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  jsonFailure,
  jsonSuccess,
  jsonText,
  RunFailure,
  wantsJson,
} from "../src/json";
import { EXIT_CANCELED, EXIT_FAILURE, EXIT_OK, EXIT_USAGE, run } from "../src/run";
import { harness } from "./support/context";

/**
 * The `--json` contract of `create-shadow-app`, run in process with a fake terminal and a fake package manager.
 *
 * - CSA-JSON-01 the envelope has the keys schema, command, ok, data, warnings (and error exactly when ok is false).
 * - CSA-JSON-02 `--yes --json` writes the app and prints one document: the files, the choices, the install, git and the next steps.
 * - CSA-JSON-03 `--no-install --no-git --json` says so, and the next steps include the install command.
 * - CSA-JSON-04 `--dry-run --json` lists the files and writes nothing.
 * - CSA-JSON-05 every failure is a document with a CREATE_SHADOW_APP_ code and the exit code it has without --json.
 * - CSA-JSON-06 nothing is asked: a terminal on stdin does not make `--json` interactive.
 * - CSA-JSON-07 help and version are documents.
 * - CSA-JSON-08 the human lines go to stderr, the installer is told to send its output there, and no stream has color.
 * - CSA-JSON-09 an unexpected exception is a JSON failure with the unexpected code.
 * - CSA-JSON-10 every code the sources print is in the list of json.ts, and every listed code is printed somewhere.
 */

const temp = (): string => mkdtempSync(join(tmpdir(), "csa-json-"));

interface Doc {
  readonly schema: number;
  readonly command: string;
  readonly ok: boolean;
  readonly data: Record<string, unknown>;
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
  readonly error?: { readonly code: string; readonly message: string };
}

async function exec(
  argv: string[],
  options: Parameters<typeof harness>[1] = {},
  cwd = temp(),
): Promise<{ cwd: string; code: number; doc: Doc; h: ReturnType<typeof harness> }> {
  const h = harness(cwd, options);
  const code = await run(argv, h.ctx);
  const out = h.stdout();
  expect(out.endsWith("\n"), "newline-terminated").toBe(true);
  expect(out.trimEnd().split("\n").length, "one document").toBeGreaterThan(1);
  const doc = JSON.parse(out) as Doc;
  expect(Object.keys(doc).slice(0, 5)).toEqual(["schema", "command", "ok", "data", "warnings"]);
  expect(doc.schema).toBe(1);
  expect(doc.ok).toBe(code === 0);
  if (doc.ok) expect(doc.error).toBeUndefined();
  else expect(doc.error?.code).toMatch(/^CREATE_SHADOW_APP_[A-Z]+(?:_[A-Z]+)*$/);
  return { cwd, code, doc, h };
}

/** The text of a source file without the code lists of json.ts, which name every code and so prove nothing. */
function withoutLists(text: string): string {
  return text.replace(/export const (?:ERROR|WARNING)_CODES = \[[\s\S]*?\] as const;/g, "");
}

describe("create-shadow-app --json", () => {
  it("[CSA-JSON-01] the envelope has the keys schema, command, ok, data, warnings and an error only on failure", () => {
    const ok = jsonSuccess("create-shadow-app", { name: "app" }, [
      { code: "CREATE_SHADOW_APP_X", message: "m" },
    ]);
    expect(Object.keys(ok)).toEqual(["schema", "command", "ok", "data", "warnings"]);
    const bad = jsonFailure("create-shadow-app", {
      code: "CREATE_SHADOW_APP_DIRECTORY_NOT_EMPTY",
      message: "m",
    });
    expect(Object.keys(bad)).toEqual(["schema", "command", "ok", "data", "warnings", "error"]);
    expect(bad).toMatchObject({ ok: false, data: {}, warnings: [] });
    expect(JSON.parse(jsonText(ok))).toEqual(ok);
    expect(jsonText(ok).endsWith("\n")).toBe(true);
    expect(wantsJson(["app", "--json"])).toBe(true);
    expect(wantsJson(["app", "--", "--json"])).toBe(false);
    expect(wantsJson(["app", "--jsonx"])).toBe(false);
    for (const code of ERROR_CODES) {
      expect(code).toMatch(/^CREATE_SHADOW_APP_[A-Z]+(?:_[A-Z]+)*$/);
    }
    expect(new RunFailure("x", "CREATE_SHADOW_APP_LOCAL_PACK").code).toBe(
      "CREATE_SHADOW_APP_LOCAL_PACK",
    );
  });

  it("[CSA-JSON-02] --yes --json writes the app and prints the files, the choices, the install, git and the next steps", async () => {
    const { cwd, code, doc, h } = await exec(["my-app", "--yes", "--json"]);
    expect(code).toBe(EXIT_OK);
    expect(doc.command).toBe("create-shadow-app");
    expect(doc.data).toMatchObject({
      name: "my-app",
      directory: join(cwd, "my-app"),
      template: "spa",
      packageManager: "npm",
      dryRun: false,
      installed: true,
      git: "initialized",
    });
    expect(doc.data["addons"]).toEqual(["biome"]);
    const files = doc.data["files"] as string[];
    expect(files).toContain("package.json");
    expect(files).toEqual([...files].sort());
    expect(existsSync(join(cwd, "my-app", "package.json"))).toBe(true);
    expect(readdirSync(join(cwd, "my-app")).sort()).toEqual(
      expect.arrayContaining(["package.json", "src"]),
    );
    const steps = doc.data["nextSteps"] as string[];
    expect(steps[0]).toBe("cd my-app");
    expect(steps).toContain("npm run dev");
    expect(h.stderr()).toContain("Created my-app");
    expect(h.stdout().includes("Created")).toBe(false);
  });

  it("[CSA-JSON-03] --no-install --no-git says so and puts the install command in the next steps", async () => {
    const { code, doc, h } = await exec([
      "app",
      "--template",
      "dusk",
      "--vitest",
      "--no-install",
      "--no-git",
      "--json",
    ]);
    expect(code).toBe(EXIT_OK);
    expect(doc.data).toMatchObject({
      template: "dusk",
      installed: false,
      git: "disabled",
      adapter: null,
    });
    expect(doc.data["addons"]).toEqual(["biome", "vitest"]);
    expect(doc.data["nextSteps"]).toContain("npm install");
    expect(h.calls).toEqual([]);
  });

  it("[CSA-JSON-04] --dry-run --json lists the files and writes nothing", async () => {
    const { cwd, code, doc, h } = await exec(["app", "--dry-run", "--json"]);
    expect(code).toBe(EXIT_OK);
    expect(doc.data).toMatchObject({
      dryRun: true,
      name: "app",
      installed: false,
      git: "disabled",
    });
    expect(doc.data["files"] as string[]).toContain("package.json");
    expect(doc.data["dependencies"]).toBeTypeOf("object");
    expect(readdirSync(cwd)).toEqual([]);
    expect(h.calls).toEqual([]);
  });

  it("[CSA-JSON-05] every failure is a document with a CREATE_SHADOW_APP_ code and the usual exit code", async () => {
    const full = temp();
    mkdirSync(join(full, "taken"));
    writeFileSync(join(full, "taken", "file.txt"), "x");
    const rows: readonly {
      argv: string[];
      cwd?: string;
      answers?: Parameters<typeof harness>[1];
      exit: number;
      code: string;
    }[] = [
      { argv: ["--wat"], exit: EXIT_USAGE, code: "CREATE_SHADOW_APP_UNKNOWN_OPTION" },
      { argv: [], exit: EXIT_USAGE, code: "CREATE_SHADOW_APP_MISSING_DIRECTORY" },
      {
        argv: ["app", "--template", "next"],
        exit: EXIT_USAGE,
        code: "CREATE_SHADOW_APP_INVALID_OPTION",
      },
      {
        argv: ["app", "extra", "more"],
        exit: EXIT_USAGE,
        code: "CREATE_SHADOW_APP_INVALID_OPTION",
      },
      {
        argv: ["../escape", "--yes"],
        exit: EXIT_USAGE,
        code: "CREATE_SHADOW_APP_INVALID_DIRECTORY",
      },
      {
        argv: ["app", "--name", "Bad Name!", "--yes"],
        exit: EXIT_USAGE,
        code: "CREATE_SHADOW_APP_INVALID_NAME",
      },
      {
        argv: ["taken", "--yes"],
        cwd: full,
        exit: EXIT_FAILURE,
        code: "CREATE_SHADOW_APP_DIRECTORY_NOT_EMPTY",
      },
      {
        argv: ["app", "--yes", "--local", "/no/such/pack"],
        exit: EXIT_FAILURE,
        code: "CREATE_SHADOW_APP_LOCAL_PACK",
      },
      {
        argv: ["app", "--yes"],
        answers: { answers: { install: 1 } },
        exit: EXIT_FAILURE,
        code: "CREATE_SHADOW_APP_INSTALL_FAILED",
      },
      {
        argv: ["app", "--yes"],
        answers: { answers: { install: null } },
        exit: EXIT_FAILURE,
        code: "CREATE_SHADOW_APP_INSTALL_FAILED",
      },
    ];
    for (const row of rows) {
      const { code, doc, h } = await exec([...row.argv, "--json"], row.answers, row.cwd);
      expect(code, row.argv.join(" ")).toBe(row.exit);
      expect(doc.error?.code, row.argv.join(" ")).toBe(row.code);
      expect(doc.command).toBe("create-shadow-app");
      expect(doc.error?.message.length).toBeGreaterThan(0);
      expect(h.stderr(), "the words stay on stderr").not.toBe("");
    }
    const failedInstall = await exec(["app", "--yes", "--json"], { answers: { install: 1 } });
    expect(failedInstall.doc.data["installed"]).toBe(false);
    expect(failedInstall.doc.data["files"] as string[]).toContain("package.json");
  });

  it("[CSA-JSON-05b] a canceled run (SIGINT) is a document with exit 130 and the canceled code", async () => {
    const cwd = temp();
    const h = harness(cwd, { answers: { hang: true } });
    const running = run(["app", "--yes", "--json"], h.ctx);
    await h.installStarted;
    h.signals.fire("SIGINT");
    const code = await running;
    expect(code).toBe(EXIT_CANCELED);
    const doc = JSON.parse(h.stdout()) as Doc;
    expect(doc).toMatchObject({ ok: false, error: { code: "CREATE_SHADOW_APP_CANCELED" } });
    expect(readdirSync(cwd)).toEqual([]);
  });

  it("[CSA-JSON-06] --json never asks: a terminal on stdin does not make the run interactive", async () => {
    const { code, doc, h } = await exec(["app", "--json"], { tty: true });
    expect(code).toBe(EXIT_OK);
    expect(doc.data["name"]).toBe("app");
    expect(h.screen.text.includes("Template")).toBe(false);
    const missing = await exec(["--json"], { tty: true });
    expect(missing.code).toBe(EXIT_USAGE);
    expect(missing.doc.error?.code).toBe("CREATE_SHADOW_APP_MISSING_DIRECTORY");
  });

  it("[CSA-JSON-07] help and version are documents", async () => {
    const help = await exec(["--help", "--json"]);
    expect(help.code).toBe(EXIT_OK);
    expect(String(help.doc.data["usage"])).toContain("npm create shadow-app@latest");
    expect(String(help.doc.data["usage"])).toContain("--json");
    expect(String(help.doc.data["usage"]).includes(String.fromCharCode(27))).toBe(false);
    const version = await exec(["--version", "--json"]);
    expect(version.doc.data).toEqual({ version: "9.9.9" });
  });

  it("[CSA-JSON-08] the installer is told to send its output to stderr, and nothing has color", async () => {
    const { h, doc } = await exec(["app", "--yes", "--json"], {
      env: { FORCE_COLOR: "1" },
      answers: {},
    });
    const install = h.calls.find((call) => call.command !== "git");
    expect(install?.inherit).toBe("stderr");
    expect(h.stdout().includes(String.fromCharCode(27))).toBe(false);
    expect(h.stderr().includes(String.fromCharCode(27))).toBe(false);
    expect(doc.ok).toBe(true);
    const plain = harness(temp(), { env: {} });
    await run(["app2", "--yes"], plain.ctx);
    expect(plain.calls.find((call) => call.command !== "git")?.inherit).toBe(true);
  });

  it("[CSA-JSON-09] an unexpected exception is a JSON failure with the unexpected code and exit 1", async () => {
    const cwd = temp();
    const h = harness(cwd);
    const exploding = {
      ...h.ctx,
      runner: {
        run: async (): Promise<never> => {
          throw new Error("spawn exploded");
        },
      },
    };
    const code = await run(["app", "--yes", "--json"], exploding);
    expect(code).toBe(EXIT_FAILURE);
    expect(JSON.parse(h.stdout())).toMatchObject({
      ok: false,
      command: "create-shadow-app",
      error: { code: "CREATE_SHADOW_APP_UNEXPECTED", message: "unexpected error: spawn exploded" },
    });
  });

  it("[CSA-JSON-10] the codes in the sources and the list of json.ts are the same set", () => {
    const printed = new Set<string>();
    for (const file of readdirSync(join(import.meta.dirname, "..", "src"))) {
      if (!file.endsWith(".ts")) continue;
      const text = withoutLists(readFileSync(join(import.meta.dirname, "..", "src", file), "utf8"));
      for (const match of text.matchAll(/"(CREATE_SHADOW_APP_[A-Z]+(?:_[A-Z]+)*)"/g)) {
        printed.add(match[1] ?? "");
      }
    }
    const known = new Set<string>(ERROR_CODES);
    for (const code of printed)
      expect(known.has(code), `${code} is printed but not listed`).toBe(true);
    for (const code of known)
      expect(printed.has(code), `${code} is listed but never printed`).toBe(true);
  });
});
