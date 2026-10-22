import type { AdapterName, PackageManager } from "../options";
import { runScript } from "./shared";

/**
 * What the dusk template writes for each deployment target (`--adapter`): the import of the
 * adapter, the script that runs the emitted output locally, the script that deploys it, and the folder
 * the output is in. The commands are the platforms' own CLIs; none of them is added as a dependency.
 */

/**
 * One deployment target. Its `note` is written into the README; `{start}` and `{deploy}` in it stand
 * for the project's start and deploy commands, which name the package manager (see
 * {@link targetNote}).
 * @since 1.0.0
 */
export interface AdapterTarget {
  /** The subpath of `@shadow-js/dusk` the adapter comes from. */
  readonly subpath: string;
  /** The adapter's function, called in `vite.config.ts`. */
  readonly factory: string;
  /** Runs the output locally (`npm start`). */
  readonly start: string;
  /** Builds and deploys (`npm run deploy`), when the platform has a CLI for it. */
  readonly deploy?: string;
  /** The folder `dusk build` writes the output to. */
  readonly output: string;
  /** One line for the README. */
  readonly note: string;
}

/**
 * The target of a dusk app. Without `--adapter` the app uses the Node adapter, so `dusk start`
 * runs the production build. @since 1.0.0
 */
export function duskTarget(adapter: AdapterName | undefined): AdapterTarget {
  return ADAPTER_TARGETS[adapter ?? "node"];
}

/**
 * The README line for a target, with the start and deploy commands of the package manager filled in.
 *
 * @param adapter The deployment target, or `undefined` for the Node server.
 * @param packageManager The manager the project uses.
 * @returns The sentence, for example "`pnpm start` runs it".
 * @since 1.0.0
 */
export function targetNote(
  adapter: AdapterName | undefined,
  packageManager: PackageManager,
): string {
  // The notes already put the placeholders in backticks.
  return duskTarget(adapter)
    .note.replaceAll("{start}", runScript(packageManager, "start"))
    .replaceAll("{deploy}", runScript(packageManager, "deploy"));
}

/** The targets, by name. @since 1.0.0 */
export const ADAPTER_TARGETS: Readonly<Record<AdapterName, AdapterTarget>> = Object.freeze({
  node: {
    subpath: "node",
    factory: "node",
    start: "dusk start",
    output: "dist/node/server.mjs",
    note: "the Node server (`dist/node/server.mjs`); `{start}` (`dusk start`) runs it",
  },
  bun: {
    subpath: "bun",
    factory: "bun",
    start: "bun dist/bun/server.mjs",
    output: "dist/bun/server.mjs",
    note: "the Bun server (`dist/bun/server.mjs`); `{start}` runs it with `bun`",
  },
  deno: {
    subpath: "deno",
    factory: "deno",
    start: "deno run --allow-read --allow-env --allow-net dist/deno/server.mjs",
    output: "dist/deno/server.mjs",
    note: "the Deno server (`dist/deno/server.mjs`); `{start}` runs it with `deno`",
  },
  cloudflare: {
    subpath: "cloudflare",
    factory: "cloudflare",
    start: "npx wrangler dev -c dist/cloudflare/wrangler.toml",
    deploy: "dusk build && npx wrangler deploy -c dist/cloudflare/wrangler.toml",
    output: "dist/cloudflare",
    note: "a Cloudflare Worker (`dist/cloudflare/worker.mjs`, `wrangler.toml`); `{deploy}` deploys it",
  },
  vercel: {
    subpath: "vercel",
    factory: "vercel",
    start: "npx vercel dev",
    deploy: "dusk build && npx vercel deploy --prebuilt",
    output: ".vercel/output",
    note: "a Vercel Build Output (`.vercel/output`); `{deploy}` deploys it",
  },
  netlify: {
    subpath: "netlify",
    factory: "netlify",
    start: "cd dist/netlify && npx netlify dev",
    deploy: "dusk build && cd dist/netlify && npx netlify deploy --prod",
    output: "dist/netlify",
    note: "a Netlify site (`dist/netlify`, with `netlify.toml`); `{deploy}` deploys it",
  },
  tarout: {
    subpath: "tarout",
    factory: "tarout",
    start: "node dist/tarout/server.mjs",
    output: "dist/tarout/server.mjs",
    note: "the Tarout entry (`dist/tarout/server.mjs`); set the Tarout start script to it, and APP_URL to the address Tarout gives the app",
  },
  static: {
    subpath: "static",
    factory: "staticSite",
    start: "node serve-static.mjs",
    output: "dist/static",
    note: "static files (`dist/static`) for any file host; prerendered pages only",
  },
});
