/** The files of the `dashboard` template that do not depend on the chosen options. @since 1.0.0 */
export const DASHBOARD_FILES: Readonly<Record<string, string>> = Object.freeze({
  "dusk.config.ts": `import { defineConfig } from "@shadow-js/dusk/vite";

export default defineConfig({
  // Checked when the server starts: a wrong value stops it before it serves a request.
  env: {
    APP_URL: { type: "url", default: "http://localhost:3000" },
    APP_LOCALE: { type: "string", default: "en" },
    PORT: { type: "number", integer: true, min: 0, max: 65535, default: 3000 },
  },
  headers: [{ source: "/api/**", headers: { "x-content-type-options": "nosniff" } }],
});
`,
  "src/components/CustomerForm.test.tsx": `import { ValidationError } from "@shadow-js/dusk/server";
import { flush } from "@shadow-js/testing";
import { accessibleMatchers, render, userEvent } from "@shadow-js/testing/dom";
import { expect, it, vi } from "vitest";
import type { CustomerInput } from "../lib/customers";
import { CustomerForm } from "./CustomerForm";

expect.extend(accessibleMatchers);

const noop = () => Promise.resolve(undefined);

it("names every control", () => {
  const view = render(() => (
    <CustomerForm submitLabel="Create" action={noop} onSaved={() => undefined} />
  ));
  for (const label of ["Name", "Email", "Plan", "Status", "Monthly revenue (USD)"]) {
    expect(view.getByLabelText(label)).toBeTruthy();
  }
  expect(view.getByRole("button", { name: "Create" })).toHaveAccessibleName();
});

it("shows what is wrong, calls nothing and focuses the first problem", async () => {
  const action = vi.fn(noop);
  const view = render(() => (
    <CustomerForm submitLabel="Create" action={action} onSaved={() => undefined} />
  ));
  await userEvent.click(view.getByRole("button", { name: "Create" }));
  await flush();
  expect(action).not.toHaveBeenCalled();
  expect(view.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(view.getByLabelText("Name"));
});

it("sends the parsed values: the revenue is a number", async () => {
  const saved: CustomerInput[] = [];
  const done = vi.fn();
  const view = render(() => (
    <CustomerForm
      submitLabel="Create"
      action={(values) => {
        saved.push(values);
        return Promise.resolve(values);
      }}
      onSaved={done}
    />
  ));
  await userEvent.type(view.getByLabelText("Name"), "Ada Lovelace");
  await userEvent.type(view.getByLabelText("Email"), "ada@example.com");
  await userEvent.selectOptions(view.getByLabelText("Plan"), "team");
  await userEvent.clear(view.getByLabelText("Monthly revenue (USD)"));
  await userEvent.type(view.getByLabelText("Monthly revenue (USD)"), "99");
  await userEvent.click(view.getByRole("button", { name: "Create" }));
  await flush();
  expect(saved).toEqual([
    { name: "Ada Lovelace", email: "ada@example.com", plan: "team", status: "active", monthly: 99 },
  ]);
  expect(done).toHaveBeenCalledTimes(1);
});

it("shows a problem the server found on the field it names", async () => {
  const done = vi.fn();
  const view = render(() => (
    <CustomerForm
      submitLabel="Create"
      action={() =>
        Promise.reject(
          new ValidationError([{ message: "Another customer has this email", path: ["email"] }]),
        )
      }
      onSaved={done}
    />
  ));
  await userEvent.type(view.getByLabelText("Name"), "Ada");
  await userEvent.type(view.getByLabelText("Email"), "ada@example.com");
  await userEvent.click(view.getByRole("button", { name: "Create" }));
  await flush();
  expect(done).not.toHaveBeenCalled();
  const email = view.getByLabelText("Email");
  expect(email.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(email.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "Another customer has this email",
  );
});

it("starts from the customer being edited", () => {
  const view = render(() => (
    <CustomerForm
      submitLabel="Save"
      customer={{
        id: "c-1",
        name: "Ada",
        email: "ada@example.com",
        plan: "pro",
        status: "paused",
        monthly: 29,
        createdAt: "2026-01-01T00:00:00.000Z",
      }}
      action={noop}
      onSaved={() => undefined}
    />
  ));
  expect((view.getByLabelText("Name") as HTMLInputElement).value).toBe("Ada");
  expect((view.getByLabelText("Status") as HTMLSelectElement).value).toBe("paused");
  expect((view.getByLabelText("Monthly revenue (USD)") as HTMLInputElement).value).toBe("29");
});
`,
  "src/components/CustomerForm.tsx": `import { Form, type ServerAction, submitWith, useForm } from "@shadow-js/forms";
import { standardSchema } from "@shadow-js/forms/standard-schema";
import { submitErrors } from "@shadow-js/forms/submit-errors";
import {
  type Customer,
  type CustomerInput,
  customerSchema,
  PLANS,
  STATUSES,
} from "../lib/customers";

/** The props of {@link CustomerForm}. */
export interface CustomerFormProps {
  /** The customer being edited; left out, the form starts empty. */
  customer?: Customer;
  /** The text of the submit button. */
  submitLabel: string;
  /** Saves the values: a server function, or anything that returns a promise. A \`ValidationError\` it throws is shown on the fields it names. */
  action: ServerAction<CustomerInput, unknown>;
  /** Called after a save went through. */
  onSaved: () => void;
}

const FIELD = "mt-1 block w-full rounded-md border border-input bg-background px-3 py-2";
const LABEL = "block text-sm font-medium";
const PROBLEM = "mt-1 text-sm text-destructive";

/**
 * The form of a customer, shared by the create and edit pages. It checks the fields in the browser
 * with the schema the server uses, and shows the server's own problems (an email another customer
 * has) on the field.
 */
export function CustomerForm(props: CustomerFormProps) {
  const form = useForm({
    features: [submitErrors],
    resolver: standardSchema(customerSchema),
    defaultValues: {
      name: props.customer?.name ?? "",
      email: props.customer?.email ?? "",
      plan: props.customer?.plan ?? "free",
      status: props.customer?.status ?? "active",
      monthly: String(props.customer?.monthly ?? 0),
    },
    onSubmit: submitWith(props.action, () => props.onSaved()),
  });
  const name = form.field("name");
  const email = form.field("email");
  const plan = form.field("plan");
  const status = form.field("status");
  const monthly = form.field("monthly");
  return (
    <Form form={form} class="max-w-xl space-y-4">
      <div>
        <label class={LABEL} for={name.id}>
          Name
        </label>
        <input class={FIELD} autocomplete="name" {...name.props()} />
        <p class={PROBLEM} id={name.errorId} role="alert">
          {name.error()}
        </p>
      </div>
      <div>
        <label class={LABEL} for={email.id}>
          Email
        </label>
        <input class={FIELD} type="email" dir="ltr" autocomplete="email" {...email.props()} />
        <p class={PROBLEM} id={email.errorId} role="alert">
          {email.error()}
        </p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class={LABEL} for={plan.id}>
            Plan
          </label>
          <select class={FIELD} {...plan.props({ kind: "select" })}>
            {PLANS.map((value) => (
              <option {...plan.optionProps(value)}>{value}</option>
            ))}
          </select>
          <p class={PROBLEM} id={plan.errorId} role="alert">
            {plan.error()}
          </p>
        </div>
        <div>
          <label class={LABEL} for={status.id}>
            Status
          </label>
          <select class={FIELD} {...status.props({ kind: "select" })}>
            {STATUSES.map((value) => (
              <option {...status.optionProps(value)}>{value}</option>
            ))}
          </select>
          <p class={PROBLEM} id={status.errorId} role="alert">
            {status.error()}
          </p>
        </div>
      </div>
      <div>
        <label class={LABEL} for={monthly.id}>
          Monthly revenue (USD)
        </label>
        <input class={FIELD} inputmode="numeric" dir="ltr" {...monthly.props()} />
        <p class={PROBLEM} id={monthly.errorId} role="alert">
          {monthly.error()}
        </p>
      </div>
      <p class={PROBLEM} role="alert">
        {Object.keys(form.errors()).length === 0 ? form.submitError()?.message : undefined}
      </p>
      <button
        type="submit"
        class="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
        disabled={form.isSubmitting()}
      >
        {props.submitLabel}
      </button>
    </Form>
  );
}
`,
  "src/components/CustomerTable.test.tsx": `import { createQueryClient } from "@shadow-js/query";
import { defineRoute } from "@shadow-js/router";
import { flush } from "@shadow-js/testing";
import { accessibleMatchers, userEvent } from "@shadow-js/testing/dom";
import { createRoutesStub } from "@shadow-js/testing/routes";
import { beforeEach, expect, it, vi } from "vitest";
import type { CustomerPage, ListQuery } from "../lib/customers";
import { queryCustomers, resetCustomers } from "../server/customers.server";
import { CustomerTable } from "./CustomerTable";

expect.extend(accessibleMatchers);

beforeEach(() => resetCustomers());

/** Mounts the table at /customers over the real in-memory store. */
async function mount(load: (query: ListQuery) => Promise<CustomerPage>) {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  const stub = createRoutesStub({
    routes: [
      defineRoute("/customers", { component: () => <CustomerTable client={client} load={load} /> }),
    ],
    initialEntries: ["/customers"],
  });
  await stub.router.ready();
  const view = stub.mount();
  await flush();
  return { view, stub, client };
}

const names = (view: HTMLElement) =>
  [...view.querySelectorAll("tbody tr td:first-child")].map((cell) => cell.textContent?.trim());
const summary = (view: HTMLElement) => view.querySelector("nav[aria-label=Pages] p")?.textContent;
const button = (view: HTMLElement, name: string) => {
  const found = [...view.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.trim().startsWith(name),
  );
  if (found === undefined) throw new Error(\`no button "\${name}"\`);
  return found;
};

it("shows the first page the server sends, newest customer first", async () => {
  const load = vi.fn((query: ListQuery) => Promise.resolve(queryCustomers(query)));
  const { view, stub } = await mount(load);
  expect(names(view)).toHaveLength(10);
  expect(names(view)[0]).toBe("Amira Haddad");
  expect(summary(view)).toBe("48 customers, page 1 of 5");
  expect(load).toHaveBeenCalledTimes(1);
  expect(view.querySelector("table")).toHaveAccessibleName();
  stub.dispose();
});

it("sorts on the server and says which column is sorted", async () => {
  const load = vi.fn((query: ListQuery) => Promise.resolve(queryCustomers(query)));
  const { view, stub } = await mount(load);
  await userEvent.click(button(view, "Name"));
  await flush();
  expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "name", desc: false }));
  expect(names(view)[0]).toBe("Amira Haddad");
  expect(view.querySelector("th")?.getAttribute("aria-sort")).toBe("ascending");
  await userEvent.click(button(view, "Name"));
  await flush();
  expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "name", desc: true }));
  expect(names(view)[0]).toBe("Ximena Okafor");
  stub.dispose();
});

it("pages forward and back, and disables the buttons at the ends", async () => {
  const { view, stub } = await mount((query) => Promise.resolve(queryCustomers(query)));
  expect(button(view, "Previous").disabled).toBe(true);
  await userEvent.click(button(view, "Next"));
  await flush();
  expect(summary(view)).toBe("48 customers, page 2 of 5");
  await userEvent.click(button(view, "Previous"));
  await flush();
  expect(summary(view)).toBe("48 customers, page 1 of 5");
  stub.dispose();
});

it("searches, starts again from the first page and says when nothing matches", async () => {
  const { view, stub } = await mount((query) => Promise.resolve(queryCustomers(query)));
  await userEvent.click(button(view, "Next"));
  await flush();
  const search = view.querySelector<HTMLInputElement>("#customer-search");
  if (search === null) throw new Error("no search box");
  await userEvent.type(search, "omar");
  await userEvent.click(
    [...view.querySelectorAll<HTMLButtonElement>("button[type=submit]")].find(
      (candidate) => candidate.textContent === "Search",
    ) ?? search,
  );
  await flush();
  expect(summary(view)).toBe("2 customers, page 1 of 1");
  search.value = "";
  await userEvent.type(search, "no such person");
  await userEvent.click(button(view, "Search"));
  await flush();
  expect(view.querySelector("tbody")?.textContent).toContain("No customers match.");
  stub.dispose();
});

it("filters by status", async () => {
  const load = vi.fn((query: ListQuery) => Promise.resolve(queryCustomers(query)));
  const { view, stub } = await mount(load);
  const select = view.querySelector<HTMLSelectElement>("#customer-status");
  if (select === null) throw new Error("no status filter");
  await userEvent.selectOptions(select, "churned");
  await flush();
  expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ status: "churned", page: 0 }));
  expect(summary(view)).toBe("7 customers, page 1 of 1");
  stub.dispose();
});

it("says so when the customers could not be loaded", async () => {
  const { view, stub } = await mount(() => Promise.reject(new Error("down")));
  expect(view.querySelector("tbody")?.textContent).toContain("The customers could not be loaded.");
  stub.dispose();
});
`,
  "src/components/CustomerTable.tsx": `import { useMemo, useSignal } from "@shadow-js/core";
import { type QueryClient, useQuery } from "@shadow-js/query";
import { A } from "@shadow-js/router";
import {
  type CellContext,
  type Column,
  createColumnHelper,
  createTable,
  type SortingState,
} from "@shadow-js/table";
import { layout } from "@shadow-js/table/layout";
import { For } from "@shadow-js/web";
import {
  type Customer,
  type CustomerPage,
  DEFAULT_QUERY,
  formatMoney,
  type ListQuery,
  type SortKey,
  STATUSES,
  type Status,
} from "../lib/customers";
import { pageLocale } from "../lib/locale";
import { StatusBadge } from "./StatusBadge";

/** The props of {@link CustomerTable}. */
export interface CustomerTableProps {
  /** Loads one page. The pages pass the \`listCustomers\` server function. */
  load: (query: ListQuery) => Promise<CustomerPage>;
  /** The query client that holds the pages. */
  client: QueryClient;
}

const helper = createColumnHelper<Customer>();

/** The header of a sortable column: a button that sorts, and says so in words. */
function SortHeader(props: { column: Column<Customer>; title: string }) {
  const sorted = () => props.column.getIsSorted();
  return (
    <button
      type="button"
      class="inline-flex items-center gap-1 font-medium"
      onClick={() => props.column.toggleSorting()}
    >
      {props.title}
      <span aria-hidden="true">
        {() => (sorted() === "asc" ? "↑" : sorted() === "desc" ? "↓" : "↕")}
      </span>
      <span class="sr-only">
        {() =>
          sorted() === "asc"
            ? ", sorted ascending"
            : sorted() === "desc"
              ? ", sorted descending"
              : ", not sorted"
        }
      </span>
    </button>
  );
}

const columns = [
  helper.accessor("name", {
    header: (context) => <SortHeader column={context.column} title="Name" />,
    cell: (context: CellContext<Customer, string>) => (
      <A
        to="/customers/:id"
        params={{ id: context.row.original.id }}
        class="font-medium underline-offset-4 hover:underline"
      >
        {context.getValue()}
      </A>
    ),
  }),
  helper.accessor("email", {
    header: "Email",
    enableSorting: false,
    cell: (context) => <bdi>{context.getValue()}</bdi>,
  }),
  helper.accessor("plan", {
    header: (context) => <SortHeader column={context.column} title="Plan" />,
  }),
  helper.accessor("status", {
    header: (context) => <SortHeader column={context.column} title="Status" />,
    cell: (context) => <StatusBadge status={context.getValue()} />,
  }),
  helper.accessor("monthly", {
    header: (context) => <SortHeader column={context.column} title="Monthly" />,
    sortDescFirst: true,
    cell: (context) => formatMoney(context.getValue(), pageLocale()),
  }),
  helper.accessor("createdAt", {
    header: (context) => <SortHeader column={context.column} title="Created" />,
    sortDescFirst: true,
    cell: (context) =>
      new Intl.DateTimeFormat(pageLocale(), { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(context.getValue()),
      ),
  }),
];

/**
 * The customers table. Sorting, searching, the status filter and paging happen on the server: the
 * table only holds their state (\`manual*\` options), the query asks the server for the page that state
 * names, and the previous page stays on screen while the next one loads.
 */
export function CustomerTable(props: CustomerTableProps) {
  const [sorting, setSorting] = useSignal<SortingState>([{ id: "createdAt", desc: true }]);
  const [pagination, setPagination] = useSignal({ pageIndex: 0, pageSize: DEFAULT_QUERY.size });
  const [search, setSearch] = useSignal("");
  const [status, setStatus] = useSignal<Status | "all">("all");

  const query = useMemo<ListQuery>(() => {
    const sort = sorting()[0];
    return {
      page: pagination().pageIndex,
      size: pagination().pageSize,
      sort: (sort?.id ?? DEFAULT_QUERY.sort) as SortKey,
      desc: sort?.desc ?? DEFAULT_QUERY.desc,
      q: search(),
      status: status(),
    };
  });
  const result = useQuery(
    () => ["customers", query()],
    () => props.load(query()),
    {
      client: props.client,
      keepPreviousData: true,
    },
  );

  const table = createTable<Customer>({
    data: () => result.data()?.rows ?? [],
    columns,
    features: [layout],
    getRowId: (row) => row.id,
    manualSorting: true,
    manualPagination: true,
    get pageCount() {
      return result.data()?.pages ?? -1;
    },
    state: { sorting, pagination },
    onStateChange: (name, value) => {
      if (name === "sorting") setSorting(value as SortingState);
      if (name === "pagination") setPagination(value as { pageIndex: number; pageSize: number });
    },
  });

  /** A new search or filter starts again from the first page. */
  const restart = () => setPagination({ pageIndex: 0, pageSize: pagination().pageSize });

  return (
    <section>
      <form
        class="mb-4 flex flex-wrap items-end gap-3"
        aria-label="Search customers"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("q");
          setSearch(input instanceof HTMLInputElement ? input.value.trim() : "");
          restart();
        }}
      >
        <div>
          <label class="block text-sm font-medium" for="customer-search">
            Search
          </label>
          <input
            id="customer-search"
            name="q"
            type="search"
            class="mt-1 rounded-md border border-input bg-background px-3 py-2"
            placeholder="Name or email"
            maxlength="80"
          />
        </div>
        <div>
          <label class="block text-sm font-medium" for="customer-status">
            Status
          </label>
          <select
            id="customer-status"
            class="mt-1 rounded-md border border-input bg-background px-3 py-2"
            onChange={(event) => {
              const value = event.currentTarget.value;
              setStatus(STATUSES.find((entry) => entry === value) ?? "all");
              restart();
            }}
          >
            <option value="all">All</option>
            <For each={STATUSES}>{(value) => <option value={value}>{value}</option>}</For>
          </select>
        </div>
        <button type="submit" class="rounded-md border px-4 py-2 font-medium">
          Search
        </button>
        <A
          to="/customers/new"
          class="ms-auto rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
        >
          New customer
        </A>
      </form>

      <div class="relative overflow-x-auto rounded-lg border" aria-busy={result.isFetching()}>
        <table class="w-full text-start text-sm" aria-label="Customers">
          <thead class="bg-muted text-muted-foreground">
            {() =>
              table.getHeaderGroups().map((group) => (
                <tr>
                  {group.headers.map((header) => (
                    <th
                      scope="col"
                      class="px-3 py-2 text-start"
                      aria-sort={
                        header.column.getCanSort()
                          ? header.column.getIsSorted() === "asc"
                            ? "ascending"
                            : header.column.getIsSorted() === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                    >
                      {typeof header.column.columnDef.header === "function"
                        ? header.column.columnDef.header(header.getContext())
                        : header.column.columnDef.header}
                    </th>
                  ))}
                </tr>
              ))
            }
          </thead>
          <tbody>
            {() => {
              const rows = table.getRowModel().rows;
              if (rows.length === 0) {
                return (
                  <tr>
                    <td
                      class="px-3 py-6 text-center text-muted-foreground"
                      colSpan={columns.length}
                    >
                      {result.status() === "pending"
                        ? "Loading customers…"
                        : result.status() === "error"
                          ? "The customers could not be loaded."
                          : "No customers match."}
                    </td>
                  </tr>
                );
              }
              return rows.map((row) => (
                <tr class="border-t">
                  {row.getVisibleCells().map((cell) => {
                    const render = cell.column.columnDef.cell;
                    return (
                      <td class="px-3 py-2">
                        {typeof render === "function"
                          ? render(cell.getContext())
                          : cell.renderValue()}
                      </td>
                    );
                  })}
                </tr>
              ));
            }}
          </tbody>
        </table>
      </div>

      <nav class="mt-4 flex items-center justify-between gap-3" aria-label="Pages">
        <p class="text-sm text-muted-foreground" aria-live="polite">
          {() => {
            const page = result.data();
            return page === undefined
              ? ""
              : \`\${page.total} customers, page \${pagination().pageIndex + 1} of \${page.pages}\`;
          }}
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-md border px-3 py-1.5 disabled:opacity-50"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Previous
          </button>
          <button
            type="button"
            class="rounded-md border px-3 py-1.5 disabled:opacity-50"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
          </button>
        </div>
      </nav>
    </section>
  );
}
`,
  "src/components/NotFound.tsx": `import { A } from "@shadow-js/router";

export function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>There is nothing at this address.</p>
      <A to="/">Back to the start</A>
    </section>
  );
}
`,
  "src/components/OverviewPanel.test.tsx": `import { createQueryClient } from "@shadow-js/query";
import { flush } from "@shadow-js/testing";
import { accessibleMatchers, render } from "@shadow-js/testing/dom";
import { beforeEach, expect, it } from "vitest";
import { overview, resetCustomers } from "../server/customers.server";
import { OverviewPanel } from "./OverviewPanel";

expect.extend(accessibleMatchers);

beforeEach(() => resetCustomers());

const client = () => createQueryClient({ defaultOptions: { queries: { retry: false } } });

it("shows the totals of the server once they arrive", async () => {
  const view = render(() => (
    <OverviewPanel client={client()} load={() => Promise.resolve(overview())} />
  ));
  expect(view.container.textContent).toContain("…");
  await flush();
  const text = view.container.querySelector("dl")?.textContent ?? "";
  expect(text).toContain("Customers48");
  expect(text).toContain("Monthly revenue$");
  expect(view.container.querySelectorAll("h1")).toHaveLength(1);
  for (const bar of view.getAllByRole("progressbar")) expect(bar).toHaveAccessibleName();
});

it("says so when the totals could not be loaded", async () => {
  const view = render(() => (
    <OverviewPanel client={client()} load={() => Promise.reject(new Error("down"))} />
  ));
  await flush();
  expect(view.getByRole("status").textContent).toBe("The totals could not be loaded.");
});
`,
  "src/components/OverviewPanel.tsx": `import { type QueryClient, useQuery } from "@shadow-js/query";
import { formatMoney, type Overview, PLANS } from "../lib/customers";
import { pageLocale } from "../lib/locale";
import { Stat } from "./Stat";

/** The props of {@link OverviewPanel}. */
export interface OverviewPanelProps {
  /** Loads the totals. The page passes the \`getOverview\` server function. */
  load: () => Promise<Overview>;
  /** The query client that holds them. */
  client: QueryClient;
}

/** The totals refresh every 30 seconds while the panel is open, and after any write. */
export function OverviewPanel(props: OverviewPanelProps) {
  const overview = useQuery(["overview"], () => props.load(), {
    client: props.client,
    refetchInterval: 30_000,
  });
  const number = (value: number | undefined) =>
    value === undefined ? "…" : new Intl.NumberFormat(pageLocale()).format(value);
  const money = (value: number | undefined) =>
    value === undefined ? "…" : formatMoney(value, pageLocale());
  return (
    <section aria-labelledby="overview-title" aria-busy={overview.status() === "pending"}>
      <h1 id="overview-title" class="text-2xl font-semibold">
        Overview
      </h1>
      <p class="mt-1 text-muted-foreground" role="status">
        {() => (overview.status() === "error" ? "The totals could not be loaded." : "")}
      </p>
      <dl class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Customers" value={number(overview.data()?.customers)} />
        <Stat label="Active" value={number(overview.data()?.active)} />
        <Stat label="Monthly revenue" value={money(overview.data()?.monthly)} />
        <Stat label="New this month" value={number(overview.data()?.newThisMonth)} />
      </dl>
      <h2 class="mt-8 text-lg font-semibold">Customers by plan</h2>
      <ul class="mt-3 space-y-2">
        {PLANS.map((plan) => (
          <li class="flex items-center gap-3">
            <span class="w-16">{plan}</span>
            <progress
              class="h-2 w-full max-w-xs"
              aria-label={\`\${plan} customers\`}
              max={overview.data()?.customers ?? 1}
              value={overview.data()?.byPlan[plan] ?? 0}
            />
            <span class="tabular-nums">{() => number(overview.data()?.byPlan[plan])}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
`,
  "src/components/Stat.tsx": `import type { JSX } from "@shadow-js/web";

/** One figure of the overview: a label and a value. */
export function Stat(props: { label: string; value: JSX.Element | string | number }) {
  return (
    <div class="rounded-lg border bg-card p-4 text-card-foreground">
      <dt class="text-sm text-muted-foreground">{props.label}</dt>
      <dd class="mt-1 text-2xl font-semibold tabular-nums">{props.value}</dd>
    </div>
  );
}
`,
  "src/components/StatusBadge.tsx": `import type { Status } from "../lib/customers";

const TONE: Record<Status, string> = {
  active: "bg-primary text-primary-foreground",
  paused: "bg-muted text-muted-foreground",
  churned: "border border-destructive text-destructive",
};

/** A status as text with a color: the word carries the meaning, the color only helps. */
export function StatusBadge(props: { status: Status }) {
  return (
    <span class={\`inline-flex rounded-md px-2 py-0.5 text-xs font-medium \${TONE[props.status]}\`}>
      {props.status}
    </span>
  );
}
`,
  "src/entry-server.ts": `import type { HandlerOptions, Middleware } from "@shadow-js/dusk/server";
import { directionOf } from "./lib/direction";

const appUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");
const locale = process.env.APP_LOCALE ?? "en";

/** Writes \`lang\` and \`dir\` on <html> from APP_LOCALE, so a right-to-left dashboard is right-to-left from the first byte. */
const documentLocale: Middleware = (event, next) => {
  event.document.lang = locale;
  event.document.dir = directionOf(locale);
  return next();
};

/** Options of the request handler. Everything here has a safe default; see the Dusk docs. */
export const options = {
  middleware: [documentLocale],
  security: {
    // The Host header is attacker input: production answers only for the host of APP_URL.
    ...(import.meta.env.PROD ? { allowedHosts: [appUrl.hostname] } : {}),
    headers: { hsts: { maxAge: 63_072_000, includeSubDomains: true } },
    // A strict Content-Security-Policy with a fresh nonce per request. Production only: the dev server
    // injects inline scripts. Add sources by directive when you load something from another origin.
    ...(import.meta.env.PROD ? { csp: {} } : {}),
  },
} satisfies Omit<HandlerOptions, "manifest">;

export default options;
`,
  "src/lib/client.ts": `import { createQueryClient } from "@shadow-js/query";

/**
 * The one query client of the browser. On the server \`useQuery\` fetches nothing (it reads what is in
 * the client), so no data of one visitor can reach another through it. Data younger than \`staleTime\`
 * is not fetched again; the lists and the overview refetch when they are invalidated by a write.
 */
export const client = createQueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

/** Marks every list and the overview as out of date after a write, so mounted pages refetch. */
export async function refreshCustomers(): Promise<void> {
  await Promise.all([
    client.invalidate({ key: ["customers"] }),
    client.invalidate({ key: ["overview"] }),
  ]);
}
`,
  "src/lib/customers.test.ts": `import { describe, expect, it } from "vitest";
import { checkCustomer, DEFAULT_QUERY, formatMoney, listQuerySchema } from "./customers";

describe("checkCustomer", () => {
  it("trims the text and turns the revenue into a number", () => {
    expect(
      checkCustomer({
        name: "  Ada  ",
        email: " ada@example.com ",
        plan: "pro",
        status: "active",
        monthly: "49",
      }),
    ).toEqual({
      value: { name: "Ada", email: "ada@example.com", plan: "pro", status: "active", monthly: 49 },
    });
  });

  it("names every field that is wrong", () => {
    const result = checkCustomer({
      name: "",
      email: "nope",
      plan: "gold",
      status: "x",
      monthly: "-1",
    });
    if (!("issues" in result)) throw new Error("expected issues");
    expect(result.issues.map((issue) => issue.path?.[0]).sort()).toEqual([
      "email",
      "monthly",
      "name",
      "plan",
      "status",
    ]);
  });

  it("refuses anything that is not an object, text that is too long and a fractional revenue", () => {
    for (const input of [null, undefined, 3, "x"])
      expect(checkCustomer(input)).toHaveProperty("issues");
    const long = checkCustomer({
      name: "x".repeat(81),
      email: "a@b.co",
      plan: "free",
      status: "active",
      monthly: 0,
    });
    expect(long).toHaveProperty("issues");
    const fraction = checkCustomer({
      name: "a",
      email: "a@b.co",
      plan: "free",
      status: "active",
      monthly: 1.5,
    });
    expect(fraction).toHaveProperty("issues");
  });
});

describe("listQuerySchema", () => {
  const check = (input: unknown) => listQuerySchema["~standard"].validate(input);

  it("fills what is left out from the defaults", () => {
    expect(check({})).toEqual({ value: DEFAULT_QUERY });
  });

  it("accepts a full query and trims the search", () => {
    expect(
      check({ page: 2, size: 25, sort: "monthly", desc: false, q: " ada ", status: "paused" }),
    ).toEqual({
      value: { page: 2, size: 25, sort: "monthly", desc: false, q: "ada", status: "paused" },
    });
  });

  it("refuses a sort column, a page size or a status it does not know", () => {
    for (const bad of [
      { sort: "email" },
      { size: 0 },
      { size: 101 },
      { page: -1 },
      { status: "gone" },
      { desc: "yes" },
    ]) {
      expect(check(bad), JSON.stringify(bad)).toHaveProperty("issues");
    }
  });
});

describe("formatMoney", () => {
  it("writes whole dollars the way the locale does", () => {
    expect(formatMoney(1200, "en")).toBe("$1,200");
    expect(formatMoney(0, "en")).toBe("$0");
  });
});
`,
  "src/lib/customers.ts": `import { choiceField, defineSchema, field, type Issue, textField, wholeField } from "./schema";

/** The plans a customer can have. */
export const PLANS = ["free", "pro", "team"] as const;
export type Plan = (typeof PLANS)[number];

/** The states of a customer account. */
export const STATUSES = ["active", "paused", "churned"] as const;
export type Status = (typeof STATUSES)[number];

/** The columns a list can be sorted by. */
export const SORT_KEYS = ["name", "plan", "status", "monthly", "createdAt"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** One customer. \`monthly\` is the monthly revenue in whole dollars. */
export interface Customer {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  status: Status;
  monthly: number;
  createdAt: string;
}

/** What a form sends to create or update a customer. */
export interface CustomerInput {
  name: string;
  email: string;
  plan: Plan;
  status: Status;
  monthly: number;
}

/** Checks the fields of a customer: the form runs it in the browser and the server runs it again. */
export function checkCustomer(input: unknown): { value: CustomerInput } | { issues: Issue[] } {
  const issues: Issue[] = [];
  const name = textField(input, "name", 80, issues);
  const email = textField(input, "email", 120, issues);
  if (email !== "" && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    issues.push({ message: "Enter an email address", path: ["email"] });
  }
  const plan = choiceField(input, "plan", PLANS, issues);
  const status = choiceField(input, "status", STATUSES, issues);
  const monthly = wholeField(input, "monthly", 0, 100_000, issues);
  return issues.length > 0 ? { issues } : { value: { name, email, plan, status, monthly } };
}

/** The values of the customer form: every control holds text. */
export interface CustomerValues {
  name: string;
  email: string;
  plan: string;
  status: string;
  monthly: string;
}

/** {@link checkCustomer} as the resolver of the form: text in, a {@link CustomerInput} out. */
export const customerSchema = defineSchema<CustomerInput, CustomerValues>(checkCustomer);

/** {@link checkCustomer} as the input of the server functions, which take a {@link CustomerInput}. */
export const customerInputSchema = defineSchema<CustomerInput, CustomerInput>(checkCustomer);

/** Which rows a list shows: a page, an order, a search text and a status. */
export interface ListQuery {
  page: number;
  size: number;
  sort: SortKey;
  desc: boolean;
  q: string;
  status: Status | "all";
}

/** The start of every list: the newest customers first. */
export const DEFAULT_QUERY: ListQuery = {
  page: 0,
  size: 10,
  sort: "createdAt",
  desc: true,
  q: "",
  status: "all",
};

/** Checks a list query. A field left out takes its default; a wrong one is an issue. */
export const listQuerySchema = defineSchema<ListQuery>((input) => {
  const issues: Issue[] = [];
  const query = { ...DEFAULT_QUERY };
  if (field(input, "page") !== undefined) query.page = wholeField(input, "page", 0, 10_000, issues);
  if (field(input, "size") !== undefined) query.size = wholeField(input, "size", 1, 100, issues);
  if (field(input, "sort") !== undefined)
    query.sort = choiceField(input, "sort", SORT_KEYS, issues);
  const desc = field(input, "desc");
  if (desc !== undefined) {
    if (typeof desc === "boolean") query.desc = desc;
    else issues.push({ message: "true or false", path: ["desc"] });
  }
  const q = field(input, "q");
  if (q !== undefined) {
    if (typeof q === "string" && q.length <= 80) query.q = q.trim();
    else issues.push({ message: "At most 80 characters", path: ["q"] });
  }
  if (field(input, "status") !== undefined) {
    const status = field(input, "status");
    query.status = status === "all" ? "all" : choiceField(input, "status", STATUSES, issues);
  }
  return issues.length > 0 ? { issues } : { value: query };
});

/** One page of a list: its rows, how many customers match and how many pages that is. */
export interface CustomerPage {
  rows: Customer[];
  total: number;
  pages: number;
}

/** Totals for the overview. */
export interface Overview {
  customers: number;
  active: number;
  monthly: number;
  newThisMonth: number;
  byPlan: Record<Plan, number>;
}

/**
 * Formats whole dollars for a locale (\`$1,200\` in English, the locale's digits in Arabic).
 *
 * @param amount Whole dollars.
 * @param locale A BCP 47 tag.
 */
export function formatMoney(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
`,
  "src/lib/direction.test.ts": `import { describe, expect, it } from "vitest";
import { directionOf } from "./direction";

describe("directionOf", () => {
  it("is right to left for the right-to-left languages, with or without a region", () => {
    for (const locale of ["ar", "ar-EG", "he", "fa-IR", "ur", "ps"])
      expect(directionOf(locale), locale).toBe("rtl");
  });

  it("is left to right for the others", () => {
    for (const locale of ["en", "en-US", "fr", "de-CH", "ja", ""])
      expect(directionOf(locale), locale).toBe("ltr");
  });

  it("follows the script when the tag names one", () => {
    expect(directionOf("az-Arab")).toBe("rtl");
    expect(directionOf("ar-Latn")).toBe("ltr");
    expect(directionOf("pa_Arab_PK")).toBe("rtl");
  });
});
`,
  "src/lib/direction.ts": `const RTL_LANGUAGES = new Set([
  "ar",
  "arc",
  "ckb",
  "dv",
  "fa",
  "he",
  "ks",
  "ps",
  "sd",
  "ug",
  "ur",
  "yi",
]);
const RTL_SCRIPTS = new Set(["arab", "hebr", "thaa", "syrc", "nkoo", "adlm", "rohg"]);

/**
 * The writing direction of a locale: \`"rtl"\` for Arabic, Hebrew, Persian, Urdu and the other
 * right-to-left languages, or for any language written in a right-to-left script (\`az-Arab\`);
 * \`"ltr"\` for everything else. It reads the language and script subtags only, so it gives the same
 * answer in every runtime.
 *
 * @param locale A BCP 47 tag such as \`en\`, \`ar-EG\` or \`sr-Latn\`.
 * @returns The value for the \`dir\` attribute.
 */
export function directionOf(locale: string): "ltr" | "rtl" {
  const parts = locale.trim().toLowerCase().split(/[-_]/);
  const script = parts.slice(1).find((part) => part.length === 4);
  if (script !== undefined) return RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
  return RTL_LANGUAGES.has(parts[0] ?? "") ? "rtl" : "ltr";
}
`,
  "src/lib/locale.ts": `/** The language of the page: \`<html lang>\` in the browser (the server writes it from \`APP_LOCALE\`), English while rendering without a document. */
export function pageLocale(): string {
  return typeof document === "undefined" ? "en" : document.documentElement.lang || "en";
}
`,
  "src/lib/schema.ts": `import type { StandardSchemaV1 } from "@shadow-js/forms/standard-schema";

/** One problem found while validating input. */
export interface Issue {
  message: string;
  path?: string[];
}

/**
 * Builds a Standard Schema, the interface Zod, Valibot and ArkType also implement, so a form and a
 * server function can share one. This one has no dependency; swap it for a library when your inputs
 * grow.
 */
export function defineSchema<Output, Input = unknown>(
  check: (input: unknown) => { value: Output } | { issues: Issue[] },
): StandardSchemaV1<Input, Output> {
  return { "~standard": { version: 1, vendor: "app", validate: check } };
}

/** Reads a field of an unknown value, or \`undefined\` when the value is not an object. */
export function field(input: unknown, name: string): unknown {
  return typeof input === "object" && input !== null ? Reflect.get(input, name) : undefined;
}

/** Reads a text field, trimmed, or reports why it is not usable. */
export function textField(input: unknown, name: string, max: number, issues: Issue[]): string {
  const value = field(input, name);
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ message: "Required", path: [name] });
    return "";
  }
  if (value.trim().length > max) {
    issues.push({ message: \`At most \${max} characters\`, path: [name] });
  }
  return value.trim();
}

/** Reads a field that must be one of \`choices\`. */
export function choiceField<Choice extends string>(
  input: unknown,
  name: string,
  choices: readonly Choice[],
  issues: Issue[],
): Choice {
  const value = field(input, name);
  const found = choices.find((choice) => choice === value);
  if (found === undefined) {
    issues.push({ message: \`One of: \${choices.join(", ")}\`, path: [name] });
    return choices[0] as Choice;
  }
  return found;
}

/** Reads a whole number from a number or a numeric string, between \`min\` and \`max\`. */
export function wholeField(
  input: unknown,
  name: string,
  min: number,
  max: number,
  issues: Issue[],
): number {
  const value = field(input, name);
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(number) || number < min || number > max) {
    issues.push({ message: \`A whole number from \${min} to \${max}\`, path: [name] });
    return min;
  }
  return number;
}
`,
  "src/routes/[...rest].tsx": `import { notFound as raiseNotFound } from "@shadow-js/router";
import { NotFound } from "../components/NotFound";

/** Matches every URL no other route matches and answers it with a 404 and the not-found page. */
export const beforeLoad = () => {
  throw raiseNotFound();
};

export function notFound() {
  return <NotFound />;
}

export default function Missing() {
  return null;
}
`,
  "src/routes/_layout.test.tsx": `import { defineRoute } from "@shadow-js/router";
import { accessibleMatchers } from "@shadow-js/testing/dom";
import { createRoutesStub } from "@shadow-js/testing/routes";
import { expect, it } from "vitest";
import Layout from "./_layout";

expect.extend(accessibleMatchers);

it("has a skip link, one main region, a named navigation and marks the current page", async () => {
  const stub = createRoutesStub({
    routes: [
      defineRoute("/", { component: Layout }),
      defineRoute("/customers", { component: Layout }),
    ],
    initialEntries: ["/customers"],
  });
  await stub.router.ready();
  const view = stub.mount();
  expect(view.querySelectorAll("main")).toHaveLength(1);
  expect(view.querySelector("a[href='#main']")).toHaveAccessibleName();
  const nav = view.querySelector("nav");
  expect(nav?.getAttribute("aria-label")).toBe("Main");
  const current = [...view.querySelectorAll("nav a")].filter(
    (link) => link.getAttribute("aria-current") === "page",
  );
  expect(current.map((link) => link.textContent?.trim())).toEqual(["Customers"]);
  stub.dispose();
});
`,
  "src/routes/_layout.tsx": `import type { Metadata, Viewport } from "@shadow-js/dusk";
import { A, Outlet, type RouteErrorProps } from "@shadow-js/router";
import { NotFound } from "../components/NotFound";
import { site } from "../site";

export const metadata: Metadata = {
  title: { default: site.name, template: \`%s · \${site.name}\` },
  robots: { index: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const LINK = "block rounded-md px-3 py-2 font-medium hover:bg-sidebar-accent";
const CURRENT = "bg-sidebar-accent text-sidebar-accent-foreground";

/** The shell of every page: a skip link, the sidebar and the page. The sidebar stacks above the page on a narrow screen. */
export default function Layout() {
  return (
    <div class="min-h-screen bg-background text-foreground md:grid md:grid-cols-[15rem_1fr]">
      <a
        href="#main"
        class="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-10 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        Skip to the content
      </a>
      <aside class="border-b bg-sidebar p-4 text-sidebar-foreground md:border-b-0 md:border-e">
        <p class="mb-4 px-3 text-lg font-semibold">{site.name}</p>
        <nav aria-label="Main">
          <ul class="flex gap-1 md:flex-col">
            <li>
              <A to="/" end class={LINK} activeClass={CURRENT}>
                Overview
              </A>
            </li>
            <li>
              <A to="/customers" class={LINK} activeClass={CURRENT}>
                Customers
              </A>
            </li>
          </ul>
        </nav>
      </aside>
      <main id="main" class="min-w-0 p-4 md:p-8" tabindex="-1">
        <Outlet />
      </main>
    </div>
  );
}

/** Shown in place of a page whose loader or component threw. "Try again" renders it again. */
export function error(props: RouteErrorProps) {
  return (
    <section>
      <h1 class="text-2xl font-semibold">Something went wrong</h1>
      <p class="mt-2 text-muted-foreground">
        {props.error instanceof Error ? props.error.message : "Unexpected error"}
      </p>
      <button
        type="button"
        class="mt-4 rounded-md border px-4 py-2 font-medium"
        onClick={props.reset}
      >
        Try again
      </button>
    </section>
  );
}

/** The fallback when notFound() is called where no closer route shows its own page. */
export function notFound() {
  return <NotFound />;
}
`,
  "src/routes/customers/[id].tsx": `import { useSignal } from "@shadow-js/core";
import type { Metadata, MetadataArgs } from "@shadow-js/dusk";
import { useMutation } from "@shadow-js/query";
import { A, useLoaderData, useNavigate } from "@shadow-js/router";
import { CustomerForm } from "../../components/CustomerForm";
import { NotFound } from "../../components/NotFound";
import { client, refreshCustomers } from "../../lib/client";
import type { Customer } from "../../lib/customers";
import { deleteCustomer, getCustomer, updateCustomer } from "../../server/customers";

export const loader = ({ params }: { params: { id: string } }) => getCustomer({ id: params.id });

type CustomerArgs = MetadataArgs<{ id: string }, Customer>;

export const generateMetadata = ({ loaderData }: CustomerArgs): Metadata => ({
  title: loaderData?.name ?? "Customer",
});

/** Shown, with a 404, when getCustomer() calls notFound() for an unknown id. */
export function notFound() {
  return <NotFound />;
}

export default function EditCustomer() {
  const customer = useLoaderData<Customer>();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useSignal(false);
  const removal = useMutation((id: string) => deleteCustomer({ id }), {
    client,
    onSuccess: async () => {
      await refreshCustomers();
      await navigate("/customers");
    },
  });
  return (
    <section>
      <A to="/customers" class="text-sm underline-offset-4 hover:underline">
        Back to the customers
      </A>
      <h1 class="mb-6 mt-2 text-2xl font-semibold">{() => customer()?.name}</h1>
      {() => {
        const current = customer();
        if (current === undefined) return null;
        return (
          <>
            <CustomerForm
              customer={current}
              submitLabel="Save changes"
              action={(values, options) => updateCustomer({ id: current.id, ...values }, options)}
              onSaved={() => {
                void refreshCustomers();
                void navigate("/customers");
              }}
            />
            <div class="mt-10 max-w-xl border-t pt-6">
              <h2 class="text-lg font-semibold">Delete customer</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                This removes the customer from the list. It cannot be undone.
              </p>
              <div class="mt-3 flex gap-2">
                {confirming() ? (
                  <>
                    <button
                      type="button"
                      class="rounded-md bg-destructive px-4 py-2 font-medium text-white disabled:opacity-50"
                      disabled={removal.isPending()}
                      onClick={() => removal.mutate(current.id)}
                    >
                      Yes, delete {current.name}
                    </button>
                    <button
                      type="button"
                      class="rounded-md border px-4 py-2 font-medium"
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    class="rounded-md border border-destructive px-4 py-2 font-medium text-destructive"
                    onClick={() => setConfirming(true)}
                  >
                    Delete
                  </button>
                )}
              </div>
              <p class="mt-2 text-sm text-destructive" role="alert">
                {() => (removal.status() === "error" ? "The customer could not be deleted." : "")}
              </p>
            </div>
          </>
        );
      }}
    </section>
  );
}
`,
  "src/routes/customers/index.tsx": `import type { Metadata } from "@shadow-js/dusk";
import { CustomerTable } from "../../components/CustomerTable";
import { client } from "../../lib/client";
import { listCustomers } from "../../server/customers";

export const metadata: Metadata = { title: "Customers" };

export default function Customers() {
  return (
    <>
      <h1 class="mb-4 text-2xl font-semibold">Customers</h1>
      <CustomerTable client={client} load={(query) => listCustomers(query)} />
    </>
  );
}
`,
  "src/routes/customers/new.tsx": `import type { Metadata } from "@shadow-js/dusk";
import { A, useNavigate } from "@shadow-js/router";
import { CustomerForm } from "../../components/CustomerForm";
import { refreshCustomers } from "../../lib/client";
import { createCustomer } from "../../server/customers";

export const metadata: Metadata = { title: "New customer" };

export default function NewCustomer() {
  const navigate = useNavigate();
  return (
    <section>
      <A to="/customers" class="text-sm underline-offset-4 hover:underline">
        Back to the customers
      </A>
      <h1 class="mb-6 mt-2 text-2xl font-semibold">New customer</h1>
      <CustomerForm
        submitLabel="Create customer"
        action={(values, options) => createCustomer(values, options)}
        onSaved={() => {
          void refreshCustomers();
          void navigate("/customers");
        }}
      />
    </section>
  );
}
`,
  "src/routes/index.tsx": `import type { Metadata } from "@shadow-js/dusk";
import { OverviewPanel } from "../components/OverviewPanel";
import { client } from "../lib/client";
import { getOverview } from "../server/customers";

export const metadata: Metadata = { title: "Overview" };

export default function Overview() {
  return <OverviewPanel client={client} load={() => getOverview()} />;
}
`,
  "src/server/customers.server.ts": `import {
  type Customer,
  type CustomerInput,
  type CustomerPage,
  type ListQuery,
  type Overview,
  PLANS,
  type Plan,
  type Status,
} from "../lib/customers";

/**
 * An in-memory customer store, so the template runs with no database. It belongs to one process and
 * starts again from the sample data on every restart: replace the functions of this file with
 * queries to your database and keep their signatures.
 */

/** The most customers the store holds. */
export const MAX_CUSTOMERS = 10_000;

const FIRST_NAMES = [
  "Amira",
  "Bruno",
  "Chen",
  "Dalia",
  "Emeka",
  "Farah",
  "Gustavo",
  "Hana",
  "Ivan",
  "Jamal",
  "Keiko",
  "Lucia",
  "Mateo",
  "Nadia",
  "Omar",
  "Priya",
  "Quinn",
  "Rania",
  "Sven",
  "Tala",
  "Uma",
  "Viktor",
  "Wen",
  "Ximena",
] as const;
const LAST_NAMES = ["Haddad", "Okafor", "Silva", "Tanaka"] as const;
const DAY = 86_400_000;

const store = new Map<string, Customer>();
let counter = 0;

function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

function nextId(): string {
  counter += 1;
  return \`c-\${counter}\`;
}

/** Fills the store with 48 customers, the newest created today. Called once and by the tests. */
export function resetCustomers(now = Date.now()): void {
  store.clear();
  counter = 0;
  for (let index = 0; index < 48; index += 1) {
    const first = FIRST_NAMES[index % FIRST_NAMES.length] ?? "Sam";
    const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length] ?? "Lee";
    const plan: Plan = PLANS[index % PLANS.length] ?? "free";
    const status: Status = index % 7 === 0 ? "churned" : index % 5 === 0 ? "paused" : "active";
    const id = nextId();
    store.set(id, {
      id,
      name: \`\${first} \${last}\`,
      email: \`\${first}.\${last}@example.com\`.toLowerCase(),
      plan,
      status,
      monthly: status === "active" ? ([0, 29, 99][PLANS.indexOf(plan)] ?? 0) : 0,
      createdAt: new Date(now - index * 3 * DAY).toISOString(),
    });
  }
}

resetCustomers();

function matches(customer: Customer, query: ListQuery): boolean {
  if (query.status !== "all" && customer.status !== query.status) return false;
  if (query.q === "") return true;
  const needle = query.q.toLowerCase();
  return customer.name.toLowerCase().includes(needle) || customer.email.includes(needle);
}

function compare(a: Customer, b: Customer, query: ListQuery): number {
  const key = query.sort;
  const order =
    key === "monthly"
      ? a.monthly - b.monthly
      : String(a[key]).localeCompare(String(b[key]), "en", { sensitivity: "base" });
  const signed = query.desc ? -order : order;
  return signed !== 0 ? signed : a.id.localeCompare(b.id, "en", { numeric: true });
}

/** One page of the customers that match \`query\`, in its order. */
export function queryCustomers(query: ListQuery): CustomerPage {
  const matching = [...store.values()].filter((customer) => matches(customer, query));
  matching.sort((a, b) => compare(a, b, query));
  const start = query.page * query.size;
  return {
    rows: matching.slice(start, start + query.size),
    total: matching.length,
    pages: Math.max(1, Math.ceil(matching.length / query.size)),
  };
}

/** One customer, or \`undefined\` when there is none with this id. */
export function findCustomer(id: string): Customer | undefined {
  return store.get(id);
}

/** Why a write was refused: the store is full, or the email belongs to another customer. */
export type WriteFailure = "full" | "email";

function emailTaken(email: string, except?: string): boolean {
  const key = emailKey(email);
  for (const customer of store.values()) {
    if (customer.id !== except && customer.email === key) return true;
  }
  return false;
}

/** Adds a customer, or says why it could not. */
export function insertCustomer(input: CustomerInput): Customer | WriteFailure {
  if (store.size >= MAX_CUSTOMERS) return "full";
  if (emailTaken(input.email)) return "email";
  const id = nextId();
  const customer: Customer = {
    id,
    ...input,
    email: emailKey(input.email),
    createdAt: new Date().toISOString(),
  };
  store.set(id, customer);
  return customer;
}

/** Replaces the fields of a customer, or says why it could not; \`undefined\` when it does not exist. */
export function changeCustomer(
  id: string,
  input: CustomerInput,
): Customer | WriteFailure | undefined {
  const current = store.get(id);
  if (current === undefined) return undefined;
  if (emailTaken(input.email, id)) return "email";
  const customer: Customer = { ...current, ...input, email: emailKey(input.email) };
  store.set(id, customer);
  return customer;
}

/** Removes a customer. Returns whether there was one. */
export function removeCustomer(id: string): boolean {
  return store.delete(id);
}

/** The totals of the overview page. */
export function overview(now = Date.now()): Overview {
  const byPlan: Record<Plan, number> = { free: 0, pro: 0, team: 0 };
  let active = 0;
  let monthly = 0;
  let newThisMonth = 0;
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  for (const customer of store.values()) {
    byPlan[customer.plan] += 1;
    if (customer.status === "active") {
      active += 1;
      monthly += customer.monthly;
    }
    if (Date.parse(customer.createdAt) >= monthStart.getTime()) newThisMonth += 1;
  }
  return { customers: store.size, active, monthly, newThisMonth, byPlan };
}
`,
  "src/server/customers.test.ts": `// @vitest-environment node
import { isNotFound } from "@shadow-js/dusk/server";
import { createTestEvent } from "@shadow-js/dusk/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_QUERY } from "../lib/customers";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  getOverview,
  listCustomers,
  updateCustomer,
} from "./customers";
import { MAX_CUSTOMERS, queryCustomers, resetCustomers } from "./customers.server";

const event = () => createTestEvent({ url: "http://localhost/_dusk/fn/x", method: "POST" });
const input = {
  name: "Zed Test",
  email: "Zed@Example.com",
  plan: "pro",
  status: "active",
  monthly: 49,
} as const;

beforeEach(() => resetCustomers());

describe("the customer store", () => {
  it("pages, sorts and filters on the server", () => {
    const first = queryCustomers({ ...DEFAULT_QUERY, sort: "name", desc: false });
    expect(first.total).toBe(48);
    expect(first.pages).toBe(5);
    expect(first.rows).toHaveLength(10);
    const names = first.rows.map((row) => row.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const last = queryCustomers({ ...DEFAULT_QUERY, page: 4 });
    expect(last.rows).toHaveLength(8);
    expect(queryCustomers({ ...DEFAULT_QUERY, page: 99 }).rows).toEqual([]);
    const churned = queryCustomers({ ...DEFAULT_QUERY, status: "churned", size: 100 });
    expect(churned.rows.length).toBeGreaterThan(0);
    expect(churned.rows.every((row) => row.status === "churned")).toBe(true);
  });

  it("searches names and emails without regard to case, and treats the text as text", () => {
    expect(queryCustomers({ ...DEFAULT_QUERY, q: "OMAR" }).total).toBe(2);
    expect(queryCustomers({ ...DEFAULT_QUERY, q: "example.com" }).total).toBe(48);
    expect(queryCustomers({ ...DEFAULT_QUERY, q: ".*" }).total).toBe(0);
  });

  it("orders equal values by id, so a page never shows a row twice", () => {
    const seen = new Set<string>();
    for (let page = 0; page < 5; page += 1) {
      for (const row of queryCustomers({ ...DEFAULT_QUERY, sort: "plan", page }).rows) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
    }
    expect(seen.size).toBe(48);
  });

  it("stops at its limit", async () => {
    for (let index = 48; index < MAX_CUSTOMERS; index += 1) {
      await createCustomer.invoke({ ...input, email: \`u\${index}@example.com\` }, event());
    }
    await expect(
      createCustomer.invoke({ ...input, email: "last@example.com" }, event()),
    ).rejects.toMatchObject({
      status: 400,
    });
  }, 30_000);
});

describe("the server functions", () => {
  it("creates a customer, lower-cases the email and reads it back", async () => {
    const created = await createCustomer.invoke(input, event());
    expect(created).toMatchObject({ name: "Zed Test", email: "zed@example.com", monthly: 49 });
    expect(await getCustomer.invoke({ id: created.id }, event())).toEqual(created);
    expect((await listCustomers.invoke({ q: "zed" }, event())).rows).toEqual([created]);
  });

  it("answers an email another customer has with a problem on the email field", async () => {
    await expect(
      createCustomer.invoke({ ...input, email: "amira.haddad@example.com" }, event()),
    ).rejects.toMatchObject({ status: 400, issues: [{ path: ["email"] }] });
  });

  it("refuses invalid input before it runs", async () => {
    await expect(createCustomer.invoke({ ...input, name: "" }, event())).rejects.toMatchObject({
      status: 400,
    });
    await expect(listCustomers.invoke({ size: 1000 }, event())).rejects.toMatchObject({
      status: 400,
    });
  });

  it("updates a customer, keeps its own email free for itself and refuses a taken one", async () => {
    const created = await createCustomer.invoke(input, event());
    const changed = await updateCustomer.invoke(
      { id: created.id, ...input, name: "Zed Two" },
      event(),
    );
    expect(changed).toMatchObject({
      id: created.id,
      name: "Zed Two",
      createdAt: created.createdAt,
    });
    await expect(
      updateCustomer.invoke(
        { id: created.id, ...input, email: "amira.haddad@example.com" },
        event(),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(updateCustomer.invoke({ id: "c-0", ...input }, event())).rejects.toSatisfy(
      isNotFound,
    );
  });

  it("deletes a customer once; a second delete and an unknown id are not found", async () => {
    const created = await createCustomer.invoke(input, event());
    expect(await deleteCustomer.invoke({ id: created.id }, event())).toEqual({ id: created.id });
    await expect(deleteCustomer.invoke({ id: created.id }, event())).rejects.toSatisfy(isNotFound);
    await expect(getCustomer.invoke({ id: created.id }, event())).rejects.toSatisfy(isNotFound);
  });

  it("totals the overview from the same data", async () => {
    const totals = await getOverview.invoke(undefined, event());
    expect(totals.customers).toBe(48);
    expect(totals.byPlan.free + totals.byPlan.pro + totals.byPlan.team).toBe(48);
    expect(totals.active).toBeLessThanOrEqual(totals.customers);
    const created = await createCustomer.invoke(input, event());
    const after = await getOverview.invoke(undefined, event());
    expect(after.customers).toBe(49);
    expect(after.monthly).toBe(totals.monthly + 49);
    expect(after.newThisMonth).toBeGreaterThanOrEqual(totals.newThisMonth + 1);
    await deleteCustomer.invoke({ id: created.id }, event());
    expect((await getOverview.invoke(undefined, event())).customers).toBe(48);
  });
});
`,
  "src/server/customers.ts": `import { notFound, serverFn, ValidationError } from "@shadow-js/dusk/server";
import {
  type CustomerInput,
  checkCustomer,
  customerInputSchema,
  type ListQuery,
  listQuerySchema,
} from "../lib/customers";
import { defineSchema, type Issue, textField } from "../lib/schema";
import {
  changeCustomer,
  findCustomer,
  insertCustomer,
  overview,
  queryCustomers,
  removeCustomer,
  type WriteFailure,
} from "./customers.server";

const idSchema = defineSchema<{ id: string }>((input) => {
  const issues: Issue[] = [];
  const id = textField(input, "id", 40, issues);
  return issues.length > 0 ? { issues } : { value: { id } };
});

/** The id of a customer and the new values of its fields, flat: \`{ id, name, email, ... }\`. */
const changeSchema = defineSchema<{ id: string; values: CustomerInput }>((input) => {
  const issues: Issue[] = [];
  const id = textField(input, "id", 40, issues);
  const checked = checkCustomer(input);
  if ("issues" in checked) issues.push(...checked.issues);
  return "issues" in checked || issues.length > 0
    ? { issues }
    : { value: { id, values: checked.value } };
});

/** What a write answers when the store refused it: the form shows it on the email field. */
function refusal(failure: WriteFailure): ValidationError {
  return failure === "email"
    ? new ValidationError([{ message: "Another customer has this email", path: ["email"] }])
    : new ValidationError([{ message: "The customer list is full", path: [] }]);
}

/**
 * Server functions are typed RPC for your own front end: a component imports them like any async
 * function and Dusk generates the call. \`GET\` functions are safe to cache; the others are checked
 * for CSRF and validate their input before they run.
 */

/** The totals of the overview page. */
export const getOverview = serverFn({ method: "GET" }, () => overview());

/** One page of customers: sorted, searched and filtered on the server. */
export const listCustomers = serverFn(
  { method: "POST", input: listQuerySchema },
  (query: ListQuery) => queryCustomers(query),
);

/** One customer; an unknown id renders the not-found page. */
export const getCustomer = serverFn({ method: "GET", input: idSchema }, ({ id }) => {
  const customer = findCustomer(id);
  if (customer === undefined) throw notFound();
  return customer;
});

/** Adds a customer. */
export const createCustomer = serverFn({ input: customerInputSchema }, (input) => {
  const result = insertCustomer(input);
  if (typeof result === "string") throw refusal(result);
  return result;
});

/** Changes a customer. */
export const updateCustomer = serverFn({ input: changeSchema }, ({ id, values }) => {
  const result = changeCustomer(id, values);
  if (result === undefined) throw notFound();
  if (typeof result === "string") throw refusal(result);
  return result;
});

/** Deletes a customer. */
export const deleteCustomer = serverFn({ input: idSchema }, ({ id }) => {
  if (!removeCustomer(id)) throw notFound();
  return { id };
});
`,
});
