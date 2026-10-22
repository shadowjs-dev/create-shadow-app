/**
 * The one place where the versions written into a generated project are decided.
 *
 * ShadowJS packages follow the release line (`^1.0.0`). Every third-party tool is pinned to the
 * exact version the ShadowJS repository itself builds and tests with, so a project made today
 * installs what the framework was verified against. `test/versions.test.ts` fails when a pin
 * drifts from the repository.
 */

/**
 * Range written for every `@shadow-js/*` package of the 1.x release line.
 *
 * @example
 * FRAMEWORK_RANGE; // "^1.0.0"
 * @since 1.0.0
 */
export const FRAMEWORK_RANGE = "^1.0.0";

/**
 * The ShadowJS packages a generated project can depend on.
 *
 * @example
 * FRAMEWORK_PACKAGES.includes("@shadow-js/dusk"); // true
 * @since 1.0.0
 */
export const FRAMEWORK_PACKAGES: readonly string[] = Object.freeze([
  "@shadow-js/core",
  "@shadow-js/web",
  "@shadow-js/vite",
  "@shadow-js/router",
  "@shadow-js/dusk",
  "@shadow-js/testing",
  "@shadow-js/convex",
  "@shadow-js/clerk",
  "@shadow-js/devtools",
  "@shadow-js/eslint-plugin",
  "@shadow-js/ui",
  "@shadow-js/primitives",
  "@shadow-js/query",
  "@shadow-js/table",
  "@shadow-js/forms",
]);

/**
 * Third-party packages and the exact version each is pinned to. Sources of truth in the
 * repository: the root `package.json` (vite via `@shadow-js/vite`, typescript, biome, vitest,
 * happy-dom, `@types/node`), `packages/convex`, `packages/clerk`, `packages/eslint-plugin` (eslint) and
 * `packages/ui` (tailwind, clsx, tailwind-merge, class-variance-authority).
 *
 * @example
 * THIRD_PARTY_VERSIONS.vite; // "8.3.3"
 * @since 1.0.0
 */
export const THIRD_PARTY_VERSIONS: Readonly<Record<string, string>> = Object.freeze({
  vite: "8.3.3",
  typescript: "7.0.2",
  // The optional peer of `@shadow-js/testing/dom`: npm does not install optional peers, and the
  // generated example test imports that subpath, so the vitest add-on installs it.
  "@testing-library/dom": "10.4.2",
  "@types/node": "24.19.1",
  "@biomejs/biome": "2.5.15",
  tailwindcss: "4.3.3",
  "@tailwindcss/vite": "4.3.3",
  vitest: "5.0.3",
  "happy-dom": "21.0.3",
  convex: "1.46.0",
  "@clerk/clerk-js": "6.38.1",
  "@clerk/backend": "3.23.1",
  "@clerk/ui": "1.39.1",
  // Clerk's UI engine renders with React: @clerk/ui declares react as a peer, so it is listed explicitly.
  react: "19.3.0",
  "react-dom": "19.3.0",
  eslint: "10.12.0",
  "class-variance-authority": "0.7.1",
  clsx: "2.1.1",
  "tailwind-merge": "3.7.0",
});

/**
 * Versions of everything a generated app depends on: ShadowJS packages as {@link FRAMEWORK_RANGE},
 * third-party tools as exact pins.
 *
 * @example
 * VERSIONS["@shadow-js/web"]; // "^1.0.0"
 * VERSIONS["vite"]; // "8.3.3"
 * @since 1.0.0
 */
export const VERSIONS: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(FRAMEWORK_PACKAGES.map((name) => [name, FRAMEWORK_RANGE])),
  ...THIRD_PARTY_VERSIONS,
});

/**
 * Looks a version up and fails loudly when the name is unknown, so a typo in a template cannot
 * silently write `undefined` into a manifest.
 *
 * @param name Package name.
 * @returns Its version range.
 * @throws Error for a package that has no entry in {@link VERSIONS}.
 * @example
 * versionOf("tailwindcss"); // "4.3.3"
 * @since 1.0.0
 */
export function versionOf(name: string): string {
  const version = VERSIONS[name];
  if (version === undefined) throw new Error(`No version is pinned for "${name}".`);
  return version;
}
