import { describe, expect, it } from "vitest";
import { projectFiles } from "../src/project";
import { allCombos, label } from "./support/combos";

/** Patterns no generated file may contain: each one is an insecure default or a leaked secret. */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ["innerHTML", /\binnerHTML\b|dangerouslySetInnerHTML|\beval\(|new Function\(/],
  ["wildcard host", /allowedHosts:\s*\[\s*["']\*["']/],
  ["wildcard CORS", /origin:\s*["']\*["']|cors:\s*true/],
  ["trusted proxy", /trustProxy:\s*true/],
  ["missing origin allowed", /allowMissingOrigin:\s*true/],
  ["insecure cookie", /secure:\s*false|httpOnly:\s*false/],
  ["inline cookie secret", /cookieSecrets?:\s*\[?\s*["'`]/],
  ["disabled csrf", /csrf:\s*false/],
  ["secret key", /\bsk_(?:live|test)_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  ["absolute home path", /\/Users\/[A-Za-z0-9._-]+\/|\/home\/[a-z][A-Za-z0-9._-]*\//],
];

const LIFECYCLE = ["preinstall", "install", "postinstall", "prepare", "prepublishOnly", "prepack"];

describe("[SEC2-SUPPLY] generated projects carry no insecure default", () => {
  it("[SEC2-SUPPLY-10] no generated file (every template, add-on and adapter) holds a forbidden pattern", () => {
    const hits: string[] = [];
    for (const options of allCombos()) {
      for (const [path, text] of projectFiles(options)) {
        // The generated Convex client is vendored library output, not template code.
        if (path.startsWith("convex/_generated/")) continue;
        for (const [name, pattern] of FORBIDDEN) {
          // The `api` template serves clients that are not browsers (curl, servers, mobile apps) and
          // has no cookies, so a write without `Origin` is no CSRF risk there; a browser's cross-site
          // write is still refused. Its entry file says so and tells the reader to remove the line
          // when sessions are added.
          if (
            name === "missing origin allowed" &&
            options.template === "api" &&
            path === "src/entry-server.ts"
          )
            continue;
          if (pattern.test(text)) hits.push(`${label(options)} ${path}: ${name}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("[SEC2-SUPPLY-11] .gitignore ignores every .env variant, keys and local state, and keeps the two public files", () => {
    for (const options of allCombos()) {
      const lines = (projectFiles(options).get(".gitignore") ?? "").split("\n");
      const at = (entry: string): number => lines.indexOf(entry);
      expect(at(".env"), label(options)).toBeGreaterThanOrEqual(0);
      expect(at(".env.local"), label(options)).toBeGreaterThanOrEqual(0);
      // `.env.production` is where deployment secrets end up; the wildcard must come before the
      // negations that re-include the example and the public file (the last matching rule wins).
      expect(at(".env.*"), label(options)).toBeGreaterThanOrEqual(0);
      expect(at("!.env.example"), label(options)).toBeGreaterThan(at(".env.*"));
      expect(at("!.env.public"), label(options)).toBeGreaterThan(at(".env.*"));
      expect(at("*.pem"), label(options)).toBeGreaterThanOrEqual(0);
      expect(at("*.key"), label(options)).toBeGreaterThanOrEqual(0);
      if (options.template === "dusk")
        expect(at(".dusk"), label(options)).toBeGreaterThanOrEqual(0);
    }
  });

  it("[SEC2-SUPPLY-12] .env.example holds placeholders only, under a comment that says where the real values go", () => {
    for (const options of allCombos()) {
      const example = projectFiles(options).get(".env.example");
      if (example === undefined) continue;
      expect(example, label(options)).toContain(".env.local");
      for (const line of example.split("\n")) {
        if (line === "" || line.startsWith("#")) continue;
        const value = line.slice(line.indexOf("=") + 1);
        // Empty (a secret you fill in), a port, a loopback address or a language tag: never a credential.
        expect(value, `${label(options)} ${line.split("=")[0]}`).toMatch(
          /^$|^\d{2,5}$|^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?$|^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/,
        );
      }
    }
  });

  it("[SEC2-SUPPLY-13] a Dusk server entry pins the production host and turns the CSP on", () => {
    for (const options of allCombos().filter((candidate) => candidate.template === "dusk")) {
      const entry = projectFiles(options).get("src/entry-server.ts") ?? "";
      // Tarout's health check calls the container on 127.0.0.1, so that target also answers for it (and for no other loopback name).
      expect(entry, label(options)).toContain(
        options.adapter === "tarout"
          ? 'allowedHosts: [appUrl.hostname, "127.0.0.1"]'
          : "allowedHosts: [appUrl.hostname]",
      );
      expect(entry, label(options)).toMatch(/import\.meta\.env\.PROD \? \{ csp: /);
      expect(entry, label(options)).toContain("hsts");
      if (options.clerk === true) {
        // Clerk loads scripts from its own host, so the policy starts report-only with a comment.
        expect(entry, label(options)).toContain("csp: { reportOnly: true }");
        expect(entry, label(options)).toContain("authorizedParties: [appUrl.origin]");
      } else {
        expect(entry, label(options)).toContain("csp: {}");
      }
    }
  });

  it("[SEC2-SUPPLY-14] the sample Convex mutation bounds the title and, with Clerk, refuses a signed-out caller", () => {
    const plain = projectFiles({ name: "app", template: "dusk", convex: true });
    const tasks = plain.get("convex/tasks.ts") ?? "";
    expect(tasks).toContain("title.length > MAX_TITLE");
    expect(tasks).not.toContain("Sign in to add a task");
    const signedIn = projectFiles({ name: "app", template: "dusk", convex: true, clerk: true });
    const guarded = signedIn.get("convex/tasks.ts") ?? "";
    expect(guarded).toContain('if (identity === null) throw new Error("Sign in to add a task.")');
    expect(guarded.indexOf("identity === null")).toBeLessThan(guarded.indexOf("ctx.db.insert"));
  });

  it("[SEC2-SUPPLY-15] a generated package.json has no lifecycle hook and no unpinned or remote dependency", () => {
    for (const options of allCombos()) {
      const manifest: unknown = JSON.parse(projectFiles(options).get("package.json") ?? "{}");
      const scripts = Reflect.get(manifest as object, "scripts") as Record<string, string>;
      for (const hook of LIFECYCLE) {
        expect(scripts[hook], `${label(options)} ${hook}`).toBeUndefined();
      }
      for (const section of ["dependencies", "devDependencies"]) {
        const deps = Reflect.get(manifest as object, section) as Record<string, string> | undefined;
        for (const [name, range] of Object.entries(deps ?? {})) {
          expect(range, `${label(options)} ${name}`).not.toMatch(
            /^(?:latest|\*|git|github:|https?:|file:|link:)/,
          );
        }
      }
    }
  });
});
