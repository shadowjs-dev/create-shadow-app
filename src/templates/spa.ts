import { addDependency, addDevDependency, cls, css, type Draft, jsx, lines, when } from "./shared";
import { viteConfigSource } from "./vite-config";

/**
 * The `spa` template: a Vite single-page app that renders with `render()` from `@shadow-js/web`.
 * With the router add-on it routes in the browser with `@shadow-js/router`.
 */

const INDEX_HTML = (name: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

function mainSource(draft: Draft): string {
  const { options } = draft;
  const providers = options.convex || options.clerk;
  const render = providers
    ? [
        "render(",
        "  () => (",
        "    <Providers>",
        "      <App />",
        "    </Providers>",
        "  ),",
        "  root,",
        ");",
      ]
    : ["render(() => <App />, root);"];
  return lines([
    'import { render } from "@shadow-js/web";',
    'import { App } from "./App";',
    ...when(providers, 'import { Providers } from "./providers";'),
    'import "./index.css";',
    "",
    ...when(
      options.devtools,
      "// The devtools exist in development only; the production build drops this branch.",
      "if (import.meta.env.DEV) {",
      '  const { mountDevtools } = await import("@shadow-js/devtools");',
      "  mountDevtools();",
      "}",
      "",
    ),
    'const root = document.getElementById("app");',
    'if (root === null) throw new Error("Missing #app element");',
    "",
    ...render,
  ]);
}

function stylesheet(draft: Draft): string {
  const { options } = draft;
  if (options.tailwind) return '@import "tailwindcss";\n';
  return css({
    ":root": ["font-family: system-ui, sans-serif", "color-scheme: light dark"],
    ".app": ["max-width: 28rem", "margin: 0 auto", "padding: 2rem"],
    ".title": ["font-size: 1.875rem", "font-weight: 700"],
    ".button": ["padding: 0.5rem 1rem", "border-radius: 0.25rem", "cursor: pointer"],
    ...(options.router ? { ".nav": ["display: flex", "gap: 1rem", "margin-bottom: 1.5rem"] } : {}),
  });
}

/** The counter. `heading` is a `main`-level app, `section` a page inside a layout. */
function counter(draft: Draft, name: string, wrapper: "main" | "section"): string {
  const { options } = draft;
  const root =
    wrapper === "main"
      ? `<main class="${cls(options, "mx-auto max-w-md p-8 font-sans", "app")}">`
      : "<section>";
  return lines([
    'import { useMemo, useStore } from "@shadow-js/core";',
    'import { For, Show } from "@shadow-js/web";',
    "",
    `export function ${name}() {`,
    "  const [count, setCount] = useStore(0);",
    "  const squares = useMemo(() =>",
    "    Array.from({ length: Math.min(count(), 5) }, (_, i) => (i + 1) ** 2),",
    "  );",
    "",
    "  return (",
    `    ${root}`,
    `      <h1 class="${cls(options, "text-3xl font-bold", "title")}">ShadowJS</h1>`,
    "      <p>Count: {count()}</p>",
    ...jsx(
      6,
      "button",
      [
        'type="button"',
        `class="${cls(options, "rounded bg-black px-4 py-2 text-white", "button")}"`,
        "onClick={() => setCount((n) => n + 1)}",
      ],
      "Increment",
    ),
    "      <Show when={count() > 0} fallback={<p>Press the button.</p>}>",
    "        <ul>",
    "          <For each={squares()}>{(value) => <li>{value}</li>}</For>",
    "        </ul>",
    "      </Show>",
    `    </${wrapper}>`,
    "  );",
    "}",
  ]);
}

function routedFiles(draft: Draft): void {
  const { options, files } = draft;
  const { clerk, convex } = options;
  files.set(
    "src/App.tsx",
    lines([
      'import { onCleanup } from "@shadow-js/core";',
      'import { Outlet, type RouterOptions, RouterProvider } from "@shadow-js/router";',
      'import { createAppRouter } from "./router";',
      "",
      "/** The routed app. Pass a `history` (a memory history, say) to run it without a browser. */",
      'export function App(props: { history?: RouterOptions["history"] }) {',
      "  const router = createAppRouter(props.history);",
      "  onCleanup(() => router.dispose());",
      "  return (",
      "    <RouterProvider router={router}>",
      "      <Outlet />",
      "    </RouterProvider>",
      "  );",
      "}",
    ]),
  );
  const routes = [
    "home",
    "about",
    ...when(convex, "tasks"),
    ...when(clerk, "dashboard", "signIn", "signUp"),
    "missing",
  ];
  files.set(
    "src/router.tsx",
    lines([
      'import { createRouter, defineRoute, type RouterOptions } from "@shadow-js/router";',
      'import { About } from "./pages/About";',
      ...when(clerk, 'import { Dashboard } from "./pages/Dashboard";'),
      'import { Home } from "./pages/Home";',
      'import { Layout } from "./pages/Layout";',
      'import { NotFound } from "./pages/NotFound";',
      ...when(
        clerk,
        'import { SignInPage } from "./pages/SignIn";',
        'import { SignUpPage } from "./pages/SignUp";',
      ),
      ...when(convex, 'import { TasksPage } from "./pages/Tasks";'),
      "",
      'const home = defineRoute("/", { component: Home });',
      'const about = defineRoute("/about", { component: About });',
      ...when(convex, 'const tasks = defineRoute("/tasks", { component: TasksPage });'),
      ...when(
        clerk,
        'const dashboard = defineRoute("/dashboard", { component: Dashboard });',
        'const signIn = defineRoute("/sign-in", { component: SignInPage });',
        'const signUp = defineRoute("/sign-up", { component: SignUpPage });',
      ),
      'const missing = defineRoute("*", { component: NotFound });',
      'const root = defineRoute("", {',
      '  id: "root",',
      "  component: Layout,",
      `  children: [${routes.join(", ")}],`,
      "});",
      "",
      "/** Creates the router of the app. Tests pass a memory history. */",
      'export function createAppRouter(history?: RouterOptions["history"]) {',
      "  return createRouter({ routes: [root], ...(history === undefined ? {} : { history }) });",
      "}",
    ]),
  );
  files.set(
    "src/pages/Layout.tsx",
    lines([
      ...when(
        clerk,
        'import { SignedIn, SignedOut, SignInButton, UserButton } from "@shadow-js/clerk";',
      ),
      'import { A, Outlet } from "@shadow-js/router";',
      "",
      "export function Layout() {",
      "  return (",
      `    <main class="${cls(options, "mx-auto max-w-md p-8 font-sans", "app")}">`,
      `      <nav class="${cls(options, "mb-6 flex gap-4", "nav")}">`,
      '        <A to="/">Home</A>',
      '        <A to="/about">About</A>',
      ...when(convex, '        <A to="/tasks">Tasks</A>'),
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
      "      <Outlet />",
      "    </main>",
      "  );",
      "}",
    ]),
  );
  files.set("src/pages/Home.tsx", counter(draft, "Home", "section"));
  files.set(
    "src/pages/About.tsx",
    lines([
      "export function About() {",
      "  return (",
      "    <section>",
      `      <h1 class="${cls(options, "text-3xl font-bold", "title")}">About</h1>`,
      "      <p>A ShadowJS single-page app with client-side routing.</p>",
      "    </section>",
      "  );",
      "}",
    ]),
  );
  files.set(
    "src/pages/NotFound.tsx",
    lines([
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
    ]),
  );
}

/** Applies the `spa` template to a draft. @since 1.0.0 */
export function applySpa(draft: Draft): void {
  const { options, files, scripts } = draft;
  addDependency(draft, "@shadow-js/core");
  addDependency(draft, "@shadow-js/web");
  if (options.router) addDependency(draft, "@shadow-js/router");
  addDevDependency(draft, "@shadow-js/vite");
  addDevDependency(draft, "typescript");
  addDevDependency(draft, "vite");
  scripts["dev"] = "vite";
  scripts["build"] = "tsc --noEmit && vite build";
  scripts["preview"] = "vite preview";
  scripts["typecheck"] = "tsc --noEmit";

  files.set("index.html", INDEX_HTML(options.name));
  files.set("src/main.tsx", mainSource(draft));
  files.set("src/index.css", stylesheet(draft));
  if (options.router) routedFiles(draft);
  else files.set("src/App.tsx", counter(draft, "App", "main"));
  files.set("vite.config.ts", viteConfigSource(draft));
}
