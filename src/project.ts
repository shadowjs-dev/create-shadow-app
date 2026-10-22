import { applyBiome } from "./addons/biome";
import { applyClerk } from "./addons/clerk";
import { applyConvex } from "./addons/convex";
import { applyDevtools } from "./addons/devtools";
import { applyEslint } from "./addons/eslint";
import { applyTailwind } from "./addons/tailwind";
import { applyUi } from "./addons/ui";
import { applyVitest } from "./addons/vitest";
import { applyLocal, localState, overrideField } from "./local";
import {
  enabledAddons,
  isDuskBased,
  isStarter,
  type ResolvedOptions,
  resolveOptions,
  type ScaffoldOptions,
} from "./options";
import { targetNote } from "./templates/adapters";
import { applyApi } from "./templates/api";
import { applyContent } from "./templates/content";
import { applyDashboard } from "./templates/dashboard";
import { applyDusk } from "./templates/dusk";
import { providersSource } from "./templates/providers";
import {
  createDraft,
  type Draft,
  installCommand,
  json,
  lines,
  runScript,
} from "./templates/shared";
import { applySpa } from "./templates/spa";
import { finishStarter } from "./templates/starters";

/**
 * Composes a project from pure functions: a template, then the add-ons in a fixed order. The
 * result is data (a map of paths to text), so everything here is testable without a disk.
 */

/** A composed project. @since 1.0.0 */
export interface Project {
  /** The choices after defaults and implications ({@link resolveOptions}). */
  readonly options: ResolvedOptions;
  /** Every file: relative POSIX path to content. */
  readonly files: Map<string, string>;
  /** The install as commands to type, for the README and the next steps. */
  readonly installCommands: readonly string[];
  /** Steps after `cd` and install, for the "next steps" list. */
  readonly steps: readonly string[];
  /** The scripts of the root `package.json`. */
  readonly scripts: Readonly<Record<string, string>>;
}

const SCRIPT_HELP: Readonly<Record<string, string>> = {
  dev: "starts the development server with hot reload",
  build: "builds for production",
  start: "serves the production build (run `build` first)",
  preview: "serves the production build locally",
  typecheck: "type-checks with `tsc --noEmit`",
  test: "runs the tests once",
  "test:watch": "runs the tests and re-runs them on change",
  lint: "checks the code with Biome",
  check: "checks the code with Biome",
  format: "formats the code with Biome",
  "lint:eslint": "checks the code with the ShadowJS ESLint rules",
  convex: "runs `convex dev`",
};

function gitignore(options: ResolvedOptions): string {
  return lines([
    "node_modules",
    "dist",
    "coverage",
    "*.log",
    "*.tsbuildinfo",
    ".DS_Store",
    // Every .env variant is ignored (`.env.production` is where deployment secrets tend to end up);
    // the two files that hold no secret by design stay tracked.
    ".env",
    ".env.local",
    ".env.*.local",
    ".env.*",
    "!.env.example",
    "!.env.public",
    // Private keys and certificates never belong in a repository.
    "*.pem",
    "*.key",
    // Dusk's local state (file KV store, build scratch) and the platform adapters' output folders.
    ...(isDuskBased(options.template) ? [".dusk", ".vercel", ".netlify", ".wrangler"] : []),
    ...(options.local === undefined ? [] : [".shadowjs-local.json"]),
  ]);
}

function installCommands(draft: Draft): string[] {
  return [installCommand(draft.options.packageManager)];
}

function readme(draft: Draft, steps: readonly string[]): string {
  const { options, scripts } = draft;
  const pm = options.packageManager;
  const kind = {
    spa: "A ShadowJS single-page app.",
    dusk: "A Dusk app: file routes, loaders, server functions and server rendering.",
    content:
      "A content site on Dusk: Markdown files, prerendered pages, RSS, a sitemap and robots.txt.",
    dashboard:
      "An admin dashboard on Dusk: a sidebar shell, a data table, queries, forms and typed server functions.",
    api: "A JSON API on Dusk: API routes, typed server functions, environment validation, rate limiting and CORS.",
  }[options.template];
  const out: string[] = [`# ${options.name}`, "", kind, "", "## Getting started", "", "```bash"];
  out.push(...installCommands(draft), runScript(pm, "dev"), ...steps, "```", "", "## Scripts", "");
  for (const name of Object.keys(scripts)) {
    const help =
      name === "lint" && isStarter(options.template)
        ? "checks the code with the ShadowJS ESLint rules"
        : SCRIPT_HELP[name];
    if (help !== undefined) out.push(`- \`${runScript(pm, name)}\` ${help}.`);
  }
  if (isStarter(options.template)) {
    out.push(
      "",
      `\`dusk build\` writes ${targetNote(draft.options.adapter, pm)}. Set \`APP_URL\` to the public address of the app.`,
    );
  }
  if (options.template === "dusk") {
    out.push(
      "",
      "## Project layout",
      "",
      "- `src/routes` maps files to URLs: `index.tsx` is `/`, `posts/[id].tsx` is `/posts/:id`, `_layout.tsx` wraps its folder, `[...rest].tsx` catches everything else. A file that exports `GET`, `POST`... (`api/health.ts`) is an API route.",
      "- `src/server` holds server-only code. A function made with `serverFn` can be called from components and loaders; in the browser it becomes a request to the server, with its input validated first.",
      "- `src/app.tsx` is the root component, `src/entry-server.ts` sets the security options, middleware and limits of the request handler.",
      `- \`dusk build\` writes ${targetNote(draft.options.adapter, pm)}. Set \`APP_URL\` to the public address of the app.`,
    );
  }
  for (const section of draft.sections) out.push("", `## ${section.heading}`, "", section.body);
  return lines(out);
}

function envExample(draft: Draft): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  const base = isDuskBased(draft.options.template)
    ? [
        {
          name: "APP_URL",
          comment: "The public URL of the app. Production answers only for this host.",
          example: "http://localhost:3000",
        },
        { name: "PORT", comment: "Port of `dusk start`.", example: "3000" },
        {
          name: "HOST",
          comment: "Interface of `dusk start`. Use 0.0.0.0 inside a container.",
          example: "127.0.0.1",
        },
      ]
    : [];
  for (const entry of [...draft.env, ...base]) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    out.push(`# ${entry.comment}`, `${entry.name}=${entry.example}`, "");
  }
  if (out.length === 0) return undefined;
  return lines(
    [
      "# Copy this file to .env.local and fill it in. .env.local is not committed.",
      "# A value the browser may read is not a secret: it goes in .env.public (committed), not here.",
      "",
      ...out,
    ].slice(0, -1),
  );
}

/** The committed public env file of a Dusk project: every name in it is readable in the browser. */
function publicEnvExample(options: ResolvedOptions): string {
  return lines([
    "# Public values: every name in this file is readable in the browser, so the file is committed to git.",
    "# Never put a secret here: the build refuses a value that looks like a key, a token or a password.",
    "# A name with the DUSK_PUBLIC_ prefix is public too, in .env.local or the environment.",
    `SITE_NAME=${options.name}`,
  ]);
}

function viteEnvTypes(draft: Draft): string {
  const exposed = draft.env.filter((entry) => entry.name.startsWith("VITE_"));
  if (exposed.length === 0) return '/// <reference types="vite/client" />\n';
  return lines([
    '/// <reference types="vite/client" />',
    "",
    "interface ImportMetaEnv {",
    ...exposed.map((entry) => `  readonly ${entry.name}?: string;`),
    "}",
  ]);
}

function manifest(draft: Draft): Record<string, unknown> {
  const { options } = draft;
  const body: Record<string, unknown> = {
    name: options.name,
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: draft.scripts,
    dependencies: draft.dependencies,
    devDependencies: draft.devDependencies,
  };
  if (options.local === undefined) return body;
  const result = applyLocal(
    { dependencies: draft.dependencies, devDependencies: draft.devDependencies },
    options.local.manifest,
    options.local.from,
  );
  body["dependencies"] = result.dependencies;
  body["devDependencies"] = result.devDependencies;
  const field = overrideField(options.packageManager);
  if (field === "pnpm") {
    body["pnpm"] = { overrides: result.overrides };
    // pnpm 10 and later reads overrides from pnpm-workspace.yaml and ignores the package.json field.
    const overrides = Object.entries(result.overrides)
      .map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}\n`)
      .join("");
    draft.files.set(
      "pnpm-workspace.yaml",
      `${draft.files.get("pnpm-workspace.yaml") ?? ""}overrides:\n${overrides}`,
    );
  } else body[field] = result.overrides;
  draft.files.set(".shadowjs-local.json", localState(result));
  return body;
}

/**
 * Composes a project.
 *
 * @param input What to generate. Only `name` is required.
 * @returns The files and what the command line needs to finish the job.
 * @throws Error for an unknown template or package manager, or (with `local`) when the pack
 *   directory lacks a package the project needs.
 * @example
 * buildProject({ name: "app", template: "dusk", tailwind: true }).files.has("serve.mjs"); // false
 * @since 1.0.0
 */
export function buildProject(input: ScaffoldOptions): Project {
  const options = resolveOptions(input);
  const draft = createDraft(options);
  if (options.template === "dusk") applyDusk(draft);
  else if (options.template === "content") applyContent(draft);
  else if (options.template === "dashboard") applyDashboard(draft);
  else if (options.template === "api") applyApi(draft);
  else applySpa(draft);
  if (options.tailwind) applyTailwind(draft);
  if (options.biome) applyBiome(draft);
  if (options.vitest) applyVitest(draft);
  if (options.ui) applyUi(draft);
  if (options.eslint) applyEslint(draft);
  if (options.devtools) applyDevtools(draft);
  if (options.convex) applyConvex(draft);
  if (options.clerk) applyClerk(draft);
  if (options.convex || options.clerk) draft.files.set("src/providers.tsx", providersSource(draft));
  if (isStarter(options.template)) finishStarter(draft);

  const { files } = draft;
  files.set("src/vite-env.d.ts", viteEnvTypes(draft));
  files.set("tsconfig.json", json(draft.tsconfig));
  files.set(".gitignore", gitignore(options));
  const example = envExample(draft);
  if (example !== undefined) files.set(".env.example", example);
  if (isDuskBased(options.template)) files.set(".env.public", publicEnvExample(options));
  // pnpm 11 and later fails an install that skips a dependency's install script until it is allowed.
  if (options.packageManager === "pnpm")
    files.set("pnpm-workspace.yaml", "allowBuilds:\n  esbuild: true\n");
  files.set("package.json", json(manifest(draft)));
  const steps = [...draft.steps];
  files.set("README.md", readme(draft, steps));
  return {
    options,
    files,
    installCommands: installCommands(draft),
    steps,
    scripts: draft.scripts,
  };
}

/**
 * Every file of the generated project, keyed by relative path.
 *
 * @param options What to generate. Only `name` is required.
 * @returns A map of relative POSIX path to text. Nothing is written.
 * @example
 * projectFiles({ name: "app", tailwind: true }).get("src/index.css"); // '@import "tailwindcss";\n'
 * @since 1.0.0
 */
export function projectFiles(options: ScaffoldOptions): Map<string, string> {
  return buildProject(options).files;
}

/**
 * The names of the add-ons a project has, in canonical order.
 *
 * @example
 * addonsOf({ name: "app", biome: true, tailwind: true }); // ["tailwind", "biome"]
 * @since 1.0.0
 */
export function addonsOf(options: ScaffoldOptions): string[] {
  return enabledAddons(resolveOptions(options));
}
