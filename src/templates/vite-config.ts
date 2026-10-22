import { isDuskBased } from "../options";
import { duskTarget } from "./adapters";
import { type Draft, lines } from "./shared";

/**
 * The `vite.config.ts` of a generated project. The app plugin comes first, then Tailwind, so the
 * ShadowJS compiler sees `.tsx` before anything else does.
 */

const ALIAS = '{ "@": fileURLToPath(new URL("./src", import.meta.url)) }';

/** The Vite config text for the template and add-ons of the draft. @since 1.0.0 */
export function viteConfigSource(draft: Draft): string {
  const { options } = draft;
  const dusk = isDuskBased(options.template);
  const exposeVite = dusk && (options.convex || options.clerk);
  const loadsEnv = dusk && options.clerk;

  const imports: string[] = [];
  if (options.ui) imports.push('import { fileURLToPath } from "node:url";');
  // A dusk app always names an adapter (the Node one by default), so `dusk start` has its output.
  const target = dusk ? duskTarget(options.adapter) : undefined;
  // Biome's import order puts "@shadow-js/dusk/<adapter>" before "@shadow-js/dusk/vite".
  if (target !== undefined) {
    imports.push(`import { ${target.factory} } from "@shadow-js/dusk/${target.subpath}";`);
  }
  imports.push(
    dusk ? 'import { dusk } from "@shadow-js/dusk/vite";' : 'import shadow from "@shadow-js/vite";',
  );
  if (options.tailwind) imports.push('import tailwindcss from "@tailwindcss/vite";');
  imports.push(
    loadsEnv
      ? 'import { defineConfig, loadEnv } from "vite";'
      : 'import { defineConfig } from "vite";',
  );

  const shadowPlugin = target === undefined ? "shadow()" : `dusk({ adapter: ${target.factory}() })`;
  const plugins = `${shadowPlugin}${options.tailwind ? ", tailwindcss()" : ""}`;
  const properties: string[] = [];
  if (exposeVite) {
    properties.push(
      "// Convex and Clerk write VITE_ variables to .env.local; Dusk exposes only DUSK_PUBLIC_ ones by default.",
      'envPrefix: ["VITE_"],',
    );
  }
  properties.push(`plugins: [${plugins}],`);
  if (options.ui) properties.push(`resolve: { alias: ${ALIAS} },`);

  if (loadsEnv) {
    return lines([
      ...imports,
      "",
      "export default defineConfig(({ mode }) => {",
      "  // Server code reads secrets from process.env; Vite itself only reads .env files for prefixed variables.",
      '  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {',
      "    process.env[key] ??= value;",
      "  }",
      "  return {",
      ...properties.map((line) => `    ${line}`),
      "  };",
      "});",
    ]);
  }
  if (properties.length === 1) {
    return lines([
      ...imports,
      "",
      `export default defineConfig({ ${properties[0]?.replace(/,$/, "")} });`,
    ]);
  }
  return lines([
    ...imports,
    "",
    "export default defineConfig({",
    ...properties.map((line) => `  ${line}`),
    "});",
  ]);
}

/** The `vitest.config.ts` for the template of the draft. @since 1.0.0 */
export function vitestConfigSource(draft: Draft): string {
  const { options } = draft;
  const imports: string[] = [];
  if (options.ui) imports.push('import { fileURLToPath } from "node:url";');
  imports.push(
    'import shadow from "@shadow-js/vite";',
    'import { defineConfig } from "vitest/config";',
  );
  const body = [
    "export default defineConfig({",
    "  plugins: [shadow()],",
    ...(options.ui ? [`  resolve: { alias: ${ALIAS} },`] : []),
    '  test: { environment: "happy-dom", setupFiles: ["./vitest.setup.ts"] },',
    "});",
  ];
  return lines([...imports, "", ...body]);
}
