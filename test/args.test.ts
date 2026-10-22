import { describe, expect, it } from "vitest";
import { checkArgs, parseArgs } from "../src/args";
import { UsageError } from "../src/names";

describe("command line", () => {
  it("[CSA-60] a bare invocation asks for nothing yet", () => {
    const args = parseArgs([]);
    expect(args).toMatchObject({
      directory: undefined,
      template: undefined,
      addons: {},
      yes: false,
      install: undefined,
      git: undefined,
      force: false,
      dryRun: false,
      help: false,
      version: false,
    });
  });

  it("[CSA-61] reads a directory, a template, add-on switches and behavior flags", () => {
    const args = parseArgs([
      "my-app",
      "--template",
      "dusk",
      "--tailwind",
      "--no-biome",
      "--vitest",
      "--convex",
      "--clerk",
      "--ui",
      "--eslint",
      "--devtools",
      "--router",
      "--yes",
      "--no-install",
      "--no-git",
      "--pm",
      "pnpm",
      "--force",
      "--dry-run",
      "--local",
      "/pack",
      "--name",
      "@me/app",
      "--allow-outside",
    ]);
    expect(args.directory).toBe("my-app");
    expect(args.template).toBe("dusk");
    expect(args.addons).toEqual({
      tailwind: true,
      biome: false,
      vitest: true,
      convex: true,
      clerk: true,
      ui: true,
      eslint: true,
      devtools: true,
      router: true,
    });
    expect(args).toMatchObject({
      yes: true,
      install: false,
      git: false,
      packageManager: "pnpm",
      force: true,
      dryRun: true,
      local: "/pack",
      name: "@me/app",
      allowOutside: true,
    });
  });

  it("[CSA-62] accepts --flag=value, -t, -y, -h, -v, and `--` before a directory that starts with a dash", () => {
    expect(parseArgs(["--template=spa", "--pm=yarn", "--pack-root=/repo"])).toMatchObject({
      template: "spa",
      packageManager: "yarn",
      packRoot: "/repo",
    });
    expect(parseArgs(["-t", "dusk", "-y"])).toMatchObject({ template: "dusk", yes: true });
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["--version"]).version).toBe(true);
    expect(parseArgs(["--", "-odd"]).directory).toBe("-odd");
  });

  it("[CSA-63] the last of --x and --no-x wins", () => {
    expect(parseArgs(["--tailwind", "--no-tailwind"]).addons).toEqual({ tailwind: false });
    expect(parseArgs(["--no-tailwind", "--tailwind"]).addons).toEqual({ tailwind: true });
  });

  it("[CSA-64] refuses unknown options, bad values, missing values and a second directory", () => {
    const refuse = (argv: string[], message: RegExp): void => {
      expect(() => parseArgs(argv), argv.join(" ")).toThrow(UsageError);
      expect(() => parseArgs(argv), argv.join(" ")).toThrow(message);
    };
    refuse(["--wat"], /Unknown option --wat/);
    refuse(["-z"], /Unknown option -z/);
    refuse(["--no-wat"], /Unknown option --no-wat/);
    refuse(["--template", "next"], /Unknown template "next"/);
    refuse(["--template"], /--template needs a value/);
    refuse(["--template", "--yes"], /--template needs a value/);
    refuse(["--pm", "cargo"], /Unknown package manager "cargo"/);
    refuse(["--yes=1"], /does not take a value/);
    refuse(["a", "b"], /Unexpected argument "b"/);
    refuse(["--local="], /--local needs a value/);
  });

  it("[CSA-65] refuses contradictory flags", () => {
    expect(() => checkArgs(parseArgs(["--local", "/a", "--pack-root", "/b"]))).toThrow(/not both/);
    expect(() => checkArgs(parseArgs(["-t", "dusk", "--no-router"]))).toThrow(/always routes/);
    expect(() => checkArgs(parseArgs(["-t", "spa", "--no-router"]))).not.toThrow();
  });

  it("[CSA-66] --ui needs Tailwind, so --no-tailwind with --ui is refused; a terminal may ask the template for --adapter", () => {
    expect(() => checkArgs(parseArgs(["app", "--ui", "--no-tailwind"]))).toThrow(/needs Tailwind/);
    expect(() => checkArgs(parseArgs(["app", "--ui", "--tailwind"]))).not.toThrow();
    expect(() => checkArgs(parseArgs(["app", "--no-ui", "--no-tailwind"]))).not.toThrow();
    // Without a terminal nothing asks, so the default template (spa) would take the adapter.
    expect(() => checkArgs(parseArgs(["app", "--adapter", "bun"]))).toThrow(/dusk template/);
    expect(() => checkArgs(parseArgs(["app", "--adapter", "bun"]), true)).not.toThrow();
    expect(() => checkArgs(parseArgs(["app", "-t", "spa", "--adapter", "bun"]), true)).toThrow(
      /dusk template/,
    );
  });
});
