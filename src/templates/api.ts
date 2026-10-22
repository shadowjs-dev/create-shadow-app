import { API_FILES } from "./api-files";
import { applyDuskBase } from "./dusk";
import type { Draft } from "./shared";
import { addFiles } from "./starters";

const README = `The routes are files in \`src/routes/api\`: \`tasks/index.ts\` (\`GET\` a page, \`POST\` a task), \`tasks/[id].ts\` (\`GET\`, \`PATCH\`, \`DELETE\`), \`health.ts\` and \`openapi.json.ts\`. The tasks live in memory (\`src/server/tasks.server.ts\`): swap that file for your database and keep the routes.

- Input is checked before a handler runs (\`src/lib/schema.ts\` is a small Standard Schema validator: replace it with Valibot, Zod or ArkType when you like). A wrong body answers 422 with the list of issues, a body over the limit answers 413.
- \`src/server/limits.ts\` rate-limits reads and writes with separate buckets and answers 429 with \`Retry-After\`. The buckets belong to one process: pass a shared \`store\` to \`createRateLimiter\` when you run several.
- \`src/entry-server.ts\` sets the security options. Production answers only for the host of \`APP_URL\`. Browser apps on other origins can call the API only when their origin is listed in \`CORS_ORIGINS\` (comma separated); requests without an \`Origin\` header (curl, servers, mobile apps) are allowed because there are no cookies. Add sessions and you must remove \`csrf.allowMissingOrigin\`.
- \`src/api/spec.ts\` describes every route once. \`GET /api/openapi.json\` serves it, and a test fails when a route file and the description disagree.
- \`dusk.config.ts\` validates \`APP_URL\`, \`CORS_ORIGINS\` and \`PORT\` when the server starts.`;

/** Applies the `api` template to a draft. @since 1.0.0 */
export function applyApi(draft: Draft): void {
  applyDuskBase(draft);
  addFiles(draft, API_FILES);
  draft.env.push({
    name: "CORS_ORIGINS",
    comment:
      "Origins of browser apps that may call the API from another origin, comma separated (https://app.example.com). Empty: same origin only.",
    example: "",
  });
  draft.sections.push({ heading: "API", body: README });
}
