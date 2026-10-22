import { ENV_HELPER } from "../templates/providers";
import { addDependency, cls, type Draft, execCommand, lines } from "../templates/shared";
import { convexAuthConfig } from "./convex";

/**
 * Clerk: the provider (see `src/providers.tsx`), sign-in and sign-up pages, a protected
 * dashboard and, for Dusk, the server side: a middleware that verifies the session of every
 * request, a gate for the protected paths and a server function that checks the user.
 *
 * @since 1.0.0
 */

const SIGN_IN = lines([
  'import { SignIn } from "@shadow-js/clerk";',
  "",
  "export function SignInPage() {",
  '  return <SignIn routing="hash" />;',
  "}",
]);

const SIGN_UP = lines([
  'import { SignUp } from "@shadow-js/clerk";',
  "",
  "export function SignUpPage() {",
  '  return <SignUp routing="hash" />;',
  "}",
]);

function dashboardSpa(draft: Draft): string {
  const { options } = draft;
  return lines([
    'import { RedirectToSignIn, SignedIn, SignedOut, useUser } from "@shadow-js/clerk";',
    "",
    "export function Dashboard() {",
    "  const { user } = useUser();",
    "  return (",
    "    <>",
    "      <SignedIn>",
    `        <h1 class="${cls(options, "text-3xl font-bold", "title")}">Dashboard</h1>`,
    "        <p>Signed in as {user()?.id}.</p>",
    "      </SignedIn>",
    "      <SignedOut>",
    '        <RedirectToSignIn redirectUrl="/dashboard" />',
    "      </SignedOut>",
    "    </>",
    "  );",
    "}",
  ]);
}

const AUTH_SERVER = lines([
  'import { getAuth } from "@shadow-js/clerk/server";',
  'import { redirect, serverFn } from "@shadow-js/dusk/server";',
  "",
  "/**",
  " * Answers with the signed-in user, or redirects to the sign-in page. Loaders of protected pages",
  " * call it, so a client-side navigation is checked on the server too: the middleware in",
  " * entry-server.ts only sees full page requests.",
  " */",
  'export const requireUser = serverFn({ method: "GET" }, (_input, event) => {',
  "  const auth = getAuth(event);",
  '  if (auth === undefined || !auth.isSignedIn || auth.userId === null) throw redirect("/sign-in");',
  "  return { userId: auth.userId };",
  "});",
]);

function dashboardDusk(draft: Draft): string {
  const { options } = draft;
  return lines([
    'import type { Metadata } from "@shadow-js/dusk";',
    'import { useLoaderData } from "@shadow-js/router";',
    'import { requireUser } from "../server/auth";',
    "",
    'export const metadata: Metadata = { title: "Dashboard" };',
    "",
    "/** Runs on the server, so the user is checked before the page is sent. */",
    "export const loader = () => requireUser(undefined);",
    "",
    "export default function Dashboard() {",
    "  const user = useLoaderData<Awaited<ReturnType<typeof requireUser>>>();",
    "  return (",
    "    <section>",
    `      <h1 class="${cls(options, "text-3xl font-bold", "title")}">Dashboard</h1>`,
    "      <p>Signed in as {user()?.userId}.</p>",
    "    </section>",
    "  );",
    "}",
  ]);
}

/** Applies the Clerk add-on to a draft. @since 1.0.0 */
export function applyClerk(draft: Draft): void {
  const { options, files } = draft;
  const dusk = options.template === "dusk";
  // The provider uses the default script mode: Clerk's own bundles (clerk.browser.js and ui.browser.js) load from the
  // frontend API host of the key, so the app installs no Clerk SDK or UI package and no React. For the bundled mode,
  // install @clerk/clerk-js and @clerk/ui and pass mode="bundled" to ClerkProvider.
  addDependency(draft, "@shadow-js/clerk");
  draft.env.push({
    name: "VITE_CLERK_PUBLISHABLE_KEY",
    comment: "Clerk publishable key (pk_test_...): Clerk dashboard, API keys.",
    example: "",
  });
  files.set("src/lib/env.ts", ENV_HELPER);
  if (dusk) {
    addDependency(draft, "@clerk/backend");
    draft.env.push(
      {
        name: "CLERK_SECRET_KEY",
        comment: "Clerk secret key (sk_test_...). Server only: never prefix it with VITE_.",
        example: "",
      },
      {
        name: "APP_URL",
        comment: "The public URL of this app: the allowed host and the Clerk authorized party.",
        example: "http://localhost:3000",
      },
    );
    files.set("src/server/auth.ts", AUTH_SERVER);
    files.set("src/routes/dashboard.tsx", dashboardDusk(draft));
    files.set(
      "src/routes/sign-in.tsx",
      lines([
        'import { SignIn } from "@shadow-js/clerk";',
        "",
        "export default function SignInPage() {",
        '  return <SignIn routing="hash" />;',
        "}",
      ]),
    );
    files.set(
      "src/routes/sign-up.tsx",
      lines([
        'import { SignUp } from "@shadow-js/clerk";',
        "",
        "export default function SignUpPage() {",
        '  return <SignUp routing="hash" />;',
        "}",
      ]),
    );
  } else {
    files.set("src/pages/SignIn.tsx", SIGN_IN);
    files.set("src/pages/SignUp.tsx", SIGN_UP);
    files.set("src/pages/Dashboard.tsx", dashboardSpa(draft));
  }
  if (options.convex) files.set("convex/auth.config.ts", convexAuthConfig());
  const body = [
    "1. Create an application at https://dashboard.clerk.com and copy its keys into `.env.local` (see `.env.example`).",
    ...(dusk
      ? [
          "2. Put the secret key in `CLERK_SECRET_KEY`. `src/entry-server.ts` verifies the session of every request with it and sends signed-out visitors away from `/dashboard`; the loader of the page asks the server again through `requireUser`, so client-side navigation is checked as well.",
        ]
      : [
          "2. `/dashboard` shows its content to signed-in users only (`SignedIn`, `RedirectToSignIn`). In a single-page app the real protection is on the server your app talks to.",
        ]),
    ...(options.convex
      ? [
          `3. In the Clerk dashboard create a JWT template named \`convex\`, then run \`${execCommand(options.packageManager)} convex env set CLERK_JWT_ISSUER_DOMAIN <the Issuer of that template>\`. \`convex/auth.config.ts\` trusts it and \`ConvexProviderWithAuth\` sends the token, so \`ctx.auth.getUserIdentity()\` works in your functions.`,
        ]
      : []),
  ];
  draft.sections.push({ heading: "Clerk", body: body.join("\n") });
}
