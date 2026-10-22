import { describe, expect, it } from "vitest";
import { checkArgs, parseArgs } from "../src/args";
import { UsageError } from "../src/names";
import { ADAPTERS, resolveOptions } from "../src/options";
import { buildProject } from "../src/project";
import { ADAPTER_TARGETS } from "../src/templates/adapters";

/**
 * `--adapter` of the dusk template: the flag, its checks, and what each target writes into the
 * generated project (the config imports the adapter from its subpath, the start and deploy scripts run
 * the files it emits; no `serve.mjs` is written, since `dusk start` serves the Node adapter's output).
 */

describe("--adapter on the command line", () => {
  it("[CSA-ADP-01] parses a known target and refuses an unknown one, naming the choices", () => {
    expect(parseArgs(["app", "--template", "dusk", "--adapter", "bun"]).adapter).toBe("bun");
    expect(parseArgs(["app", "-t", "dusk", "--adapter=cloudflare"]).adapter).toBe("cloudflare");
    expect(() => parseArgs(["app", "--adapter", "lambda"])).toThrow(UsageError);
    expect(() => parseArgs(["app", "--adapter", "lambda"])).toThrow(
      /Choose one of: node, bun, deno, cloudflare, vercel, netlify, tarout, static/,
    );
  });

  it("[CSA-ADP-02] the flag needs the dusk template", () => {
    expect(() => checkArgs(parseArgs(["app", "--adapter", "bun"]))).toThrow(
      /applies to the dusk template only/,
    );
    expect(() => checkArgs(parseArgs(["app", "--template", "spa", "--adapter", "bun"]))).toThrow(
      UsageError,
    );
    expect(() =>
      checkArgs(parseArgs(["app", "--template", "dusk", "--adapter", "bun"])),
    ).not.toThrow();
  });

  it("[CSA-ADP-03] resolveOptions refuses an adapter on the spa template and keeps it on dusk", () => {
    expect(() => resolveOptions({ name: "app", template: "spa", adapter: "bun" })).toThrow(
      /dusk template only/,
    );
    expect(() =>
      resolveOptions({ name: "app", template: "dusk", adapter: "lambda" as "bun" }),
    ).toThrow(/Unknown adapter/);
    expect(resolveOptions({ name: "app", template: "dusk", adapter: "vercel" }).adapter).toBe(
      "vercel",
    );
    expect(resolveOptions({ name: "app", template: "dusk" }).adapter).toBeUndefined();
  });
});

describe("what the dusk template writes for each target", () => {
  it("[CSA-ADP-04] every target has an adapter import, a start script and an output folder", () => {
    for (const adapter of ADAPTERS) {
      const target = ADAPTER_TARGETS[adapter];
      expect(target.subpath, adapter).toBeTruthy();
      expect(target.factory, adapter).toMatch(/^[a-zA-Z]+$/);
      expect(target.start, adapter).toBeTruthy();
      expect(target.output, adapter).toMatch(/^(dist|\.vercel)\//);
    }
  });

  for (const adapter of ADAPTERS) {
    it(`[CSA-ADP-05] ${adapter}: vite.config imports the adapter from its subpath, the scripts run its output, serve.mjs is left out`, () => {
      const project = buildProject({ name: "app", template: "dusk", adapter });
      const target = ADAPTER_TARGETS[adapter];
      const config = project.files.get("vite.config.ts") ?? "";
      expect(config).toContain(
        `import { ${target.factory} } from "@shadow-js/dusk/${target.subpath}";`,
      );
      expect(config).toContain(`dusk({ adapter: ${target.factory}() })`);
      const pkg = JSON.parse(project.files.get("package.json") ?? "{}") as {
        scripts: Record<string, string>;
      };
      expect(pkg.scripts["dev"]).toBe("dusk dev");
      expect(pkg.scripts["build"]).toBe("dusk build");
      expect(pkg.scripts["start"]).toBe(target.start);
      expect(project.files.has("serve.mjs")).toBe(false);
      if (target.deploy === undefined) expect(pkg.scripts["deploy"]).toBeUndefined();
      else expect(pkg.scripts["deploy"]).toBe(target.deploy);
      expect(project.files.get("README.md") ?? "").toContain(target.output.split("/")[0] ?? "");
    });
  }

  it("[CSA-ADP-06] without --adapter the app uses the Node adapter, so dusk start serves the build", () => {
    const project = buildProject({ name: "app", template: "dusk" });
    expect(project.files.has("serve.mjs")).toBe(false);
    const config = project.files.get("vite.config.ts") ?? "";
    expect(config).toContain('import { node } from "@shadow-js/dusk/node";');
    expect(config).toContain("dusk({ adapter: node() })");
    const pkg = JSON.parse(project.files.get("package.json") ?? "{}") as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["start"]).toBe("dusk start");
    expect(pkg.scripts["deploy"]).toBeUndefined();
    expect(project.files.get("README.md") ?? "").toContain("dist/node/server.mjs");
  });

  it("[CSA-ADP-07] the deploy commands name the CLIs and the folders the adapters write", () => {
    expect(ADAPTER_TARGETS.cloudflare.deploy).toContain("dist/cloudflare/wrangler.toml");
    expect(ADAPTER_TARGETS.vercel.deploy).toContain("vercel deploy --prebuilt");
    expect(ADAPTER_TARGETS.netlify.deploy).toContain("cd dist/netlify");
    expect(ADAPTER_TARGETS.bun.deploy).toBeUndefined();
  });

  it("[CSA-192] the static target is served by its own server, serve-static.mjs, and no other target writes one", () => {
    const project = buildProject({ name: "app", template: "dusk", adapter: "static", biome: true });
    const server = project.files.get("serve-static.mjs") ?? "";
    expect(server).toContain('import { serve } from "@shadow-js/dusk/node";');
    expect(server).toContain('dir: "dist/static"');
    expect(server).toContain('index: "index.html"');
    expect(server).toContain("process.env.PORT");
    expect(project.files.has("serve.mjs")).toBe(false);
    const pkg = JSON.parse(project.files.get("package.json") ?? "{}") as {
      scripts: Record<string, string>;
    };
    // `vite preview` answers no directory index here (the Dusk plugin sets appType "custom"), so it
    // cannot serve the prerendered `/`.
    expect(pkg.scripts["start"]).toBe("node serve-static.mjs");
    for (const adapter of ADAPTERS.filter((name) => name !== "static")) {
      const other = buildProject({ name: "app", template: "dusk", adapter });
      expect(other.files.has("serve-static.mjs"), adapter).toBe(false);
    }
  });

  it("[CSA-ADP-08] every deploy command builds first and joins its steps with a spaced &&", () => {
    for (const [name, target] of Object.entries(ADAPTER_TARGETS)) {
      if (target.deploy === undefined) continue;
      expect(target.deploy, name).toMatch(/^dusk build && /);
      expect(target.deploy, name).not.toMatch(/&&\S/);
    }
  });
});
