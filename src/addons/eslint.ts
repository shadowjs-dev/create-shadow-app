import { isDuskBased } from "../options";
import { addDevDependency, type Draft, lines, runScript } from "../templates/shared";

/**
 * ESLint with the flat config of `@shadow-js/eslint-plugin`: `configs.dusk` for a Dusk app (it
 * knows the client/server boundary of the build), `configs.recommended` for a single-page app.
 *
 * The plugin brings its own parser, which does not use the TypeScript compiler API, so it runs on
 * the TypeScript 7 the app is compiled with: no second TypeScript, no `typescript-eslint`, one
 * `package.json`, one install.
 *
 * @since 1.0.0
 */
export function applyEslint(draft: Draft): void {
  const dusk = isDuskBased(draft.options.template);
  const ignored = [
    "dist",
    ...(draft.options.convex ? ["convex/_generated"] : []),
    ...draft.ignored.map((path) => `${path}/**`),
  ];
  addDevDependency(draft, "eslint");
  addDevDependency(draft, "@shadow-js/eslint-plugin");
  draft.scripts["lint:eslint"] = "eslint .";
  draft.files.set(
    "eslint.config.js",
    lines([
      'import shadow from "@shadow-js/eslint-plugin";',
      "",
      // One line, as Biome prints it: the longest form is well under the 100 columns.
      `export default [{ ignores: [${ignored.map((entry) => JSON.stringify(entry)).join(", ")}] }, shadow.configs.${dusk ? "dusk" : "recommended"}];`,
    ]),
  );
  draft.sections.push({
    heading: "ESLint",
    body: `\`${runScript(draft.options.packageManager, "lint:eslint")}\` runs the ${dusk ? "Dusk" : "recommended"} rules of \`@shadow-js/eslint-plugin\`. The plugin parses TypeScript and JSX itself, so it works with the TypeScript 7 this app compiles with.${dusk ? " The `shadow/server-only-import-in-client` rule applies the same client/server boundary as the Dusk build: `*.server.ts` files and Node built-ins cannot reach the browser." : ""}`,
  });
}
