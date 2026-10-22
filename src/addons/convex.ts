import { ENV_HELPER } from "../templates/providers";
import {
  addDependency,
  type Draft,
  execCommand,
  json,
  jsx,
  lines,
  needNodeTypes,
  when,
} from "../templates/shared";
import { CONVEX_GENERATED } from "./convex-generated";

/**
 * Convex: the provider (see `src/providers.tsx`), a schema, two sample functions, a page that
 * lists and adds tasks, and the `convex/` project config. `convex/_generated` holds the files
 * `npx convex dev` writes, so the app builds and type-checks before a deployment exists; the
 * first `convex dev` overwrites them with the real ones.
 *
 * @since 1.0.0
 */

const SCHEMA = lines([
  'import { defineSchema, defineTable } from "convex/server";',
  'import { v } from "convex/values";',
  "",
  "export default defineSchema({",
  "  tasks: defineTable({",
  "    title: v.string(),",
  "    done: v.boolean(),",
  "    // Set when the visitor is signed in (see convex/auth.config.ts).",
  "    author: v.optional(v.string()),",
  "  }),",
  "});",
]);

/** Longest task title the sample mutation stores; an unbounded string is an unbounded write. */
const MAX_TITLE = 200;

/**
 * The sample functions. With Clerk the mutation refuses a signed-out caller: a Convex function is
 * a public endpoint, so the check lives here and not only in the page that calls it.
 */
const tasksSource = (clerk: boolean): string =>
  lines([
    'import { v } from "convex/values";',
    'import { mutation, query } from "./_generated/server";',
    "",
    `const MAX_TITLE = ${MAX_TITLE};`,
    "",
    "export const list = query({",
    "  args: {},",
    "  handler: async (ctx) => {",
    '    return await ctx.db.query("tasks").order("desc").take(50);',
    "  },",
    "});",
    "",
    "export const create = mutation({",
    "  args: { title: v.string() },",
    "  handler: async (ctx, args) => {",
    "    const identity = await ctx.auth.getUserIdentity();",
    ...when(clerk, '    if (identity === null) throw new Error("Sign in to add a task.");'),
    "    const title = args.title.trim();",
    '    if (title === "" || title.length > MAX_TITLE) {',
    `      throw new Error("A title has 1 to ${MAX_TITLE} characters.");`,
    "    }",
    '    return await ctx.db.insert("tasks", {',
    "      title,",
    "      done: false,",
    "      ...(identity === null ? {} : { author: identity.subject }),",
    "    });",
    "  },",
    "});",
  ]);

/** The project config `convex dev` also writes: the environment Convex functions run in. */
const convexTsconfig = (clerk: boolean): string =>
  json({
    compilerOptions: {
      strict: true,
      moduleResolution: "Bundler",
      skipLibCheck: true,
      allowSyntheticDefaultImports: true,
      target: "ESNext",
      lib: ["ES2023", "dom"],
      forceConsistentCasingInFileNames: true,
      module: "ESNext",
      isolatedModules: true,
      noEmit: true,
      // TypeScript 6 and later load no @types package unless it is listed; auth.config.ts reads process.env.
      ...(clerk ? { types: ["node"] } : {}),
    },
    include: ["./**/*"],
    exclude: ["./_generated"],
  });

const AUTH_CONFIG = lines([
  'import type { AuthConfig } from "convex/server";',
  "",
  "export default {",
  "  providers: [",
  "    {",
  '      // The Issuer of the Clerk JWT template named "convex". Set it with the Convex CLI:',
  "      //   convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev",
  '      domain: process.env.CLERK_JWT_ISSUER_DOMAIN ?? "",',
  '      applicationID: "convex",',
  "    },",
  "  ],",
  "} satisfies AuthConfig;",
]);

function tasksComponent(draft: Draft, exportName: string, relativeApi: string): string {
  const { options } = draft;
  const dusk = options.template === "dusk";
  const field = options.tailwind ? "my-2 block w-full rounded border p-2" : "field";
  const button = options.tailwind ? "rounded bg-black px-4 py-2 text-white" : "button";
  const heading = options.tailwind ? "text-3xl font-bold" : "title";
  return lines([
    'import { useMutation, useQuery } from "@shadow-js/convex";',
    'import { useStore } from "@shadow-js/core";',
    ...when(dusk, 'import type { Metadata } from "@shadow-js/dusk";'),
    'import { For, Show } from "@shadow-js/web";',
    `import { api } from "${relativeApi}";`,
    "",
    ...(dusk
      ? [
          'export const metadata: Metadata = { title: "Tasks" };',
          "",
          `export default function ${exportName}() {`,
        ]
      : [`export function ${exportName}() {`]),
    "  const tasks = useQuery(api.tasks.list, {});",
    "  const addTask = useMutation(api.tasks.create);",
    '  const [title, setTitle] = useStore("");',
    "",
    "  function submit(event: SubmitEvent) {",
    "    event.preventDefault();",
    "    const value = title().trim();",
    '    if (value === "") return;',
    '    setTitle("");',
    "    void addTask({ title: value });",
    "  }",
    "",
    "  return (",
    "    <section>",
    `      <h1 class="${heading}">Tasks</h1>`,
    "      <form onSubmit={submit}>",
    "        <input",
    `          class="${field}"`,
    '          placeholder="New task"',
    "          value={title()}",
    "          onInput={(event) => setTitle(event.currentTarget.value)}",
    "        />",
    ...jsx(
      8,
      "button",
      ['type="submit"', `class="${button}"`, "disabled={addTask.pending()}"],
      "Add",
    ),
    "      </form>",
    "      <Show when={tasks()} fallback={<p>Loading</p>}>",
    "        {(list) => (",
    options.tailwind ? '          <ul class="my-4 list-disc pl-6">' : "          <ul>",
    "            <For each={list()}>{(task) => <li>{task.title}</li>}</For>",
    "          </ul>",
    "        )}",
    "      </Show>",
    "    </section>",
    "  );",
    "}",
  ]);
}

/** Applies the Convex add-on to a draft. @since 1.0.0 */
export function applyConvex(draft: Draft): void {
  const { options, files } = draft;
  addDependency(draft, "@shadow-js/convex");
  addDependency(draft, "convex");
  draft.scripts["convex"] = "convex dev";
  draft.scripts["typecheck"] =
    `${draft.scripts["typecheck"] ?? "tsc --noEmit"} && tsc --noEmit -p convex`;
  if (options.clerk) needNodeTypes(draft);
  draft.env.push({
    name: "VITE_CONVEX_URL",
    comment: "Your Convex deployment URL. `convex dev` writes it to .env.local for you.",
    example: "",
  });
  files.set("convex/schema.ts", SCHEMA);
  files.set("convex/tasks.ts", tasksSource(options.clerk));
  files.set("convex/tsconfig.json", convexTsconfig(options.clerk));
  for (const [path, content] of Object.entries(CONVEX_GENERATED)) {
    files.set(`convex/_generated/${path}`, content);
  }
  files.set("src/lib/env.ts", ENV_HELPER);
  if (options.template === "dusk") {
    files.set(
      "src/routes/tasks.tsx",
      tasksComponent(draft, "TasksPage", "../../convex/_generated/api"),
    );
  } else {
    files.set(
      "src/pages/Tasks.tsx",
      tasksComponent(draft, "TasksPage", "../../convex/_generated/api"),
    );
  }
  const run = execCommand(options.packageManager);
  draft.steps.push(
    `${run} convex dev   # in a second terminal: log in, create a deployment, write VITE_CONVEX_URL`,
  );
  draft.sections.push({
    heading: "Convex",
    body: [
      `Run \`${run} convex dev\` in a second terminal. The first time it asks you to log in, creates a deployment, writes \`VITE_CONVEX_URL\` to \`.env.local\` and keeps \`convex/_generated\` up to date while you edit the functions in \`convex/\`.`,
      "",
      "- `convex/schema.ts` defines the tables, `convex/tasks.ts` holds a query and a mutation.",
      `- ${options.template === "dusk" ? "`src/routes/tasks.tsx`" : "`src/pages/Tasks.tsx`"} lists the tasks with \`useQuery\` and adds one with \`useMutation\`.`,
      "- `convex/_generated` starts as a stand-in with the same exports, so the app type-checks and builds before the first `convex dev`; Convex replaces it.",
      ...(options.clerk
        ? [
            "- `convex/auth.config.ts` trusts the Clerk JWT template named `convex`: see the Clerk section.",
          ]
        : []),
    ].join("\n"),
  });
}

/** The auth config Convex needs to trust Clerk tokens. @since 1.0.0 */
export function convexAuthConfig(): string {
  return AUTH_CONFIG;
}
