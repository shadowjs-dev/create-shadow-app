import { isAbsolute, relative } from "node:path";
import type { LocalManifest, PackageManager, PackedPackage } from "./options";

/**
 * Using ShadowJS before it is published: `npm run pack:local` in the ShadowJS repository writes
 * tarballs and a `manifest.json`; the generated project depends on those tarballs through `file:`
 * specifiers. This is the same logic as `tools/local/lib.mjs` of the repository, written again
 * here because this package must not import from the repository's tooling.
 */

/**
 * True for the names this repository publishes: `@shadow-js/*` and `create-shadow-app`.
 *
 * @example
 * isShadowPackage("@shadow-js/core"); // true
 * isShadowPackage("react"); // false
 * @since 1.0.0
 */
export function isShadowPackage(name: string): boolean {
  return name.startsWith("@shadow-js/") || name === "create-shadow-app";
}

/**
 * npm's own tarball file name.
 *
 * @example
 * tarballName("@shadow-js/core", "1.0.0"); // "shadow-js-core-1.0.0.tgz"
 * @since 1.0.0
 */
export function tarballName(name: string, version: string): string {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

/** Forward slashes only: npm and the other managers read `file:` paths on every platform that way. */
function posix(path: string): string {
  return path.replaceAll("\\", "/");
}

/**
 * The `file:` specifier of a tarball: relative to `from` when it is near, absolute otherwise (a
 * path that climbs three levels is harder to read than the absolute one).
 *
 * @param tarball Path of the tarball.
 * @param from Absolute directory of the project, if known.
 * @returns For example `file:../.pack/shadow-js-core-1.0.0.tgz`.
 * @example
 * fileSpec("/work/.pack/shadow-js-core-1.0.0.tgz", "/work/app"); // "file:../.pack/shadow-js-core-1.0.0.tgz"
 * @since 1.0.0
 */
export function fileSpec(tarball: string, from?: string): string {
  if (from === undefined || !isAbsolute(tarball)) return `file:${posix(tarball)}`;
  const rel = posix(relative(from, tarball));
  if (rel === "" || isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.startsWith("../../../")) {
    return `file:${posix(tarball)}`;
  }
  return `file:${rel.startsWith(".") ? rel : `./${rel}`}`;
}

/**
 * Maps every packed package to its `file:` specifier. Used both as direct dependencies and as
 * overrides, so a package that depends on another ShadowJS package (the Vite plugin on the
 * compiler) resolves it from the tarball instead of the registry.
 *
 * @example
 * overridesFor({ packages: [{ name: "@shadow-js/core", version: "1.0.0", tarball: "/pack/core.tgz" }] });
 * // { "@shadow-js/core": "file:/pack/core.tgz" }
 * @since 1.0.0
 */
export function overridesFor(manifest: LocalManifest, from?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of manifest.packages) out[entry.name] = fileSpec(entry.tarball, from);
  return out;
}

/**
 * The ShadowJS packages each package needs installed next to it (its dependencies and peers).
 *
 * @example
 * FRAMEWORK_REQUIRES["@shadow-js/web"]; // ["@shadow-js/core"]
 * @since 1.0.0
 */
export const FRAMEWORK_REQUIRES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "@shadow-js/core": [],
  "@shadow-js/compiler": [],
  "@shadow-js/web": ["@shadow-js/core"],
  "@shadow-js/vite": ["@shadow-js/compiler"],
  "@shadow-js/router": ["@shadow-js/core", "@shadow-js/web"],
  "@shadow-js/dusk": [
    "@shadow-js/vite",
    "@shadow-js/core",
    "@shadow-js/web",
    "@shadow-js/router",
    "@shadow-js/query",
  ],
  "@shadow-js/query": ["@shadow-js/core"],
  "@shadow-js/testing": ["@shadow-js/core", "@shadow-js/web"],
  "@shadow-js/convex": ["@shadow-js/core"],
  "@shadow-js/clerk": ["@shadow-js/core", "@shadow-js/web"],
  "@shadow-js/devtools": ["@shadow-js/core", "@shadow-js/web"],
  "@shadow-js/eslint-plugin": [],
  "@shadow-js/primitives": ["@shadow-js/core", "@shadow-js/web"],
  "@shadow-js/table": ["@shadow-js/core", "@shadow-js/web"],
  "@shadow-js/forms": ["@shadow-js/core", "@shadow-js/web"],
  "@shadow-js/ui": [
    "@shadow-js/core",
    "@shadow-js/web",
    "@shadow-js/primitives",
    "@shadow-js/table",
  ],
});

/** Dependency sections a project's package.json can hold ShadowJS packages in. @since 1.0.0 */
export interface DependencySections {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
}

/** What {@link applyLocal} produces. @since 1.0.0 */
export interface LocalResult {
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
  /** Every packed package, as `file:` specifiers. Goes under the package manager's override field. */
  readonly overrides: Record<string, string>;
  /** Names that were switched to a tarball. */
  readonly changed: readonly string[];
  /** The registry range each switched dependency had, for `local:install --restore`. */
  readonly saved: Readonly<Record<string, string | null>>;
}

/**
 * Switches every ShadowJS dependency of a project to its tarball.
 *
 * @param sections The project's dependencies with registry ranges.
 * @param manifest What `pack:local` wrote.
 * @param from Absolute directory of the project (for relative specifiers).
 * @returns New sections, the overrides to add and what changed.
 * @throws Error naming each ShadowJS package the project needs that was not packed, with the
 *   command that packs it.
 * @example
 * applyLocal({ dependencies: { "@shadow-js/core": "^1.0.0" }, devDependencies: {} }, manifest);
 * @since 1.0.0
 */
export function applyLocal(
  sections: DependencySections,
  manifest: LocalManifest,
  from?: string,
): LocalResult {
  const known = new Set(manifest.packages.map((entry) => entry.name));
  const specs = overridesFor(manifest, from);
  const wanted = new Set<string>();
  for (const section of [sections.dependencies, sections.devDependencies]) {
    for (const name of Object.keys(section)) if (isShadowPackage(name)) wanted.add(name);
  }
  const needed = new Set(wanted);
  for (const name of wanted) {
    for (const required of FRAMEWORK_REQUIRES[name] ?? []) needed.add(required);
  }
  const missing = [...needed].filter((name) => !known.has(name)).sort();
  if (missing.length > 0) {
    const short = missing.map((name) => name.replace(/^@shadow-js\//, "")).join(",");
    throw new Error(
      `The pack directory has no tarball for ${missing.join(", ")}. ` +
        `Run \`npm run pack:local -- --only ${short}\` (or without --only) in the ShadowJS repository, then try again.`,
    );
  }
  const saved: Record<string, string | null> = {};
  const changed: string[] = [];
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const rewrite = (
    source: Readonly<Record<string, string>>,
    into: Record<string, string>,
  ): void => {
    for (const [name, range] of Object.entries(source)) {
      const spec = isShadowPackage(name) ? specs[name] : undefined;
      if (spec === undefined) {
        into[name] = range;
        continue;
      }
      saved[name] = range;
      changed.push(name);
      into[name] = spec;
    }
  };
  rewrite(sections.dependencies, dependencies);
  rewrite(sections.devDependencies, devDependencies);
  return { dependencies, devDependencies, overrides: specs, changed: changed.sort(), saved };
}

/**
 * Where the manager reads overrides from. npm and Bun use `overrides`, pnpm `pnpm.overrides` and
 * Yarn `resolutions`.
 *
 * @example
 * overrideField("pnpm"); // "pnpm"
 * overrideField("npm"); // "overrides"
 * @since 1.0.0
 */
export function overrideField(
  packageManager: PackageManager,
): "overrides" | "pnpm" | "resolutions" {
  if (packageManager === "pnpm") return "pnpm";
  if (packageManager === "yarn") return "resolutions";
  return "overrides";
}

/**
 * The content of `.shadowjs-local.json`, the state file `npm run local:install -- <app> --restore`
 * in the ShadowJS repository reads to put the registry ranges back.
 *
 * @example
 * const state = localState({ dependencies: {}, devDependencies: {}, overrides: {}, changed: [], saved: { "@shadow-js/core": "^1.0.0" } });
 * JSON.parse(state).saved; // { "@shadow-js/core": "^1.0.0" }
 * @since 1.0.0
 */
export function localState(result: LocalResult): string {
  return `${JSON.stringify({ saved: result.saved, overrides: result.overrides }, null, 2)}\n`;
}

/** Why a `manifest.json` was refused. */
function invalid(file: string, reason: string): Error {
  return new Error(`${file} is not a pack manifest: ${reason}. Run \`npm run pack:local\` again.`);
}

/**
 * Validates the parsed content of a `manifest.json`.
 *
 * @param value Parsed JSON.
 * @param file Where it came from, for messages.
 * @returns The manifest with every entry checked.
 * @throws Error when the shape is wrong, a name is not a ShadowJS package or a path is not absolute.
 * @example
 * parseManifest({ packages: [{ name: "@shadow-js/core", version: "1.0.0", tarball: "/pack/core.tgz" }] }, "manifest.json").packages.length; // 1
 * parseManifest({ packages: [] }, "manifest.json"); // throws: manifest.json is not a pack manifest: it lists no package.
 * @since 1.0.0
 */
export function parseManifest(value: unknown, file: string): LocalManifest {
  if (typeof value !== "object" || value === null) throw invalid(file, "not an object");
  const list: unknown = Reflect.get(value, "packages");
  if (!Array.isArray(list)) throw invalid(file, 'no "packages" array');
  const packages: PackedPackage[] = [];
  for (const entry of list as unknown[]) {
    if (typeof entry !== "object" || entry === null)
      throw invalid(file, "an entry is not an object");
    const name: unknown = Reflect.get(entry, "name");
    const version: unknown = Reflect.get(entry, "version");
    const tarball: unknown = Reflect.get(entry, "tarball");
    if (typeof name !== "string" || !isShadowPackage(name)) {
      throw invalid(file, `"${String(name)}" is not a ShadowJS package`);
    }
    if (typeof version !== "string" || typeof tarball !== "string") {
      throw invalid(file, `${name} has no version or tarball`);
    }
    if (!isAbsolute(tarball) && !/^[A-Za-z]:[\\/]/.test(tarball)) {
      throw invalid(file, `the tarball of ${name} is not an absolute path`);
    }
    if (!tarball.endsWith(".tgz")) throw invalid(file, `the tarball of ${name} is not a .tgz`);
    packages.push({ name, version, tarball });
  }
  if (packages.length === 0) throw invalid(file, "it lists no package");
  return { packages };
}
