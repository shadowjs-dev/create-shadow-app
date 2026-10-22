/** What a project is made of: a template plus independent add-ons. */

/**
 * The starting points. `spa` is a Vite single-page app, `dusk` is the full-stack framework, and
 * `content`, `dashboard` and `api` are Dusk apps with a purpose: a Markdown site, an admin shell and
 * an API without pages.
 *
 * @since 1.0.0
 */
export type TemplateName = "spa" | "dusk" | "content" | "dashboard" | "api";

/**
 * Every template, in the order the prompt lists them.
 *
 * @example
 * TEMPLATES; // ["spa", "dusk", "content", "dashboard", "api"]
 * @since 1.0.0
 */
export const TEMPLATES: readonly TemplateName[] = Object.freeze([
  "spa",
  "dusk",
  "content",
  "dashboard",
  "api",
] as const);

/** The templates that are Dusk apps with a purpose of their own. @since 1.0.0 */
export type StarterName = "content" | "dashboard" | "api";

/** What the prompt and the help say about a template. @since 1.0.0 */
export interface TemplateInfo {
  readonly name: TemplateName;
  /** One line that says what the template is. */
  readonly hint: string;
}

/**
 * The templates with the line the prompt shows next to each.
 *
 * @example
 * TEMPLATE_INFO.map((template) => template.name); // ["spa", "dusk", "content", "dashboard", "api"]
 * @since 1.0.0
 */
export const TEMPLATE_INFO: readonly TemplateInfo[] = Object.freeze([
  { name: "spa", hint: "Vite single-page app" },
  { name: "dusk", hint: "full stack: file routes, loaders, server functions, SSR" },
  { name: "content", hint: "content site: Markdown files, RSS, sitemap, prerendered pages" },
  { name: "dashboard", hint: "admin shell: sidebar, table, query, forms, typed server functions" },
  { name: "api", hint: "API only: apiRoutes, env validation, rate limiting, CORS, health route" },
]);

/**
 * Whether a template is built on Dusk: `dusk` itself and the three starters.
 *
 * @param template A template name.
 * @returns `true` for every template except `spa`.
 * @example
 * isDuskBased("api"); // true
 * @since 1.0.0
 */
export function isDuskBased(template: TemplateName): boolean {
  return template !== "spa";
}

/**
 * Whether a template is one of the three starters (`content`, `dashboard`, `api`).
 *
 * @param template A template name.
 * @returns `true` for a starter.
 * @example
 * isStarter("dashboard"); // true
 * @since 1.0.0
 */
export function isStarter(template: TemplateName): template is StarterName {
  return template === "content" || template === "dashboard" || template === "api";
}

/**
 * The deployment targets of the `dusk` template (`--adapter`). `node` writes `dist/node/server.mjs`;
 * every other name writes that platform's output (see `@shadow-js/dusk` adapters).
 * @example
 * ADAPTERS.includes("vercel"); // true
 * @since 1.0.0
 */
export const ADAPTERS: readonly AdapterName[] = Object.freeze([
  "node",
  "bun",
  "deno",
  "cloudflare",
  "vercel",
  "netlify",
  "tarout",
  "static",
]);

/** A deployment target name. @since 1.0.0 */
export type AdapterName =
  | "node"
  | "bun"
  | "deno"
  | "cloudflare"
  | "vercel"
  | "netlify"
  | "tarout"
  | "static";

/** The add-ons. Each can be combined with every template and with every other add-on. @since 1.0.0 */
export type AddonName =
  | "tailwind"
  | "biome"
  | "vitest"
  | "convex"
  | "clerk"
  | "ui"
  | "eslint"
  | "devtools";

/** Description of an add-on for prompts and help. @since 1.0.0 */
export interface AddonInfo {
  readonly name: AddonName;
  /** Short title. */
  readonly label: string;
  /** One line that says what it adds. */
  readonly hint: string;
  /** Whether it is on when the questions are skipped. */
  readonly defaultOn: boolean;
}

/**
 * All add-ons, in the canonical order they are applied.
 *
 * @example
 * ADDONS.find((addon) => addon.name === "biome")?.defaultOn; // true
 * @since 1.0.0
 */
export const ADDONS: readonly AddonInfo[] = Object.freeze([
  {
    name: "tailwind",
    label: "Tailwind CSS 4",
    hint: "@tailwindcss/vite and a stylesheet",
    defaultOn: false,
  },
  {
    name: "biome",
    label: "Biome",
    hint: "lint and format (biome.json, lint and format scripts)",
    defaultOn: true,
  },
  {
    name: "vitest",
    label: "Vitest",
    hint: "happy-dom, @shadow-js/testing and a passing example test",
    defaultOn: false,
  },
  {
    name: "ui",
    label: "shadow-ui",
    hint: "components.json, cn() helper and the theme (needs Tailwind)",
    defaultOn: false,
  },
  {
    name: "eslint",
    label: "ESLint",
    hint: "@shadow-js/eslint-plugin flat config (works with TypeScript 7)",
    defaultOn: false,
  },
  {
    name: "devtools",
    label: "Devtools",
    hint: "the reactive-graph inspector, in development only",
    defaultOn: false,
  },
  {
    name: "convex",
    label: "Convex",
    hint: "provider, schema, sample functions and env",
    defaultOn: false,
  },
  {
    name: "clerk",
    label: "Clerk",
    hint: "provider, sign-in and sign-up, protected route",
    defaultOn: false,
  },
]);

/** The JavaScript package managers a generated project can be installed with. @since 1.0.0 */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Every supported package manager.
 *
 * @example
 * PACKAGE_MANAGERS; // ["npm", "pnpm", "yarn", "bun"]
 * @since 1.0.0
 */
export const PACKAGE_MANAGERS: readonly PackageManager[] = Object.freeze([
  "npm",
  "pnpm",
  "yarn",
  "bun",
] as const);

/** One ShadowJS package packed into a tarball by `npm run pack:local`. @since 1.0.0 */
export interface PackedPackage {
  readonly name: string;
  readonly version: string;
  /** Path of the `.tgz`, absolute. */
  readonly tarball: string;
}

/** The `manifest.json` that `npm run pack:local` writes next to the tarballs. @since 1.0.0 */
export interface LocalManifest {
  readonly packages: readonly PackedPackage[];
}

/**
 * Use ShadowJS from local tarballs instead of the registry (see {@link ScaffoldOptions.local}).
 *
 * @since 1.0.0
 */
export interface LocalPack {
  /** What `pack:local` wrote. */
  readonly manifest: LocalManifest;
  /**
   * Absolute directory of the project that will be written. Tarballs below it are referenced by a
   * relative `file:` path, others by an absolute one. Omit it to always use absolute paths.
   */
  readonly from?: string | undefined;
}

/**
 * The choices for a generated project. Only `name` is required: the library has no other
 * defaults, so a missing add-on is off. (The command line asks, and defaults Biome on.)
 *
 * @since 1.0.0
 */
export interface ScaffoldOptions {
  /** The npm package name written to `package.json`. */
  name: string;
  /** `"spa"` (default), `"dusk"`, `"content"`, `"dashboard"` or `"api"`. */
  template?: TemplateName | undefined;
  /** Add Tailwind CSS 4 through its Vite plugin. */
  tailwind?: boolean | undefined;
  /** Add Biome as linter and formatter. */
  biome?: boolean | undefined;
  /** Add Vitest, happy-dom, `@shadow-js/testing` and an example test. */
  vitest?: boolean | undefined;
  /** Add Convex: provider, schema, sample functions. */
  convex?: boolean | undefined;
  /** Add Clerk: provider, sign-in and sign-up, a protected route. */
  clerk?: boolean | undefined;
  /** Add the `shadow-ui` scaffolding (`components.json`, `cn()`, theme). Implies Tailwind. */
  ui?: boolean | undefined;
  /** Add the ESLint flat config of `@shadow-js/eslint-plugin`. */
  eslint?: boolean | undefined;
  /** Mount the devtools in development only. */
  devtools?: boolean | undefined;
  /** `spa` only: client-side routing with `@shadow-js/router`. Clerk and Convex imply it. `dusk` always routes. */
  router?: boolean | undefined;
  /** `dusk` only: the deployment target (`@shadow-js/dusk` adapter). Default: the Node server, run by `dusk start`. */
  adapter?: AdapterName | undefined;
  /** Package manager the README and the next steps talk about. Default `"npm"`. */
  packageManager?: PackageManager | undefined;
  /** Install ShadowJS from local tarballs. */
  local?: LocalPack | undefined;
}

/** {@link ScaffoldOptions} with every choice made. @since 1.0.0 */
export interface ResolvedOptions {
  readonly name: string;
  readonly template: TemplateName;
  readonly tailwind: boolean;
  readonly biome: boolean;
  readonly vitest: boolean;
  readonly convex: boolean;
  readonly clerk: boolean;
  readonly ui: boolean;
  readonly eslint: boolean;
  readonly devtools: boolean;
  readonly router: boolean;
  readonly adapter: AdapterName | undefined;
  readonly packageManager: PackageManager;
  readonly local: LocalPack | undefined;
}

/**
 * Which add-ons each starter has built in (`always`, whatever the flags say) and which it can take
 * (`optional`). Every other add-on is refused for that starter.
 */
const STARTER_ADDONS: Readonly<
  Record<
    StarterName,
    { readonly always: readonly AddonName[]; readonly optional: readonly AddonName[] }
  >
> = Object.freeze({
  content: { always: ["vitest", "eslint"], optional: ["tailwind", "biome", "devtools"] },
  dashboard: { always: ["vitest", "eslint", "ui", "tailwind"], optional: ["biome", "devtools"] },
  api: { always: ["vitest", "eslint"], optional: ["biome"] },
});

/**
 * The add-ons a person can choose for a template. A starter builds in some (the smoke test and the
 * ESLint config are part of it) and cannot take others, so neither is offered.
 *
 * @param template A template name.
 * @returns The add-ons for the prompt, in canonical order.
 * @example
 * addonsFor("api").map((addon) => addon.name); // ["biome"]
 * @since 1.0.0
 */
export function addonsFor(template: TemplateName): readonly AddonInfo[] {
  if (!isStarter(template)) return ADDONS;
  const { optional } = STARTER_ADDONS[template];
  return ADDONS.filter((addon) => optional.includes(addon.name));
}

/**
 * Fills in defaults and the implications between choices:
 *
 * - `ui` needs Tailwind, so it turns Tailwind on;
 * - Clerk needs sign-in routes and Convex a page for its sample data, so a `spa` with either gets
 *   the router;
 * - a Dusk-based template always has a router;
 * - `content`, `dashboard` and `api` build in Vitest and ESLint (and `dashboard` shadow-ui with
 *   Tailwind), and refuse the add-ons that do not fit them (for example Convex, or Tailwind for `api`).
 *
 * @param options What the caller chose.
 * @returns Every choice as a boolean.
 * @throws Error for an unknown template or package manager, or for an add-on the template cannot take.
 * @example
 * resolveOptions({ name: "app", ui: true }).tailwind; // true
 * @since 1.0.0
 */
export function resolveOptions(options: ScaffoldOptions): ResolvedOptions {
  const template = options.template ?? "spa";
  if (!TEMPLATES.includes(template)) {
    throw new Error(
      `Unknown template "${String(template)}". Choose one of: ${TEMPLATES.join(", ")}.`,
    );
  }
  const packageManager = options.packageManager ?? "npm";
  if (!PACKAGE_MANAGERS.includes(packageManager)) {
    throw new Error(
      `Unknown package manager "${String(packageManager)}". Choose one of: ${PACKAGE_MANAGERS.join(", ")}.`,
    );
  }
  if (options.adapter !== undefined && !ADAPTERS.includes(options.adapter)) {
    throw new Error(
      `Unknown adapter "${String(options.adapter)}". Choose one of: ${ADAPTERS.join(", ")}.`,
    );
  }
  if (options.adapter !== undefined && template !== "dusk") {
    throw new Error("--adapter applies to the dusk template only.");
  }
  const built: readonly AddonName[] = isStarter(template) ? STARTER_ADDONS[template].always : [];
  if (isStarter(template)) {
    const { optional } = STARTER_ADDONS[template];
    for (const addon of ADDONS) {
      if (
        options[addon.name] === true &&
        !built.includes(addon.name) &&
        !optional.includes(addon.name)
      ) {
        throw new Error(`The ${template} template does not combine with --${addon.name}.`);
      }
    }
  }
  const chosen = (name: AddonName): boolean => options[name] === true || built.includes(name);
  const ui = chosen("ui");
  const clerk = chosen("clerk");
  const convex = chosen("convex");
  return {
    name: options.name,
    template,
    tailwind: chosen("tailwind") || ui,
    biome: chosen("biome"),
    vitest: chosen("vitest"),
    convex,
    clerk,
    ui,
    eslint: chosen("eslint"),
    devtools: chosen("devtools"),
    router: isDuskBased(template) || options.router === true || clerk || convex,
    adapter: options.adapter,
    packageManager,
    local: options.local,
  };
}

/**
 * The names of the add-ons that are on, in canonical order.
 *
 * @param options Resolved choices.
 * @returns For example `["tailwind", "biome"]`.
 * @example
 * enabledAddons(resolveOptions({ name: "a", biome: true })); // ["biome"]
 * @since 1.0.0
 */
export function enabledAddons(options: ResolvedOptions): AddonName[] {
  return ADDONS.filter((addon) => options[addon.name]).map((addon) => addon.name);
}
