import { addDevDependency, type Draft, json } from "../templates/shared";
import { versionOf } from "../versions";

/**
 * Biome as linter and formatter. The config ignores build output and generated files, so
 * `biome check .` is clean on a fresh project.
 *
 * @since 1.0.0
 */
export function applyBiome(draft: Draft): void {
  addDevDependency(draft, "@biomejs/biome");
  draft.scripts["lint"] = "biome check .";
  draft.scripts["format"] = "biome format --write .";
  const ignored = ["!**/dist", "!**/routeTree.gen.ts"];
  if (draft.options.convex) ignored.push("!convex/_generated");
  for (const path of draft.ignored) ignored.push(`!${path}`);
  draft.files.set(
    "biome.json",
    json({
      $schema: `https://biomejs.dev/schemas/${versionOf("@biomejs/biome")}/schema.json`,
      files: { includes: ["**", ...ignored] },
      formatter: { indentStyle: "space", indentWidth: 2, lineWidth: 100 },
      linter: { enabled: true, rules: { preset: "recommended" } },
      javascript: { formatter: { quoteStyle: "double" } },
    }),
  );
}
