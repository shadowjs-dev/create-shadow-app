import type { AdapterName } from "../options";
import { duskTarget } from "./adapters";
import {
  addDependency,
  addDevDependency,
  cls,
  css,
  type Draft,
  jsx,
  lines,
  needNodeTypes,
  when,
} from "./shared";
import { viteConfigSource } from "./vite-config";

/**
 * The `dusk` template: Dusk, the full-stack framework. File routes in `src/routes`
 * (a layout, pages with loaders, an API route, error and not-found pages), server functions in
 * `src/server`, the root component in `src/app.tsx` and the handler options in
 * `src/entry-server.ts`. The scripts run the `dusk` CLI; `dusk start` serves the production build.
 */

const DB = `/** An in-memory store that stands in for a database. Replace it with your own. */

/** A blog post. */
export interface Post {
  id: string;
  title: string;
  body: string;
}

const posts = new Map<string, Post>([
  [
    "1",
    { id: "1", title: "Hello, ShadowJS", body: "Loaders run on the server and in the browser." },
  ],
  [
    "2",
    { id: "2", title: "Server functions", body: "Call server code like a normal async function." },
  ],
]);

export function listPosts(): Post[] {
  return [...posts.values()];
}

export function findPost(id: string): Post | undefined {
  return posts.get(id);
}

export function insertPost(input: { title: string; body: string }): Post {
  const post = { id: String(posts.size + 1), ...input };
  posts.set(post.id, post);
  return post;
}
`;

const SCHEMA = `import type { StandardSchemaV1 } from "@shadow-js/dusk/server";

/** One problem found while validating input. */
export interface Issue {
  message: string;
  path?: string[];
}

/**
 * Builds a Standard Schema, the interface Zod, Valibot and ArkType also implement, so a server
 * function can take any of them as its \`input\`. This one has no dependency; swap it for a library
 * when your inputs grow.
 */
export function defineSchema<Output>(
  check: (input: unknown) => { value: Output } | { issues: Issue[] },
): StandardSchemaV1<unknown, Output> {
  return { "~standard": { version: 1, vendor: "app", validate: check } };
}

/** Reads a string field of an unknown value, trimmed, or reports why it is not usable. */
export function stringField(input: unknown, name: string, max: number, issues: Issue[]): string {
  const value: unknown =
    typeof input === "object" && input !== null ? Reflect.get(input, name) : undefined;
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ message: "Required", path: [name] });
    return "";
  }
  if (value.length > max) issues.push({ message: \`At most \${max} characters\`, path: [name] });
  return value.trim();
}
`;

const POSTS = `import { notFound, serverFn } from "@shadow-js/dusk/server";
import { findPost, insertPost, listPosts as readPosts } from "./db.server";
import { defineSchema, type Issue, stringField } from "./schema";

const postId = defineSchema<{ id: string }>((input) => {
  const issues: Issue[] = [];
  const id = stringField(input, "id", 32, issues);
  return issues.length > 0 ? { issues } : { value: { id } };
});

const newPost = defineSchema<{ title: string; body: string }>((input) => {
  const issues: Issue[] = [];
  const title = stringField(input, "title", 120, issues);
  const body = stringField(input, "body", 2000, issues);
  return issues.length > 0 ? { issues } : { value: { title, body } };
});

/** Lists the posts. GET: safe to call from a loader or to cache. */
export const listPosts = serverFn({ method: "GET" }, () => readPosts());

/** Reads one post; an unknown id renders the not-found page with status 404. */
export const getPost = serverFn({ method: "GET", input: postId }, ({ id }) => {
  const post = findPost(id);
  if (post === undefined) throw notFound();
  return post;
});

/** Creates a post. POST: the input is validated before this runs, and the CSRF check is on. */
export const createPost = serverFn({ input: newPost }, (input) => insertPost(input));
`;

const fieldClass = (options: Draft["options"]): string =>
  `class="${cls(options, "my-2 block w-full rounded border p-2", "field")}"`;

const buttonClass = (options: Draft["options"]): string =>
  `class="${cls(options, "rounded bg-black px-4 py-2 text-white", "button")}"`;

function appSource(draft: Draft): string {
  const { options } = draft;
  const providers = options.convex || options.clerk;
  return lines([
    ...when(options.devtools, 'import { isServer, type ParentProps } from "@shadow-js/web";'),
    ...when(!options.devtools, 'import type { ParentProps } from "@shadow-js/web";'),
    ...when(providers, 'import { Providers } from "./providers";'),
    'import "./index.css";',
    "",
    ...when(
      options.devtools,
      "// The devtools exist in development, in the browser only.",
      "if (import.meta.env.DEV && !isServer) {",
      '  const { mountDevtools } = await import("@shadow-js/devtools");',
      "  mountDevtools();",
      "}",
      "",
    ),
    "/** The root component: wraps every page. The routed page arrives as `children`. */",
    "export default function App(props: ParentProps) {",
    ...(providers
      ? ["  return <Providers>{props.children}</Providers>;"]
      : ["  return props.children;"]),
    "}",
  ]);
}

function stylesheet(draft: Draft): string {
  if (draft.options.tailwind) return '@import "tailwindcss";\n';
  return css({
    ":root": ["font-family: system-ui, sans-serif", "color-scheme: light dark"],
    ".shell": ["max-width: 40rem", "margin: 0 auto", "padding: 2rem"],
    ".nav": ["display: flex", "gap: 1rem", "margin-bottom: 1.5rem"],
    ".title": ["font-size: 1.875rem", "font-weight: 700"],
    ".button": ["padding: 0.5rem 1rem", "border-radius: 0.25rem", "cursor: pointer"],
    ".field": ["display: block", "margin: 0.5rem 0", "padding: 0.4rem", "width: 100%"],
  });
}

function layoutSource(draft: Draft): string {
  const { options } = draft;
  const { clerk } = options;
  return lines([
    ...when(
      clerk,
      'import { SignedIn, SignedOut, SignInButton, UserButton } from "@shadow-js/clerk";',
    ),
    'import type { Metadata, Viewport } from "@shadow-js/dusk";',
    'import { A, Outlet, type RouteErrorProps } from "@shadow-js/router";',
    'import { NotFound } from "../components/NotFound";',
    "",
    "/** The document head of every page: the title template and the description; pages set their own title. */",
    "export const metadata: Metadata = {",
    '  title: { default: "Dusk app", template: "%s · Dusk app" },',
    '  description: "A Dusk app.",',
    "};",
    "",
    'export const viewport: Viewport = { width: "device-width", initialScale: 1 };',
    "",
    "export default function Layout() {",
    "  return (",
    `    <div class="${cls(options, "mx-auto max-w-2xl p-8 font-sans", "shell")}">`,
    `      <nav class="${cls(options, "mb-6 flex gap-4", "nav")}">`,
    '        <A to="/">Home</A>',
    '        <A to="/posts">Posts</A>',
    '        <A to="/about">About</A>',
    ...when(options.convex, '        <A to="/tasks">Tasks</A>'),
    ...when(
      clerk,
      '        <A to="/dashboard">Dashboard</A>',
      "        <SignedOut>",
      "          <SignInButton />",
      "        </SignedOut>",
      "        <SignedIn>",
      "          <UserButton />",
      "        </SignedIn>",
    ),
    "      </nav>",
    "      <main>",
    "        <Outlet />",
    "      </main>",
    "    </div>",
    "  );",
    "}",
    "",
    '/** Shown in place of a page whose loader or component threw. "Try again" renders it again. */',
    "export function error(props: RouteErrorProps) {",
    "  return (",
    "    <section>",
    `      <h1 class="${cls(options, "text-3xl font-bold", "title")}">Something went wrong</h1>`,
    '      <p>{props.error instanceof Error ? props.error.message : "Unexpected error"}</p>',
    ...jsx(
      6,
      "button",
      [
        'type="button"',
        `class="${cls(options, "rounded bg-black px-4 py-2 text-white", "button")}"`,
        "onClick={props.reset}",
      ],
      "Try again",
    ),
    "    </section>",
    "  );",
    "}",
    "",
    "/** The fallback when notFound() is called where no closer route shows its own page. */",
    "export function notFound() {",
    "  return <NotFound />;",
    "}",
  ]);
}

function indexSource(draft: Draft): string {
  const { options } = draft;
  return lines([
    'import { useStore } from "@shadow-js/core";',
    'import type { Metadata } from "@shadow-js/dusk";',
    "",
    'export const metadata: Metadata = { title: "Home" };',
    "",
    "export default function Home() {",
    "  const [count, setCount] = useStore(0);",
    "  return (",
    "    <section>",
    `      <h1 class="${cls(options, "text-3xl font-bold", "title")}">Dusk</h1>`,
    "      <p>This page is rendered on the server and then made interactive in the browser.</p>",
    ...jsx(
      6,
      "button",
      [
        'type="button"',
        `class="${cls(options, "rounded bg-black px-4 py-2 text-white", "button")}"`,
        "onClick={() => setCount((n) => n + 1)}",
      ],
      "Clicked {count()} times",
    ),
    "    </section>",
    "  );",
    "}",
  ]);
}

function postsIndexSource(draft: Draft): string {
  const { options } = draft;
  return lines([
    'import { useStore } from "@shadow-js/core";',
    'import type { Metadata } from "@shadow-js/dusk";',
    'import { A, useLoaderData, useRouter } from "@shadow-js/router";',
    'import { For } from "@shadow-js/web";',
    'import { createPost, listPosts } from "../../server/posts";',
    "",
    'export const metadata: Metadata = { title: "Posts" };',
    "",
    "/** Runs on the server for the first request and in the browser for later navigations. */",
    "export const loader = () => listPosts(undefined);",
    "",
    "export default function Posts() {",
    "  const posts = useLoaderData<Awaited<ReturnType<typeof listPosts>>>();",
    "  const router = useRouter();",
    '  const [message, setMessage] = useStore("");',
    "",
    "  async function submit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {",
    "    event.preventDefault();",
    "    const form = event.currentTarget;",
    "    const data = new FormData(form);",
    "    try {",
    '      await createPost({ title: data.get("title"), body: data.get("body") });',
    "      form.reset();",
    '      setMessage("");',
    "      await router.invalidate();",
    "    } catch (error) {",
    '      setMessage(error instanceof Error ? error.message : "Could not save the post");',
    "    }",
    "  }",
    "",
    "  return (",
    "    <section>",
    `      <h1 class="${cls(options, "text-3xl font-bold", "title")}">Posts</h1>`,
    options.tailwind ? '      <ul class="my-4 list-disc pl-6">' : "      <ul>",
    "        <For each={posts() ?? []}>",
    "          {(post) => (",
    "            <li>",
    '              <A to="/posts/:id" params={{ id: post.id }}>',
    "                {post.title}",
    "              </A>",
    "            </li>",
    "          )}",
    "        </For>",
    "      </ul>",
    "      <form onSubmit={submit}>",
    ...jsx(8, "input", ['name="title"', 'placeholder="Title"', "required", fieldClass(options)]),
    ...jsx(8, "textarea", ['name="body"', 'placeholder="Body"', "required", fieldClass(options)]),
    ...jsx(8, "button", ['type="submit"', buttonClass(options)], "Add post"),
    '        <p role="alert">{message()}</p>',
    "      </form>",
    "    </section>",
    "  );",
    "}",
  ]);
}

function postSource(draft: Draft): string {
  const { options } = draft;
  return lines([
    'import type { MetadataArgs } from "@shadow-js/dusk";',
    'import { useLoaderData } from "@shadow-js/router";',
    'import { NotFound } from "../../components/NotFound";',
    'import { getPost } from "../../server/posts";',
    "",
    "export const loader = ({ params }: { params: { id: string } }) => getPost({ id: params.id });",
    "",
    "type PostArgs = MetadataArgs<{ id: string }, { title: string }>;",
    "",
    "export const generateMetadata = ({ loaderData }: PostArgs) => ({",
    '  title: loaderData?.title ?? "Post",',
    "});",
    "",
    "/** Shown, with a 404, when getPost() calls notFound() for an unknown id. */",
    "export function notFound() {",
    "  return <NotFound />;",
    "}",
    "",
    "export default function Post() {",
    "  const post = useLoaderData<Awaited<ReturnType<typeof getPost>>>();",
    "  return (",
    "    <article>",
    `      <h1 class="${cls(options, "text-3xl font-bold", "title")}">{post()?.title}</h1>`,
    "      <p>{post()?.body}</p>",
    "    </article>",
    "  );",
    "}",
  ]);
}

const CATCH_ALL = lines([
  'import { notFound as raiseNotFound } from "@shadow-js/router";',
  'import { NotFound } from "../components/NotFound";',
  "",
  "/** Matches every URL no other route matches and answers it with a 404 and the not-found page. */",
  "export const beforeLoad = () => {",
  "  throw raiseNotFound();",
  "};",
  "",
  "export function notFound() {",
  "  return <NotFound />;",
  "}",
  "",
  "export default function Missing() {",
  "  return null;",
  "}",
]);

function notFoundComponent(draft: Draft): string {
  const { options } = draft;
  return lines([
    'import { A } from "@shadow-js/router";',
    "",
    "export function NotFound() {",
    "  return (",
    "    <section>",
    `      <h1 class="${cls(options, "text-3xl font-bold", "title")}">Page not found</h1>`,
    '      <A to="/">Back to the start</A>',
    "    </section>",
    "  );",
    "}",
  ]);
}

function aboutSource(draft: Draft): string {
  const { options } = draft;
  return lines([
    'import type { Metadata } from "@shadow-js/dusk";',
    "",
    'export const metadata: Metadata = { title: "About" };',
    "",
    "export default function About() {",
    "  return (",
    "    <section>",
    `      <h1 class="${cls(options, "text-3xl font-bold", "title")}">About</h1>`,
    "      <p>Routes are files: this page is src/routes/about.tsx.</p>",
    "    </section>",
    "  );",
    "}",
  ]);
}

const HEALTH = lines([
  'import { json, type RequestEvent } from "@shadow-js/dusk/server";',
  "",
  "/** GET /api/health: an API route is a file that exports HTTP-method handlers. */",
  "export const GET = (event: RequestEvent) => json({ ok: true, id: event.id });",
]);

/**
 * The `allowedHosts` lines of the handler options. Production answers only for the host of `APP_URL`. Tarout's health check calls the
 * container on `127.0.0.1` (its port, with `Host: 127.0.0.1:<port>`) and wants a 200, so that app also answers for that host.
 */
function hostLines(adapter: AdapterName | undefined): string[] {
  if (adapter === "tarout") {
    return [
      "    // The Host header is attacker input: production answers only for the hosts of APP_URL, and for 127.0.0.1, which Tarout's",
      "    // health check uses (it calls the container on its own port).",
      '    ...(import.meta.env.PROD ? { allowedHosts: [appUrl.hostname, "127.0.0.1"] } : {}),',
    ];
  }
  return [
    "    // The Host header is attacker input: production answers only for the hosts of APP_URL.",
    "    ...(import.meta.env.PROD ? { allowedHosts: [appUrl.hostname] } : {}),",
  ];
}

function entryServerSource(draft: Draft): string {
  const { options } = draft;
  const { clerk } = options;
  if (!clerk) {
    return lines([
      'import type { HandlerOptions } from "@shadow-js/dusk/server";',
      "",
      'const appUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");',
      "",
      "/** Options of the request handler. Everything here has a safe default; see the Dusk docs. */",
      "export const options = {",
      "  security: {",
      ...hostLines(options.adapter),
      "    // Sent on https responses only. CSRF checks, secure headers and body limits are on by default.",
      "    headers: { hsts: { maxAge: 63_072_000, includeSubDomains: true } },",
      "    // A strict Content-Security-Policy with a fresh nonce per request. Production only: the dev server",
      "    // injects inline scripts. Add sources by directive when you load something from another origin.",
      "    ...(import.meta.env.PROD ? { csp: {} } : {}),",
      "  },",
      '} satisfies Omit<HandlerOptions, "manifest">;',
      "",
      "export default options;",
    ]);
  }
  return lines([
    'import { clerkMiddleware, createRouteMatcher, getAuth } from "@shadow-js/clerk/server";',
    'import type { HandlerOptions, Middleware } from "@shadow-js/dusk/server";',
    "",
    'const appUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");',
    "// Every page that needs a signed-in user. The matcher compares the same canonical path the router uses",
    "// (case, percent-encoding and trailing slashes included), so `/DASHBOARD` and `/%64ashboard` are covered too.",
    'const isProtected = createRouteMatcher(["/dashboard(.*)"]);',
    "",
    "let authenticate: ReturnType<typeof clerkMiddleware> | undefined;",
    "",
    "/** Verifies the Clerk session of every request. It is created on first use, so a build needs no keys. */",
    "const withClerk: Middleware = (event, next) => {",
    "  authenticate ??= clerkMiddleware({",
    '    secretKey: process.env.CLERK_SECRET_KEY ?? "",',
    '    publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "",',
    "    authorizedParties: [appUrl.origin],",
    "  });",
    "  return authenticate(event, next);",
    "};",
    "",
    "/** Sends signed-out visitors away from the protected pages before any of their code runs. */",
    "const protectPages: Middleware = (event, next) => {",
    "  if (isProtected(event.request) && getAuth(event)?.isSignedIn !== true) {",
    '    return Promise.resolve(Response.redirect(new URL("/sign-in", event.url), 302));',
    "  }",
    "  return next();",
    "};",
    "",
    "/** Options of the request handler. Everything here has a safe default; see the Dusk docs. */",
    "export const options = {",
    "  middleware: [withClerk, protectPages],",
    "  security: {",
    ...hostLines(options.adapter),
    "    // Sent on https responses only. CSRF checks, secure headers and body limits are on by default.",
    "    headers: { hsts: { maxAge: 63_072_000, includeSubDomains: true } },",
    "    // Clerk loads its scripts and talks to its API from the frontend API host of your key. Report-only until",
    "    // you add that host to script-src, connect-src, img-src and frame-src; then drop `reportOnly` to enforce.",
    "    ...(import.meta.env.PROD ? { csp: { reportOnly: true } } : {}),",
    "  },",
    '} satisfies Omit<HandlerOptions, "manifest">;',
    "",
    "export default options;",
  ]);
}

/**
 * `dusk.config.ts`: the declarative configuration (routing rules, headers, route rules). The build reads it
 * and checks it; the server reads the same values. Secrets never go in this file (see the config guide).
 *
 * The static target emits prerendered pages only, so its home page is prerendered too; the other
 * targets serve `/` from the server and prerender `/about` alone.
 */
function duskConfig(adapter: AdapterName | undefined): string {
  const pages = adapter === "static" ? ["/", "/about"] : ["/about"];
  return [
    'import { defineConfig } from "@shadow-js/dusk/vite";',
    "",
    "export default defineConfig({",
    '  redirects: [{ source: "/home", destination: "/", permanent: true }],',
    '  headers: [{ source: "/api/**", headers: { "x-content-type-options": "nosniff" } }],',
    "  routeRules: {",
    ...pages.map((page) => `    ${JSON.stringify(page)}: { prerender: true },`),
    "  },",
    "});",
    "",
  ].join("\n");
}

/**
 * `serve-static.mjs`, the start script of the static target. Its own server, because `vite preview`
 * answers no directory index for the app (the Dusk plugin sets `appType` to `custom`): `/` and
 * `/about` would be 404 there. `serve` answers a directory with its `index.html`.
 */
const STATIC_SERVER = [
  "// Serves dist/static, the prerendered pages and their assets, for the start script. PORT and HOST choose the",
  "// address. A directory answers with its index.html; anything else is a 404.",
  'import { serve } from "@shadow-js/dusk/node";',
  "",
  "const handler = {",
  "  fetch: async () =>",
  '    new Response("Not found", {',
  "      status: 404,",
  '      headers: { "content-type": "text/plain; charset=utf-8" },',
  "    }),",
  "};",
  "",
  "await serve(handler, {",
  "  port: Number(process.env.PORT ?? 3000),",
  '  host: process.env.HOST ?? "127.0.0.1",',
  '  static: { dir: "dist/static", index: "index.html", extensions: [".html"] },',
  "});",
  "",
].join("\n");

/**
 * What every Dusk-based template shares: the dependencies, the scripts, the `~/` alias and the Vite
 * config. The `dusk` template and the three starters call it first.
 *
 * @since 1.0.0
 */
export function applyDuskBase(draft: Draft): void {
  const { files, scripts } = draft;
  // `~/` names the source folder; the Dusk plugin gives Vite the same alias (dusk/src/vite/plugin.ts).
  draft.tsconfig.compilerOptions["paths"] = { "~/*": ["./src/*"] };
  addDependency(draft, "@shadow-js/core");
  addDependency(draft, "@shadow-js/web");
  addDependency(draft, "@shadow-js/router");
  addDependency(draft, "@shadow-js/dusk");
  addDevDependency(draft, "@shadow-js/vite");
  addDevDependency(draft, "typescript");
  addDevDependency(draft, "vite");
  needNodeTypes(draft);
  const target = duskTarget(draft.options.adapter);
  scripts["dev"] = "dusk dev";
  scripts["build"] = "dusk build";
  scripts["start"] = target.start;
  if (target.deploy !== undefined) scripts["deploy"] = target.deploy;
  scripts["typecheck"] = "tsc --noEmit";
  files.set("vite.config.ts", viteConfigSource(draft));
}

/** Applies the `dusk` template to a draft. @since 1.0.0 */
export function applyDusk(draft: Draft): void {
  const { files } = draft;
  applyDuskBase(draft);
  files.set("dusk.config.ts", duskConfig(draft.options.adapter));
  if (draft.options.adapter === "static") files.set("serve-static.mjs", STATIC_SERVER);
  files.set("src/app.tsx", appSource(draft));
  files.set("src/index.css", stylesheet(draft));
  files.set("src/entry-server.ts", entryServerSource(draft));
  files.set("src/routes/_layout.tsx", layoutSource(draft));
  files.set("src/routes/index.tsx", indexSource(draft));
  files.set("src/routes/about.tsx", aboutSource(draft));
  files.set("src/routes/posts/index.tsx", postsIndexSource(draft));
  files.set("src/routes/posts/[id].tsx", postSource(draft));
  files.set("src/routes/[...rest].tsx", CATCH_ALL);
  files.set("src/components/NotFound.tsx", notFoundComponent(draft));
  files.set("src/routes/api/health.ts", HEALTH);
  files.set("src/server/db.server.ts", DB);
  files.set("src/server/schema.ts", SCHEMA);
  files.set("src/server/posts.ts", POSTS);
}
