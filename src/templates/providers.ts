import { type Draft, lines, when } from "./shared";

/**
 * `src/providers.tsx`: the Convex and Clerk providers, nested in the right order (Clerk outside,
 * Convex inside, so Convex can ask Clerk for its token). The `spa` template renders it around
 * `<App />` in `main.tsx`; `dusk` renders it in `app.tsx`.
 *
 * On the Dusk server there is no browser, so no Convex socket is opened: the provider is left
 * out there and a query is fetched once by the server render (see the Convex guide).
 */

/** `src/lib/env.ts`: reads a variable and fails with the fix instead of a vague error later. */
export const ENV_HELPER = `/** Returns a required variable, or throws an error that says how to set it. */
export function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(\`\${name} is not set. Copy .env.example to .env.local and fill it in.\`);
  }
  return value;
}
`;

/** What the visitor sees when Clerk cannot be loaded (a wrong key, no network): the reason, and a retry. */
const CLERK_FAILED = [
  "function clerkFailed(error: unknown, reset: () => void) {",
  "  return (",
  '    <div role="alert">',
  "      <p>Clerk could not be loaded: {error instanceof Error ? error.message : String(error)}</p>",
  '      <button type="button" onClick={reset}>',
  "        Try again",
  "      </button>",
  "    </div>",
  "  );",
  "}",
];

/**
 * A named import as Biome prints it: on one line while that fits in 100 columns, else one name per
 * line, so a generated project passes `biome check` untouched.
 */
function namedImport(names: readonly string[], from: string): string {
  const one = `import { ${names.join(", ")} } from "${from}";`;
  if (one.length <= 100) return one;
  return ["import {", ...names.map((name) => `  ${name},`), `} from "${from}";`].join("\n");
}

/** The text of `src/providers.tsx` for a draft that has Convex, Clerk or both. @since 1.0.0 */
export function providersSource(draft: Draft): string {
  const { options } = draft;
  const dusk = options.template === "dusk";
  const { convex, clerk } = options;

  const clerkImports = ["ClerkProvider", ...when(convex, "clerkConvexAuth")];
  const convexImports = [
    ...when(dusk && convex, "type ConvexClientLike"),
    ...when(convex && !clerk, "ConvexProvider"),
    ...when(convex && clerk, "ConvexProviderWithAuth"),
    ...when(convex, "createConvexClient"),
  ];

  const header: string[] = [];
  if (clerk) header.push(namedImport(clerkImports, "@shadow-js/clerk"));
  if (convex) header.push(namedImport(convexImports, "@shadow-js/convex"));
  const webNames = [
    ...when(clerk, "ErrorBoundary"),
    ...when(dusk && convex, "isServer"),
    "type ParentProps",
  ];
  header.push(
    webNames.length === 1
      ? 'import type { ParentProps } from "@shadow-js/web";'
      : `import { ${webNames.join(", ")} } from "@shadow-js/web";`,
  );
  header.push('import { requireEnv } from "./lib/env";');

  const setup: string[] = [];
  if (convex) {
    const create =
      'createConvexClient(requireEnv("VITE_CONVEX_URL", import.meta.env.VITE_CONVEX_URL))';
    setup.push(
      dusk
        ? [
            "// No socket on the server: the page is rendered once, the browser then subscribes. The stand-in",
            "// never connects, and it keeps the provider tree the same on both sides, so hydration keys match.",
            "const serverConvex: ConvexClientLike = {",
            "  onUpdate: () => () => undefined,",
            '  mutation: () => Promise.reject(new Error("Mutations run in the browser, not on the server.")),',
            '  action: () => Promise.reject(new Error("Actions run in the browser, not on the server.")),',
            "  setAuth: () => undefined,",
            "};",
            "const convex: ConvexClientLike = isServer",
            "  ? serverConvex",
            `  : ${create};`,
          ].join("\n")
        : `const convex = ${create};`,
    );
  }
  if (clerk) {
    setup.push(
      "const publishableKey = requireEnv(",
      '  "VITE_CLERK_PUBLISHABLE_KEY",',
      "  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,",
      ");",
      "const loadOptions = {",
      '  signInUrl: "/sign-in",',
      '  signUpUrl: "/sign-up",',
      '  signInFallbackRedirectUrl: "/dashboard",',
      '  signUpFallbackRedirectUrl: "/dashboard",',
      "};",
    );
    if (convex) {
      setup.push(
        '// Convex asks Clerk for a token made from the JWT template named "convex".',
        'const useConvexAuth = clerkConvexAuth({ template: "convex" });',
      );
    }
  }

  const body: string[] = [];
  if (convex && clerk) {
    body.push(
      "function ConvexBridge(props: ParentProps) {",
      "  return (",
      "    <ConvexProviderWithAuth client={convex} useAuth={useConvexAuth}>",
      "      {props.children}",
      "    </ConvexProviderWithAuth>",
      "  );",
      "}",
      "",
      ...CLERK_FAILED,
      "",
      "export function Providers(props: ParentProps) {",
      "  return (",
      "    <ErrorBoundary fallback={clerkFailed}>",
      "      <ClerkProvider publishableKey={publishableKey} loadOptions={loadOptions}>",
      "        <ConvexBridge>{props.children}</ConvexBridge>",
      "      </ClerkProvider>",
      "    </ErrorBoundary>",
      "  );",
      "}",
    );
  } else if (clerk) {
    body.push(
      ...CLERK_FAILED,
      "",
      "export function Providers(props: ParentProps) {",
      "  return (",
      "    <ErrorBoundary fallback={clerkFailed}>",
      "      <ClerkProvider publishableKey={publishableKey} loadOptions={loadOptions}>",
      "        {props.children}",
      "      </ClerkProvider>",
      "    </ErrorBoundary>",
      "  );",
      "}",
    );
  } else {
    body.push(
      "export function Providers(props: ParentProps) {",
      "  return <ConvexProvider client={convex}>{props.children}</ConvexProvider>;",
      "}",
    );
  }
  return lines([...header, "", ...setup, "", ...body]);
}
