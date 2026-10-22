import { DASHBOARD_FILES } from "./dashboard-files";
import { applyDuskBase } from "./dusk";
import { addDependency, type Draft } from "./shared";
import { addFiles, appSource, siteName } from "./starters";

const README = `A sidebar shell, a customers table and the forms that change it, on typed server functions. The data is in memory (\`src/server/customers.server.ts\`): swap that file for your database and keep the routes, the components and the server functions.

- \`src/routes/index.tsx\` is the overview: totals that refresh every 30 seconds and after any write (\`@shadow-js/query\`).
- \`src/routes/customers\` is the list, the create form and the edit page. The list is a \`@shadow-js/table\` over a server-side page: sorting, search, the status filter and paging run on the server (\`listCustomers\`), the table only holds their state, and the previous page stays on screen while the next one loads.
- \`src/components/CustomerForm.tsx\` is a \`@shadow-js/forms\` form. \`src/lib/customers.ts\` holds the schema both the form and the server functions run, so the browser and the server always agree; a problem only the server can see (an email another customer has) is shown on its field.
- \`src/routes/_layout.tsx\` is the shell: a skip link, a labeled navigation and one main region. The classes use logical properties and the colors come from the \`@shadow-js/ui\` theme, so the page is right to left when you set \`APP_LOCALE\` (for example \`ar\`) and dark when you add the \`dark\` class to \`<html>\`.
- There is no sign-in. Before real data goes in, guard the routes and the server functions: \`@shadow-js/dusk/auth\` has an OIDC guard (\`requireUser\`) for the common providers.
- More components: \`shadow-ui add button dialog dropdown-menu\` copies them into \`src/components/ui\`.`;

/** Applies the `dashboard` template to a draft. @since 1.0.0 */
export function applyDashboard(draft: Draft): void {
  const { files, options } = draft;
  applyDuskBase(draft);
  addDependency(draft, "@shadow-js/query");
  addDependency(draft, "@shadow-js/table");
  addDependency(draft, "@shadow-js/forms");
  addFiles(draft, DASHBOARD_FILES);
  files.set(
    "src/site.ts",
    [
      "/** The name of the dashboard: the sidebar and the page titles use it. */",
      `export const site = { name: ${JSON.stringify(siteName(options.name))} } as const;`,
      "",
    ].join("\n"),
  );
  files.set("src/app.tsx", appSource(draft, ["./index.css"]));
  draft.env.push({
    name: "APP_LOCALE",
    comment:
      "The language of the dashboard (a BCP 47 tag such as en or ar). It sets <html lang> and the page direction.",
    example: "en",
  });
  draft.sections.push({ heading: "Dashboard", body: README });
}
