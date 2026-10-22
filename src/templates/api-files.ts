/** The files of the `api` template that do not depend on the chosen options. @since 1.0.0 */
export const API_FILES: Readonly<Record<string, string>> = Object.freeze({
  "dusk.config.ts": `import { defineConfig } from "@shadow-js/dusk/vite";

export default defineConfig({
  // Checked when the server starts: a wrong value stops it before it serves a request.
  env: {
    APP_URL: { type: "url", default: "http://localhost:3000" },
    CORS_ORIGINS: { type: "string", default: "" },
    PORT: { type: "number", integer: true, min: 0, max: 65535, default: 3000 },
  },
  headers: [{ source: "/api/**", headers: { "x-content-type-options": "nosniff" } }],
});
`,
  "src/api/spec.test.ts": `import { describe, expect, it } from "vitest";
import { openApiDocument, operations } from "./spec";

/** Every route file and what it exports, by path: \`./../routes/api/tasks/[id].ts\` and the like. */
const routes = import.meta.glob<Record<string, unknown>>("../routes/api/**/*.ts", { eager: true });

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"];

/** \`../routes/api/tasks/[id].ts\` to \`/api/tasks/:id\`, the way the router names the route. */
function routePath(file: string): string {
  const path = file
    .replace("../routes", "")
    .replace(/\\.ts$/, "")
    .replace(/\\/index$/, "")
    .replace(/\\[([^\\]]+)\\]/g, ":$1");
  return path === "" ? "/" : path;
}

describe("the API description", () => {
  it("lists every method of every route file, and nothing else", () => {
    const fromFiles: string[] = [];
    for (const [file, module] of Object.entries(routes)) {
      if (file.endsWith(".test.ts")) continue;
      for (const method of METHODS) {
        if (typeof module[method] === "function") fromFiles.push(\`\${method} \${routePath(file)}\`);
      }
    }
    const described = operations.map(
      (operation) => \`\${operation.method.toUpperCase()} \${operation.path}\`,
    );
    expect(described.sort()).toEqual(fromFiles.sort());
  });

  it("is an OpenAPI 3.1 document whose references resolve and whose paths use {braces}", () => {
    const document = openApiDocument("https://api.example") as {
      openapi: string;
      servers: { url: string }[];
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
      components: { schemas: Record<string, unknown> };
    };
    expect(document.openapi).toBe("3.1.0");
    expect(document.servers).toEqual([{ url: "https://api.example" }]);
    expect(Object.keys(document.paths)).toContain("/api/tasks/{id}");
    expect(Object.keys(document.paths).some((path) => path.includes(":"))).toBe(false);
    const references = [...JSON.stringify(document).matchAll(/#\\/components\\/schemas\\/(\\w+)/g)].map(
      (match) => match[1],
    );
    for (const name of references)
      expect(document.components.schemas, String(name)).toHaveProperty(String(name));
    for (const operation of Object.values(document.paths).flatMap((item) => Object.values(item))) {
      expect(Object.keys(operation.responses).length).toBeGreaterThan(0);
    }
  });
});
`,
  "src/api/spec.ts": `/**
 * The description of the API, in one place. \`GET /api/openapi.json\` serves it as an OpenAPI 3.1 document, and a test keeps it
 * in step with the files of \`src/routes/api\`: a route that is not listed here, or a listed operation without a route, fails
 * the test. Edit this file when you add a route.
 */

/** One operation: an HTTP method on a path. */
export interface Operation {
  readonly method: "get" | "post" | "patch" | "delete";
  /** The path as the router writes it: \`:id\` for a parameter. */
  readonly path: string;
  readonly summary: string;
  /** Status codes the operation answers, with a short meaning. */
  readonly responses: Readonly<Record<string, string>>;
  /** The schema of the JSON body, by its name in \`components.schemas\`. */
  readonly body?: string;
  /** The schema of the JSON answer. */
  readonly answer?: string;
}

export const operations: readonly Operation[] = [
  {
    method: "get",
    path: "/api/health",
    summary: "Health check",
    responses: { "200": "The server is up" },
  },
  {
    method: "get",
    path: "/api/openapi.json",
    summary: "This description of the API",
    responses: { "200": "An OpenAPI 3.1 document" },
  },
  {
    method: "get",
    path: "/api/tasks",
    summary: "A page of tasks",
    answer: "TaskPage",
    responses: { "200": "A page", "422": "A bad query", "429": "Too many requests" },
  },
  {
    method: "post",
    path: "/api/tasks",
    summary: "Create a task",
    body: "NewTask",
    answer: "Task",
    responses: {
      "201": "The task",
      "409": "The list is full",
      "413": "The body is too large",
      "415": "The body is not JSON",
      "422": "A bad body",
      "429": "Too many requests",
    },
  },
  {
    method: "get",
    path: "/api/tasks/:id",
    summary: "One task",
    answer: "Task",
    responses: { "200": "The task", "404": "No such task", "429": "Too many requests" },
  },
  {
    method: "patch",
    path: "/api/tasks/:id",
    summary: "Change a task",
    body: "TaskPatch",
    answer: "Task",
    responses: {
      "200": "The task",
      "404": "No such task",
      "422": "A bad body",
      "429": "Too many requests",
    },
  },
  {
    method: "delete",
    path: "/api/tasks/:id",
    summary: "Delete a task",
    responses: { "204": "Deleted", "404": "No such task", "429": "Too many requests" },
  },
];

const schemas = {
  Task: {
    type: "object",
    required: ["id", "title", "done", "createdAt"],
    properties: {
      id: { type: "string", format: "uuid" },
      title: { type: "string", minLength: 1, maxLength: 200 },
      done: { type: "boolean" },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  NewTask: {
    type: "object",
    required: ["title"],
    properties: { title: { type: "string", minLength: 1, maxLength: 200 } },
  },
  TaskPatch: {
    type: "object",
    minProperties: 1,
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      done: { type: "boolean" },
    },
  },
  TaskPage: {
    type: "object",
    required: ["data", "next"],
    properties: {
      data: { type: "array", items: { $ref: "#/components/schemas/Task" } },
      next: { type: ["string", "null"], description: "Pass it as \`after\` to read the next page." },
    },
  },
  Error: {
    type: "object",
    properties: {
      error: {
        type: "object",
        properties: {
          name: { type: "string" },
          message: { type: "string" },
          status: { type: "integer" },
          requestId: { type: "string" },
        },
      },
    },
  },
} as const;

/** \`:id\` to \`{id}\`, the way OpenAPI writes a path parameter. */
function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/** The OpenAPI 3.1 document of the API; \`origin\` becomes its server URL. */
export function openApiDocument(origin: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    const key = openApiPath(operation.path);
    const item = paths[key] ?? {};
    paths[key] = item;
    const parameters = [...operation.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
      name: match[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    item[operation.method] = {
      summary: operation.summary,
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(operation.body === undefined
        ? {}
        : {
            requestBody: {
              required: true,
              content: {
                "application/json": { schema: { $ref: \`#/components/schemas/\${operation.body}\` } },
              },
            },
          }),
      responses: Object.fromEntries(
        Object.entries(operation.responses).map(([status, description]) => [
          status,
          {
            description,
            ...(status.startsWith("2") && operation.answer !== undefined
              ? {
                  content: {
                    "application/json": {
                      schema: { $ref: \`#/components/schemas/\${operation.answer}\` },
                    },
                  },
                }
              : status.startsWith("4")
                ? {
                    content: {
                      "application/json": { schema: { $ref: "#/components/schemas/Error" } },
                    },
                  }
                : {}),
          },
        ]),
      ),
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Tasks API", version: "1.0.0" },
    servers: [{ url: origin }],
    paths,
    components: { schemas },
  };
}
`,
  "src/entry-server.ts": `import type { HandlerOptions } from "@shadow-js/dusk/server";
import { parseOrigins } from "./lib/origins";

const appUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");

/**
 * The origins of the browser apps that may call this API from another origin (\`CORS_ORIGINS\`, comma separated). Only listed
 * origins get \`Access-Control-*\` headers, and credentials are never allowed.
 */
const origins = parseOrigins(process.env.CORS_ORIGINS);

/** Options of the request handler. Everything here has a safe default; see the Dusk docs. */
export const options = {
  security: {
    // The Host header is attacker input: production answers only for the host of APP_URL.
    ...(import.meta.env.PROD ? { allowedHosts: [appUrl.hostname] } : {}),
    headers: { hsts: { maxAge: 63_072_000, includeSubDomains: true } },
    // This API has no cookies or sessions, so a request without \`Origin\` (curl, a server, a mobile app) is not a CSRF risk
    // and is allowed. A browser always sends \`Origin\` on a cross-site write, and that is still refused unless the origin
    // is listed in CORS_ORIGINS. If you add cookie sessions, remove this line.
    csrf: { allowMissingOrigin: true },
    // A browser app on a listed origin may read the answers of the API.
    ...(origins.length > 0
      ? {
          cors: { origins, methods: ["GET", "POST", "PATCH", "DELETE"], headers: ["content-type"] },
        }
      : {}),
    // The API sends JSON only: no document, so no script, style or image may load.
    ...(import.meta.env.PROD ? { csp: {} } : {}),
  },
  // A browser app on a listed origin may also send state-changing requests (the CSRF check trusts it).
  ...(origins.length > 0 ? { trustedOrigins: origins } : {}),
} satisfies Omit<HandlerOptions, "manifest">;

export default options;
`,
  "src/lib/origins.test.ts": `import { describe, expect, it } from "vitest";
import { parseOrigins } from "./origins";

describe("parseOrigins", () => {
  it("is empty for nothing, blanks and commas", () => {
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("")).toEqual([]);
    expect(parseOrigins(" , ,, ")).toEqual([]);
  });

  it("reduces each entry to its origin and drops duplicates", () => {
    expect(
      parseOrigins("https://app.example/, https://app.example/path?x=1, http://localhost:5173"),
    ).toEqual(["https://app.example", "http://localhost:5173"]);
  });

  it("refuses an entry that is not a URL, naming it", () => {
    expect(() => parseOrigins("app.example")).toThrow(/"app.example"/);
  });

  it("refuses a scheme that is not http or https, and the opaque null origin", () => {
    expect(() => parseOrigins("ftp://files.example")).toThrow(/http or https/);
    expect(() => parseOrigins("file:///tmp/x")).toThrow(/http or https/);
    expect(() => parseOrigins("data:text/plain,hi")).toThrow(/http or https/);
  });
});
`,
  "src/lib/origins.ts": `/**
 * Reads a comma-separated list of origins (\`CORS_ORIGINS\`): \`https://app.example, https://admin.example:8443\`.
 * Each entry is reduced to its origin (a path or a trailing slash is dropped), duplicates are removed, and anything that is
 * not an http(s) URL stops the server at startup with the entry named, so a typo cannot silently widen or narrow access.
 *
 * @throws Error for an entry that is not an http or https URL.
 */
export function parseOrigins(text: string | undefined): string[] {
  const origins = new Set<string>();
  for (const entry of (text ?? "").split(",")) {
    const value = entry.trim();
    if (value === "") continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(\`CORS_ORIGINS has an entry that is not a URL: \${JSON.stringify(value)}\`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(\`CORS_ORIGINS entries must be http or https URLs: \${JSON.stringify(value)}\`);
    }
    origins.add(url.origin);
  }
  return [...origins];
}
`,
  "src/lib/schema.ts": `import type { StandardSchemaV1 } from "@shadow-js/dusk/server";

/** One problem found while validating input. */
export interface Issue {
  message: string;
  path?: string[];
}

/**
 * Builds a Standard Schema, the interface Zod, Valibot and ArkType also implement, so a route or a
 * server function can take any of them. This one has no dependency; swap it for a library when your
 * inputs grow.
 */
export function defineSchema<Output>(
  check: (input: unknown) => { value: Output } | { issues: Issue[] },
): StandardSchemaV1<unknown, Output> {
  return { "~standard": { version: 1, vendor: "app", validate: check } };
}

/** Reads a field of an unknown value, or \`undefined\` when the value is not an object. */
export function field(input: unknown, name: string): unknown {
  return typeof input === "object" && input !== null ? Reflect.get(input, name) : undefined;
}

/** Reads a string field, trimmed, or reports why it is not usable. */
export function stringField(input: unknown, name: string, max: number, issues: Issue[]): string {
  const value = field(input, name);
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ message: "Required", path: [name] });
    return "";
  }
  if (value.length > max) issues.push({ message: \`At most \${max} characters\`, path: [name] });
  return value.trim();
}
`,
  "src/routes/api/health.ts": `import { json, type RequestEvent } from "@shadow-js/dusk/server";

/** GET /api/health: for load balancers and uptime checks. */
export const GET = (event: RequestEvent) => json({ ok: true, id: event.id });
`,
  "src/routes/api/openapi.json.ts": `import { json, type RequestEvent } from "@shadow-js/dusk/server";
import { openApiDocument } from "../../api/spec";

/** GET /api/openapi.json: the OpenAPI 3.1 description of this API (see \`src/api/spec.ts\`). */
export const GET = (event: RequestEvent) =>
  json(openApiDocument(event.url.origin), { headers: { "cache-control": "public, max-age=300" } });
`,
  "src/routes/api/tasks.test.ts": `// @vitest-environment node
import { HttpError, type RequestEvent } from "@shadow-js/dusk/server";
import { createTestEvent } from "@shadow-js/dusk/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { insertTask, resetTasks } from "../../server/tasks.server";
import { DELETE, GET as getOne, PATCH } from "./tasks/[id]";
import { GET as list, POST } from "./tasks/index";

beforeEach(() => resetTasks());

const JSON_HEADERS = { "content-type": "application/json" };

/** An event of \`method\` on \`path\` with a JSON body; \`params\` stands in for what the router parses from the path. */
function event(
  method: string,
  path: string,
  options: { body?: string; params?: Record<string, string>; headers?: HeadersInit } = {},
): RequestEvent {
  const made = createTestEvent({
    url: \`http://localhost\${path}\`,
    method,
    headers: options.headers ?? JSON_HEADERS,
    ...(options.body === undefined ? {} : { body: options.body }),
  });
  if (options.params !== undefined) {
    Object.defineProperty(made, "params", { value: Object.freeze(options.params) });
  }
  return made;
}

async function responseOf(answer: unknown): Promise<Response> {
  const value = await answer;
  if (!(value instanceof Response)) throw new Error("The route did not answer with a Response.");
  return value;
}

/** The HttpError a handler throws, so a test can read its status. */
async function refusal(run: () => unknown): Promise<HttpError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error("The route did not refuse.");
}

const UNKNOWN = "00000000-0000-4000-8000-000000000000";

describe("POST /api/tasks", () => {
  it("creates a task: 201, the task, and where to find it", async () => {
    const response = await responseOf(
      POST(event("POST", "/api/tasks", { body: '{"title":"  write  "}' })),
    );
    expect(response.status).toBe(201);
    const task = (await response.json()) as { id: string; title: string; done: boolean };
    expect(task).toMatchObject({ title: "write", done: false });
    expect(response.headers.get("location")).toBe(\`/api/tasks/\${task.id}\`);
  });

  it("refuses bad input with 422 and the issues, never creating a task", async () => {
    for (const body of ['{"title":""}', '{"title":"   "}', "{}", '{"title":5}', "[]", "null"]) {
      const error = await refusal(() => POST(event("POST", "/api/tasks", { body })));
      expect(error.status, body).toBe(422);
      expect(error.data, body).toMatchObject({ issues: [{ path: ["title"] }] });
    }
    const page = await (await responseOf(list(event("GET", "/api/tasks")))).json();
    expect(page).toEqual({ data: [], next: null });
  });

  it("refuses a title over 200 characters, and accepts exactly 200", async () => {
    const long = await refusal(() =>
      POST(event("POST", "/api/tasks", { body: JSON.stringify({ title: "a".repeat(201) }) })),
    );
    expect(long.status).toBe(422);
    const edge = await responseOf(
      POST(event("POST", "/api/tasks", { body: JSON.stringify({ title: "a".repeat(200) }) })),
    );
    expect(edge.status).toBe(201);
  });

  it("refuses a body that is not JSON (400), not declared JSON (415), or too large (413)", async () => {
    expect((await refusal(() => POST(event("POST", "/api/tasks", { body: "{bad" })))).status).toBe(
      400,
    );
    expect((await refusal(() => POST(event("POST", "/api/tasks", { body: "" })))).status).toBe(400);
    expect(
      (
        await refusal(() =>
          POST(
            event("POST", "/api/tasks", { body: "x", headers: { "content-type": "text/plain" } }),
          ),
        )
      ).status,
    ).toBe(415);
    const big = JSON.stringify({ title: "a", filler: "b".repeat(5000) });
    expect((await refusal(() => POST(event("POST", "/api/tasks", { body: big })))).status).toBe(
      413,
    );
  });

  it("treats a __proto__ key as invalid JSON, not as data", async () => {
    const error = await refusal(() =>
      POST(event("POST", "/api/tasks", { body: '{"title":"x","__proto__":{"done":true}}' })),
    );
    expect(error.status).toBe(400);
  });

  it("says 409 when the list is full", async () => {
    for (let n = 0; n < 1000; n += 1) insertTask({ title: String(n) });
    const error = await refusal(() => POST(event("POST", "/api/tasks", { body: '{"title":"x"}' })));
    expect(error.status).toBe(409);
  });
});

describe("GET /api/tasks", () => {
  it("pages with limit and after, and refuses bad queries", async () => {
    for (const title of ["a", "b", "c"]) insertTask({ title });
    const first = (await (await responseOf(list(event("GET", "/api/tasks?limit=2")))).json()) as {
      data: { title: string }[];
      next: string | null;
    };
    expect(first.data.map((task) => task.title)).toEqual(["a", "b"]);
    expect(first.next).not.toBeNull();
    const second = (await (
      await responseOf(list(event("GET", \`/api/tasks?limit=2&after=\${first.next}\`)))
    ).json()) as { data: { title: string }[]; next: string | null };
    expect(second.data.map((task) => task.title)).toEqual(["c"]);
    expect(second.next).toBeNull();

    for (const query of [
      "limit=0",
      "limit=101",
      "limit=1.5",
      "limit=abc",
      "limit=",
      \`after=\${"x".repeat(65)}\`,
    ]) {
      expect((await refusal(() => list(event("GET", \`/api/tasks?\${query}\`)))).status, query).toBe(
        422,
      );
    }
    expect((await refusal(() => list(event("GET", "/api/tasks?after=nobody")))).status).toBe(422);
  });
});

describe("/api/tasks/:id", () => {
  const taskId = () => insertTask({ title: "one" })?.id ?? "";

  it("reads, changes and deletes a task", async () => {
    const id = taskId();
    const read = await responseOf(getOne(event("GET", \`/api/tasks/\${id}\`, { params: { id } })));
    expect(await read.json()).toMatchObject({ id, title: "one" });
    const changed = await responseOf(
      PATCH(
        event("PATCH", \`/api/tasks/\${id}\`, {
          params: { id },
          body: '{"done":true,"title":" two "}',
        }),
      ),
    );
    expect(await changed.json()).toMatchObject({ id, title: "two", done: true });
    const removed = await responseOf(
      DELETE(event("DELETE", \`/api/tasks/\${id}\`, { params: { id } })),
    );
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe("");
    expect(
      (await refusal(() => getOne(event("GET", \`/api/tasks/\${id}\`, { params: { id } })))).status,
    ).toBe(404);
    expect(
      (await refusal(() => DELETE(event("DELETE", \`/api/tasks/\${id}\`, { params: { id } })))).status,
    ).toBe(404);
  });

  it("answers 404 for an id that cannot exist or does not, before anything else", async () => {
    for (const id of ["not-a-uuid", "", "../etc/passwd", UNKNOWN, "A".repeat(500)]) {
      const params = { id };
      expect(
        (await refusal(() => getOne(event("GET", "/api/tasks/x", { params })))).status,
        id,
      ).toBe(404);
      expect(
        (await refusal(() => DELETE(event("DELETE", "/api/tasks/x", { params })))).status,
        id,
      ).toBe(404);
      expect(
        (
          await refusal(() =>
            PATCH(event("PATCH", "/api/tasks/x", { params, body: '{"done":true}' })),
          )
        ).status,
        id,
      ).toBe(404);
    }
  });

  it("refuses an empty or wrongly typed patch with 422", async () => {
    const id = taskId();
    for (const body of ["{}", '{"done":"yes"}', '{"title":""}', '{"title":7}', "[]"]) {
      const error = await refusal(() => PATCH(event("PATCH", "/x", { params: { id }, body })));
      expect(error.status, body).toBe(422);
    }
  });

  it("a patch changes only what it names", async () => {
    const id = taskId();
    const response = await responseOf(
      PATCH(event("PATCH", "/x", { params: { id }, body: '{"done":true}' })),
    );
    expect(await response.json()).toMatchObject({ title: "one", done: true });
  });
});
`,
  "src/routes/api/tasks/[id].ts": `import { HttpError, json, type RequestEvent, readJsonLimited } from "@shadow-js/dusk/server";
import { defineSchema, field, type Issue } from "../../../lib/schema";
import { limit } from "../../../server/limits";
import { changeTask, findTask, removeTask } from "../../../server/tasks.server";
import { parse } from "../../../server/validate.server";

/** Every method of this route goes through the rate limit. */
export const middleware = [limit];

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The id of the path, or a 404: an id that cannot exist is not worth a lookup. */
function idOf(event: RequestEvent): string {
  const id = event.params.id;
  if (id === undefined || !ID.test(id)) throw new HttpError(404, "No such task", { expose: true });
  return id;
}

const patchTask = defineSchema<{ title?: string; done?: boolean }>((input) => {
  const issues: Issue[] = [];
  const title = field(input, "title");
  const done = field(input, "done");
  if (title === undefined && done === undefined) {
    issues.push({ message: "Send a title, done, or both" });
  }
  if (
    title !== undefined &&
    (typeof title !== "string" || title.trim() === "" || title.length > 200)
  ) {
    issues.push({ message: "A text of 1 to 200 characters", path: ["title"] });
  }
  if (done !== undefined && typeof done !== "boolean") {
    issues.push({ message: "true or false", path: ["done"] });
  }
  return issues.length > 0
    ? { issues }
    : {
        value: {
          ...(typeof title === "string" ? { title: title.trim() } : {}),
          ...(typeof done === "boolean" ? { done } : {}),
        },
      };
});

/** GET /api/tasks/:id */
export const GET = (event: RequestEvent) => {
  const task = findTask(idOf(event));
  if (task === undefined) throw new HttpError(404, "No such task", { expose: true });
  return json(task);
};

/** PATCH /api/tasks/:id with \`{ "title"?: "...", "done"?: true }\` */
export const PATCH = async (event: RequestEvent) => {
  const id = idOf(event);
  const patch = await parse(patchTask, await readJsonLimited(event.request, 4 * 1024));
  const task = changeTask(id, patch);
  if (task === undefined) throw new HttpError(404, "No such task", { expose: true });
  return json(task);
};

/** DELETE /api/tasks/:id: 204 whether or not the task existed is hiding information; an unknown id is a 404. */
export const DELETE = (event: RequestEvent) => {
  if (!removeTask(idOf(event))) throw new HttpError(404, "No such task", { expose: true });
  return new Response(null, { status: 204 });
};
`,
  "src/routes/api/tasks/index.ts": `import { HttpError, json, type RequestEvent, readJsonLimited } from "@shadow-js/dusk/server";
import { defineSchema, field, type Issue, stringField } from "../../../lib/schema";
import { limit } from "../../../server/limits";
import { insertTask, listTasks } from "../../../server/tasks.server";
import { parse } from "../../../server/validate.server";

/** Every method of this route goes through the rate limit. */
export const middleware = [limit];

/** The query of the list: a page size from 1 to 100 and the id to continue after. */
const pageQuery = defineSchema<{ limit: number; after?: string }>((input) => {
  const issues: Issue[] = [];
  const raw = field(input, "limit");
  const limitValue = raw === undefined ? 20 : Number(raw);
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) {
    issues.push({ message: "A whole number from 1 to 100", path: ["limit"] });
  }
  const after = field(input, "after");
  if (after !== undefined && (typeof after !== "string" || after.length > 64)) {
    issues.push({ message: "An id", path: ["after"] });
  }
  return issues.length > 0
    ? { issues }
    : { value: { limit: limitValue, ...(typeof after === "string" ? { after } : {}) } };
});

const newTask = defineSchema<{ title: string }>((input) => {
  const issues: Issue[] = [];
  const title = stringField(input, "title", 200, issues);
  return issues.length > 0 ? { issues } : { value: { title } };
});

/** GET /api/tasks?limit=20&after=<id>: a page of tasks and the id to continue after, or null. */
export const GET = async (event: RequestEvent) => {
  const query = await parse(pageQuery, Object.fromEntries(event.url.searchParams));
  const page = listTasks(query);
  if (page === undefined) {
    throw new HttpError(422, "Unknown cursor", {
      expose: true,
      data: {
        issues: [{ message: "No task has this id: start again without \`after\`", path: ["after"] }],
      },
    });
  }
  return json(page);
};

/** POST /api/tasks with \`{ "title": "..." }\`: 201 and the new task. */
export const POST = async (event: RequestEvent) => {
  const input = await parse(newTask, await readJsonLimited(event.request, 4 * 1024));
  const task = insertTask(input);
  if (task === undefined) throw new HttpError(409, "The task list is full", { expose: true });
  return json(task, { status: 201, headers: { location: \`/api/tasks/\${task.id}\` } });
};
`,
  "src/server/functions.test.ts": `// @vitest-environment node
import { createTestEvent } from "@shadow-js/dusk/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { addTask, stats } from "./functions";
import { resetTasks } from "./tasks.server";

beforeEach(() => resetTasks());

describe("server functions", () => {
  it("adds a task and counts it", async () => {
    const event = createTestEvent({ url: "http://localhost/_dusk/fn/addTask", method: "POST" });
    const task = await addTask.invoke({ title: " write " }, event);
    expect(task).toMatchObject({ title: "write", done: false });
    expect(await stats.invoke(undefined, event)).toEqual({ total: 1, done: 0 });
  });

  it("refuses an invalid input before the function runs", async () => {
    const event = createTestEvent({ url: "http://localhost/_dusk/fn/addTask", method: "POST" });
    await expect(addTask.invoke({ title: "" }, event)).rejects.toThrow();
    expect(await stats.invoke(undefined, event)).toEqual({ total: 0, done: 0 });
  });
});
`,
  "src/server/functions.ts": `import { serverFn } from "@shadow-js/dusk/server";
import { defineSchema, type Issue, stringField } from "../lib/schema";
import { addTaskLimiter } from "./limits";
import { insertTask, taskCounts } from "./tasks.server";

const title = defineSchema<{ title: string }>((input) => {
  const issues: Issue[] = [];
  const value = stringField(input, "title", 200, issues);
  return issues.length > 0 ? { issues } : { value: { title: value } };
});

/**
 * Server functions are typed RPC for your own front end: a client imports them like any async function and Dusk
 * generates the call. \`GET\` functions are safe to cache; the others are checked for CSRF and validate their input
 * before they run. Plain HTTP clients use the routes in \`src/routes/api\` instead.
 */

/** How many tasks there are and how many are done. */
export const stats = serverFn({ method: "GET" }, () => taskCounts());

/** Adds a task; at most five calls in a burst, then one every two seconds per client. */
export const addTask = serverFn({ input: title, rateLimit: addTaskLimiter }, (input) => {
  const task = insertTask(input);
  if (task === undefined) throw new Error("The task list is full");
  return task;
});
`,
  "src/server/limits.test.ts": `// @vitest-environment node
import { HttpError } from "@shadow-js/dusk/server";
import { createTestEvent } from "@shadow-js/dusk/testing";
import { describe, expect, it } from "vitest";
import { limit } from "./limits";

const ok = async () => new Response("ok");

/** Requests of one client address: distinct addresses never share a bucket. */
function from(address: string, method: string) {
  return createTestEvent({ url: "http://localhost/api/tasks", method, clientAddress: address });
}

/** The status the pipeline would answer: the middleware refuses by throwing an HttpError. */
async function statusOf(
  address: string,
  method: string,
): Promise<{ status: number; retryAfter?: string }> {
  try {
    return { status: (await limit(from(address, method), ok)).status };
  } catch (error) {
    if (error instanceof HttpError) {
      const retryAfter = error.headers.get("retry-after");
      return { status: error.status, ...(retryAfter === null ? {} : { retryAfter }) };
    }
    throw error;
  }
}

describe("the rate limit", () => {
  it("lets a burst of reads through and then answers 429 with Retry-After", async () => {
    const answers = [];
    for (let n = 0; n < 70; n += 1) answers.push(await statusOf("198.51.100.1", "GET"));
    expect(answers.slice(0, 60).every((answer) => answer.status === 200)).toBe(true);
    const last = answers.at(-1);
    expect(last?.status).toBe(429);
    expect(Number(last?.retryAfter)).toBeGreaterThanOrEqual(1);
  });

  it("writes have a smaller bucket than reads, and a bucket per client", async () => {
    const statuses: number[] = [];
    for (let n = 0; n < 12; n += 1) statuses.push((await statusOf("198.51.100.2", "POST")).status);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect((await statusOf("198.51.100.3", "POST")).status).toBe(200);
  });

  it("reads are not charged to the write bucket", async () => {
    for (let n = 0; n < 10; n += 1) await statusOf("198.51.100.4", "POST");
    expect((await statusOf("198.51.100.4", "POST")).status).toBe(429);
    expect((await statusOf("198.51.100.4", "GET")).status).toBe(200);
    expect((await statusOf("198.51.100.4", "HEAD")).status).toBe(200);
  });

  it("charges every method that changes state to the write bucket", async () => {
    for (const method of ["PATCH", "DELETE", "PUT"]) {
      const address = \`198.51.100.\${method.length + 10}\`;
      for (let n = 0; n < 10; n += 1) await statusOf(address, method);
      expect((await statusOf(address, method)).status, method).toBe(429);
    }
  });
});
`,
  "src/server/limits.ts": `import { createRateLimiter, type Middleware } from "@shadow-js/dusk/server";

/** Reads: a burst of 60 requests, then 10 per second, per client address. */
const reads = createRateLimiter({ capacity: 60, refillPerSecond: 10, name: "read" });

/** Writes are dearer: a burst of 10, then one every two seconds. */
const writes = createRateLimiter({ capacity: 10, refillPerSecond: 0.5, name: "write" });

const readLimit = reads.middleware();
const writeLimit = writes.middleware();

/**
 * The limit of an API route: reads and writes have their own buckets. A client over its limit gets 429 with
 * \`Retry-After\`. The in-memory buckets belong to one process: pass a shared \`store\` to \`createRateLimiter\` when
 * you run several.
 */
export const limit: Middleware = (event, next) =>
  event.request.method === "GET" || event.request.method === "HEAD"
    ? readLimit(event, next)
    : writeLimit(event, next);

/** Calls of the \`addTask\` server function: a burst of 5, then one every two seconds per client. */
export const addTaskLimiter = createRateLimiter({
  capacity: 5,
  refillPerSecond: 0.5,
  name: "addTask",
});
`,
  "src/server/tasks.server.ts": `/** An in-memory store that stands in for a database. Replace it with your own; the routes only use these functions. */

/** A task. */
export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

/** The most tasks the store holds, so a client cannot fill the memory of the server. */
export const MAX_TASKS = 1000;

const tasks = new Map<string, Task>();

/**
 * One page of tasks, oldest first. \`after\` is the id of the last task of the previous page. Returns \`undefined\` when
 * \`after\` names no task (it was removed, or never existed): starting over silently would repeat rows for a client that pages.
 */
export function listTasks(options: {
  limit: number;
  after?: string;
}): { data: Task[]; next: string | null } | undefined {
  const all = [...tasks.values()];
  let start = 0;
  if (options.after !== undefined) {
    const position = all.findIndex((task) => task.id === options.after);
    if (position === -1) return undefined;
    start = position + 1;
  }
  const data = all.slice(start, start + options.limit);
  const last = data.at(-1);
  const more = start + data.length < all.length;
  return { data, next: more && last !== undefined ? last.id : null };
}

export function findTask(id: string): Task | undefined {
  return tasks.get(id);
}

/** Adds a task. Returns \`undefined\` when the store is full. */
export function insertTask(input: { title: string }): Task | undefined {
  if (tasks.size >= MAX_TASKS) return undefined;
  const task: Task = {
    id: crypto.randomUUID(),
    title: input.title,
    done: false,
    createdAt: new Date().toISOString(),
  };
  tasks.set(task.id, task);
  return task;
}

/** Changes a task. Returns \`undefined\` for an unknown id. */
export function changeTask(
  id: string,
  patch: { title?: string; done?: boolean },
): Task | undefined {
  const task = tasks.get(id);
  if (task === undefined) return undefined;
  const next: Task = {
    ...task,
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.done === undefined ? {} : { done: patch.done }),
  };
  tasks.set(id, next);
  return next;
}

/** Removes a task. Returns whether it existed. */
export function removeTask(id: string): boolean {
  return tasks.delete(id);
}

/** Counts for the stats function. */
export function taskCounts(): { total: number; done: number } {
  let done = 0;
  for (const task of tasks.values()) if (task.done) done += 1;
  return { total: tasks.size, done };
}

/** Empties the store (tests). */
export function resetTasks(): void {
  tasks.clear();
}
`,
  "src/server/tasks.test.ts": `import { beforeEach, describe, expect, it } from "vitest";
import {
  changeTask,
  findTask,
  insertTask,
  listTasks,
  MAX_TASKS,
  removeTask,
  resetTasks,
  taskCounts,
} from "./tasks.server";

beforeEach(() => resetTasks());

describe("the task store", () => {
  it("adds, finds, changes and removes a task", () => {
    const task = insertTask({ title: "write" });
    expect(task).toMatchObject({ title: "write", done: false });
    const id = task?.id ?? "";
    expect(findTask(id)?.title).toBe("write");
    expect(changeTask(id, { done: true })).toMatchObject({ title: "write", done: true });
    expect(changeTask(id, { title: "wrote" })).toMatchObject({ title: "wrote", done: true });
    expect(changeTask("missing", { done: true })).toBeUndefined();
    expect(removeTask(id)).toBe(true);
    expect(removeTask(id)).toBe(false);
    expect(findTask(id)).toBeUndefined();
  });

  it("pages in insertion order and says where to continue", () => {
    const ids = ["a", "b", "c", "d", "e"].map((title) => insertTask({ title })?.id ?? "");
    const first = listTasks({ limit: 2 });
    expect(first?.data.map((task) => task.title)).toEqual(["a", "b"]);
    expect(first?.next).toBe(ids[1]);
    const second = listTasks({ limit: 2, after: first?.next ?? "" });
    expect(second?.data.map((task) => task.title)).toEqual(["c", "d"]);
    const third = listTasks({ limit: 2, after: second?.next ?? "" });
    expect(third?.data.map((task) => task.title)).toEqual(["e"]);
    expect(third?.next).toBeNull();
  });

  it("an unknown or removed cursor is not a page: the caller says so instead of repeating rows", () => {
    const task = insertTask({ title: "a" });
    expect(listTasks({ limit: 10, after: "gone" })).toBeUndefined();
    removeTask(task?.id ?? "");
    expect(listTasks({ limit: 10, after: task?.id ?? "" })).toBeUndefined();
  });

  it("an empty store is an empty last page", () => {
    expect(listTasks({ limit: 5 })).toEqual({ data: [], next: null });
  });

  it("stops growing at the cap, and frees room when a task is removed", () => {
    let last = "";
    for (let n = 0; n < MAX_TASKS; n += 1) last = insertTask({ title: String(n) })?.id ?? "";
    expect(insertTask({ title: "one too many" })).toBeUndefined();
    expect(taskCounts().total).toBe(MAX_TASKS);
    removeTask(last);
    expect(insertTask({ title: "fits again" })).toBeDefined();
  });

  it("counts done tasks", () => {
    const a = insertTask({ title: "a" });
    insertTask({ title: "b" });
    changeTask(a?.id ?? "", { done: true });
    expect(taskCounts()).toEqual({ total: 2, done: 1 });
  });
});
`,
  "src/server/validate.server.ts": `import { HttpError, type StandardSchemaV1 } from "@shadow-js/dusk/server";

/**
 * Validates \`input\` with a Standard Schema and returns the value.
 *
 * @throws HttpError 422 with the issues in \`data\` when the input is not valid.
 */
export async function parse<Output>(
  schema: StandardSchemaV1<unknown, Output>,
  input: unknown,
): Promise<Output> {
  const result = await schema["~standard"].validate(input);
  if (result.issues !== undefined) {
    throw new HttpError(422, "Invalid input", {
      expose: true,
      data: {
        issues: result.issues.map((issue) => ({
          message: issue.message,
          path: (issue.path ?? []).map(String),
        })),
      },
    });
  }
  return result.value;
}
`,
});
