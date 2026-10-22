import { describe, expect, it } from "vitest";
import {
  ADAPTERS,
  PACKAGE_MANAGERS,
  type PackageManager,
  type ScaffoldOptions,
} from "../src/options";
import { installInvocation, managerFromUserAgent } from "../src/pm";
import { buildProject } from "../src/project";
import { fullManifest } from "./support/combos";

/**
 * Package managers are generated, not run: npm is the only one the matrix installs with. These tests
 * prove the commands the generator writes (README, next steps, scripts, overrides) for each manager.
 */

const RUN: Record<PackageManager, (script: string) => string> = {
  npm: (script) => `npm run ${script}`,
  pnpm: (script) => `pnpm ${script}`,
  yarn: (script) => `yarn run ${script}`,
  bun: (script) => `bun run ${script}`,
};

const OVERRIDE_FIELD: Record<PackageManager, string> = {
  npm: "overrides",
  pnpm: "pnpm",
  yarn: "resolutions",
  bun: "overrides",
};

describe("package managers: the commands the generator writes", () => {
  it("[CSA-200] every generated file uses the chosen manager's commands, and never another's", () => {
    for (const packageManager of PACKAGE_MANAGERS) {
      const others = PACKAGE_MANAGERS.filter((name) => name !== packageManager);
      const options: ScaffoldOptions[] = [
        { name: "app", template: "spa", biome: true, vitest: true, tailwind: true },
        { name: "app", template: "spa", convex: true, clerk: true, ui: true },
        {
          name: "app",
          template: "dusk",
          biome: true,
          vitest: true,
          convex: true,
          clerk: true,
          ui: true,
        },
        ...ADAPTERS.map((adapter) => ({
          name: "app",
          template: "dusk" as const,
          adapter,
          eslint: true,
        })),
      ];
      for (const option of options) {
        const project = buildProject({ ...option, packageManager });
        const where = `${packageManager} ${option.template} ${option.adapter ?? ""}`;
        expect(project.files.get("README.md"), where).toContain(`${packageManager} install`);
        expect(project.files.get("README.md"), where).toContain(RUN[packageManager]("dev"));
        for (const [file, text] of project.files) {
          for (const other of others) {
            // A word match: `npm` must not be found inside `npx`, and `bun` not inside `bunx`.
            expect(text, `${where}: ${file} mentions ${other}`).not.toMatch(
              new RegExp(`\\b${other} (?:install|run|dev|build|start|test|exec)\\b`),
            );
          }
          if (packageManager !== "npm") {
            expect(text, `${where}: ${file} mentions npm`).not.toMatch(/\bnpm\b/);
          }
        }
      }
    }
  });

  it("[CSA-203] the Convex and shadow-ui steps use the manager's runner, so no step asks for npx in a pnpm project", () => {
    for (const packageManager of PACKAGE_MANAGERS) {
      const project = buildProject({
        name: "app",
        template: "spa",
        packageManager,
        convex: true,
        ui: true,
      });
      const text = [...project.files.values(), ...project.steps].join("\n");
      if (packageManager !== "npm") expect(text, packageManager).not.toMatch(/\bnpx convex\b/);
      expect(text, packageManager).toMatch(/convex dev/);
    }
  });

  it("[CSA-201] local tarballs go under the override field that manager reads", () => {
    for (const packageManager of PACKAGE_MANAGERS) {
      const project = buildProject({
        name: "app",
        template: "spa",
        packageManager,
        local: { manifest: fullManifest() },
      });
      const manifest = JSON.parse(project.files.get("package.json") ?? "{}") as Record<
        string,
        unknown
      >;
      const field = OVERRIDE_FIELD[packageManager];
      const block =
        field === "pnpm"
          ? (manifest["pnpm"] as { overrides?: Record<string, string> } | undefined)?.overrides
          : (manifest[field] as Record<string, string> | undefined);
      expect(block?.["@shadow-js/core"], packageManager).toMatch(/^file:.*\.tgz$/);
      expect(manifest["dependencies"], packageManager).toMatchObject({
        "@shadow-js/core": expect.stringMatching(/^file:/),
      });
      // Only the field of this manager is written: the others would be ignored or would conflict.
      for (const other of ["overrides", "resolutions", "pnpm"]) {
        if (other !== field) expect(manifest[other], `${packageManager} ${other}`).toBeUndefined();
      }
    }
  });

  it("[CSA-202] the installer runs the manager by its own name, and a process started by a manager is recognized", () => {
    for (const packageManager of PACKAGE_MANAGERS) {
      expect(installInvocation(packageManager)).toEqual({
        command: packageManager,
        args: ["install"],
      });
      expect(managerFromUserAgent(`${packageManager}/9.0.0 npm/? node/v22 linux x64`)).toBe(
        packageManager,
      );
    }
    expect(managerFromUserAgent("deno/2.0.0")).toBeUndefined();
    expect(managerFromUserAgent(undefined)).toBeUndefined();
  });
});
