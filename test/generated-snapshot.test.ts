import { describe, expect, it } from "vitest";
import { ADAPTERS, type ScaffoldOptions } from "../src/options";
import { projectFiles } from "../src/project";

/**
 * Snapshots of the generated files. A change to a generator shows up here as a reviewable diff of
 * the whole project, not as a silent change of output. Update them on purpose with
 * `npx vitest run --project unit packages/create-shadow-app/test/generated-snapshot.test.ts -u`.
 */

const ALL = {
  tailwind: true,
  biome: true,
  vitest: true,
  ui: true,
  eslint: true,
  devtools: true,
  convex: true,
  clerk: true,
} as const;

/** Every file of a project as one text, in path order, so one snapshot covers the whole tree. */
function digest(options: ScaffoldOptions): string {
  const files = projectFiles(options);
  return [...files.keys()]
    .sort()
    .map((path) => `=== ${path} ===\n${files.get(path) ?? ""}`)
    .join("");
}

describe("generated files", () => {
  it("[CSA-185] the plain single-page app", async () => {
    await expect(digest({ name: "app", template: "spa" })).toMatchFileSnapshot(
      "./snapshots/generated/spa-plain.txt",
    );
  });

  it("[CSA-186] the single-page app with the router, Tailwind, Biome and Vitest", async () => {
    await expect(
      digest({
        name: "app",
        template: "spa",
        router: true,
        tailwind: true,
        biome: true,
        vitest: true,
      }),
    ).toMatchFileSnapshot("./snapshots/generated/spa-router-tailwind-vitest.txt");
  });

  it("[CSA-187] the Dusk app with no add-ons, on the Node server", async () => {
    await expect(digest({ name: "app", template: "dusk" })).toMatchFileSnapshot(
      "./snapshots/generated/dusk-plain.txt",
    );
  });

  it("[CSA-188] the Dusk app with every add-on, on the Node server", async () => {
    await expect(digest({ name: "app", template: "dusk", ...ALL })).toMatchFileSnapshot(
      "./snapshots/generated/dusk-all.txt",
    );
  });

  it("[CSA-189] the single-page app with every add-on", async () => {
    await expect(digest({ name: "app", template: "spa", ...ALL })).toMatchFileSnapshot(
      "./snapshots/generated/spa-all.txt",
    );
  });

  it("[CSA-190] every deployment target writes its own config, scripts and README paragraph", async () => {
    for (const adapter of ADAPTERS) {
      const files = projectFiles({ name: "app", template: "dusk", adapter, biome: true });
      const manifest = JSON.parse(files.get("package.json") ?? "{}") as {
        scripts: Record<string, string>;
      };
      expect(files.get("vite.config.ts"), adapter).toContain(`@shadow-js/dusk/`);
      expect(manifest.scripts["start"], adapter).toBeTypeOf("string");
    }
    await expect(
      digest({ name: "app", template: "dusk", adapter: "cloudflare", biome: true, vitest: true }),
    ).toMatchFileSnapshot("./snapshots/generated/dusk-cloudflare.txt");
  });
});
