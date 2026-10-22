import { type Draft, lines, when } from "./shared";

/**
 * What the three starters (`content`, `dashboard`, `api`) share. Each starter is a Dusk app: its
 * own module writes its files, then {@link finishStarter} settles the scripts the add-ons touched.
 */

/**
 * Writes a set of files into the draft.
 *
 * @param draft The project being composed.
 * @param files Relative POSIX path to content.
 * @since 1.0.0
 */
export function addFiles(draft: Draft, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) draft.files.set(path, text);
}

/**
 * Settles the scripts of a starter after the add-ons ran. A starter always has ESLint, so `lint`
 * runs ESLint; when Biome is chosen too, its check is the `check` script. The ESLint section of the
 * README then names `lint`.
 *
 * @param draft The project being composed.
 * @since 1.0.0
 */
export function finishStarter(draft: Draft): void {
  const { scripts } = draft;
  if (draft.options.biome) scripts["check"] = "biome check .";
  scripts["lint"] = "eslint .";
  delete scripts["lint:eslint"];
  for (const section of draft.sections) {
    if (section.heading === "ESLint") section.body = section.body.replaceAll("lint:eslint", "lint");
  }
}

/**
 * The display name of a site: the package name without its scope (`@me/notes` is `notes`).
 *
 * @param name The npm package name.
 * @returns The name to show in a header or a page title.
 * @since 1.0.0
 */
export function siteName(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

/**
 * `src/app.tsx` of a starter that draws pages: it imports the stylesheets and, when the devtools
 * add-on is on, mounts the inspector in development only. The routed page arrives as `children`.
 *
 * @param draft The project being composed.
 * @param styles The stylesheets to import, in order, as paths relative to `src`.
 * @returns The file text.
 * @since 1.0.0
 */
export function appSource(draft: Draft, styles: readonly string[]): string {
  const { devtools } = draft.options;
  return lines([
    ...when(devtools, 'import { isServer, type ParentProps } from "@shadow-js/web";'),
    ...when(!devtools, 'import type { ParentProps } from "@shadow-js/web";'),
    ...styles.map((path) => `import "${path}";`),
    "",
    ...when(
      devtools,
      "// The devtools exist in development, in the browser only.",
      "if (import.meta.env.DEV && !isServer) {",
      '  const { mountDevtools } = await import("@shadow-js/devtools");',
      "  mountDevtools();",
      "}",
      "",
    ),
    "/** The root component: wraps every page. The routed page arrives as `children`. */",
    "export default function App(props: ParentProps) {",
    "  return props.children;",
    "}",
  ]);
}
