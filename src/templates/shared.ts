import type { ResolvedOptions } from "../options";
import { versionOf } from "../versions";

/** The files of a project: relative POSIX path to content. @since 1.0.0 */
export type FileMap = Map<string, string>;

/** One variable of `.env.example`. @since 1.0.0 */
export interface EnvEntry {
  readonly name: string;
  /** What the value is and where to get it. */
  readonly comment: string;
  /** Example value; empty for a secret you must fill in. */
  readonly example: string;
}

/** TypeScript compiler options of the generated `tsconfig.json`. @since 1.0.0 */
export interface TsConfigDraft {
  compilerOptions: Record<string, unknown>;
  include: string[];
}

/**
 * A project while it is being composed: the template starts it, each add-on contributes to it,
 * then {@link finish} turns it into files. Everything here is data; nothing touches the disk.
 *
 * @since 1.0.0
 */
export interface Draft {
  readonly options: ResolvedOptions;
  readonly files: FileMap;
  readonly scripts: Record<string, string>;
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
  readonly tsconfig: TsConfigDraft;
  readonly env: EnvEntry[];
  /** README sections added by add-ons: heading and Markdown body. */
  readonly sections: { heading: string; body: string }[];
  /** Folders and files the linters leave alone: code copied in from elsewhere (relative POSIX paths). */
  readonly ignored: string[];
  /** Commands that run next to the dev server (in a second terminal), for the "next steps" list. */
  readonly steps: string[];
}

const JSON_WIDTH = 100;

function scalar(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

/** Prints one value at `indent`, `prefix` being what precedes it on its first line. */
function print(value: unknown, indent: string, prefix: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const flat = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
    if (value.every(scalar) && indent.length + prefix.length + flat.length + 1 <= JSON_WIDTH) {
      return flat;
    }
    const inner = `${indent}  `;
    return `[\n${value.map((item) => `${inner}${print(item, inner, "")}`).join(",\n")}\n${indent}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
    if (entries.length === 0) return "{}";
    const inner = `${indent}  `;
    const body = entries.map(([key, entry]) => {
      const head = `${JSON.stringify(key)}: `;
      return `${inner}${head}${print(entry, inner, head)}`;
    });
    return `{\n${body.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/**
 * Serializes like `npm init` (two-space indentation, final newline), except that an array of
 * strings that fits on its line stays on it, which is also how Biome formats JSON: a generated
 * `tsconfig.json` passes `biome check` untouched.
 *
 * @since 1.0.0
 */
export function json(value: unknown): string {
  return `${print(value, "", "")}\n`;
}

/** Joins lines with `\n` and a final newline. Generated files never contain `\r`. @since 1.0.0 */
export function lines(parts: readonly string[]): string {
  return `${parts.join("\n")}\n`;
}

/** Adds a dependency at the pinned version of {@link VERSIONS}. @since 1.0.0 */
export function addDependency(draft: Draft, name: string): void {
  draft.dependencies[name] = versionOf(name);
}

/** Adds a development dependency at the pinned version of {@link VERSIONS}. @since 1.0.0 */
export function addDevDependency(draft: Draft, name: string): void {
  draft.devDependencies[name] = versionOf(name);
}

/** Starts a draft with the parts every project has. @since 1.0.0 */
export function createDraft(options: ResolvedOptions): Draft {
  return {
    options,
    files: new Map(),
    scripts: {},
    dependencies: {},
    devDependencies: {},
    tsconfig: {
      compilerOptions: {
        target: "ES2022",
        lib: ["ESNext", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "preserve",
        jsxImportSource: "@shadow-js/web",
        strict: true,
        noUncheckedIndexedAccess: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        noEmit: true,
        skipLibCheck: true,
        types: ["vite/client"],
      },
      include: ["src", "vite.config.ts"],
    },
    env: [],
    ignored: [],
    sections: [],
    steps: [],
  };
}

/** Adds `node` to the ambient types and installs `@types/node`, once. @since 1.0.0 */
export function needNodeTypes(draft: Draft): void {
  const types = draft.tsconfig.compilerOptions["types"];
  if (Array.isArray(types) && !types.includes("node")) types.push("node");
  addDevDependency(draft, "@types/node");
}

/** Adds a file to the `include` list of the tsconfig, once. @since 1.0.0 */
export function includeInTsconfig(draft: Draft, path: string): void {
  if (!draft.tsconfig.include.includes(path)) draft.tsconfig.include.push(path);
}

/** The shell command that runs a package script with the chosen manager. @since 1.0.0 */
export function runScript(
  packageManager: ResolvedOptions["packageManager"],
  script: string,
): string {
  if (packageManager === "npm") return `npm run ${script}`;
  if (packageManager === "yarn" || packageManager === "bun")
    return `${packageManager} run ${script}`;
  return `pnpm ${script}`;
}

/** The command that installs dependencies. @since 1.0.0 */
export function installCommand(packageManager: ResolvedOptions["packageManager"]): string {
  return `${packageManager} install`;
}

/** The command that runs a binary from the project (`npx`, `pnpm dlx`-free: local bins). @since 1.0.0 */
export function execCommand(packageManager: ResolvedOptions["packageManager"]): string {
  if (packageManager === "pnpm") return "pnpm exec";
  if (packageManager === "yarn") return "yarn";
  if (packageManager === "bun") return "bunx";
  return "npx";
}

/** The given lines when `condition` holds, else none. Keeps conditional lines inline. @since 1.0.0 */
export function when(condition: boolean, ...items: string[]): string[] {
  return condition ? items : [];
}

/** Class names of a utility-first or a plain-CSS build of the same markup. @since 1.0.0 */
export function cls(options: ResolvedOptions, tailwind: string, plain: string): string {
  return options.tailwind ? tailwind : plain;
}

/** Line width the generated Biome config (and the formatter used on templates) breaks at. */
export const LINE_WIDTH = 100;

/**
 * Prints a JSX element the way Biome does, so a generated file passes `biome check`: on one line
 * when it fits, otherwise with the opening tag on its own lines (one attribute per line) and the
 * children indented.
 *
 * @param indent Number of spaces the element is indented by.
 * @param tag Tag name.
 * @param attributes Attributes as written (`class="x"`, `onClick={fn}`).
 * @param children Text or a single expression on one line; omit for a self-closing element. With
 *   two or more attributes the children always go on their own line, as Biome prints them.
 * @returns The lines, already indented.
 * @since 1.0.0
 */
export function jsx(
  indent: number,
  tag: string,
  attributes: readonly string[],
  children?: string,
): string[] {
  const pad = " ".repeat(indent);
  const opening = `<${[tag, ...attributes].join(" ")}`;
  if (children === undefined) {
    const single = `${pad}${opening} />`;
    if (single.length <= LINE_WIDTH) return [single];
    return [`${pad}<${tag}`, ...attributes.map((attribute) => `${pad}  ${attribute}`), `${pad}/>`];
  }
  // Biome keeps children on the opening line only when there is at most one attribute.
  const single = `${pad}${opening}>${children}</${tag}>`;
  if (attributes.length <= 1 && single.length <= LINE_WIDTH) return [single];
  const head =
    `${pad}${opening}>`.length <= LINE_WIDTH
      ? [`${pad}${opening}>`]
      : [`${pad}<${tag}`, ...attributes.map((attribute) => `${pad}  ${attribute}`), `${pad}>`];
  return [...head, `${pad}  ${children}`, `${pad}</${tag}>`];
}

/**
 * Prints a stylesheet with one declaration per line, the way Biome formats CSS.
 *
 * @param rules Selector to declarations (without the semicolon).
 * @returns The CSS text.
 * @since 1.0.0
 */
export function css(rules: Readonly<Record<string, readonly string[]>>): string {
  return lines(
    Object.entries(rules).flatMap(([selector, declarations]) => [
      `${selector} {`,
      ...declarations.map((declaration) => `  ${declaration};`),
      "}",
    ]),
  );
}
