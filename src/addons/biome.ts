import { addDevDependency, type Draft, json } from "../templates/shared";
import { versionOf } from "../versions";

/**
 * Biome as linter and formatter. The config ignores build output and generated files, so
 * `biome check .` is clean on a fresh project. Biome 2.6 also formats Markdown and YAML by default;
 * the config leaves both as written, because its Markdown formatter puts a blank line at the top of
 * a post's front matter and rewrites the emphasis the posts use.
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
      markdown: { formatter: { enabled: false } },
      yaml: { formatter: { enabled: false } },
    }),
  );
}
