import { isStarter } from "../options";
import {
  addDevDependency,
  type Draft,
  includeInTsconfig,
  lines,
  needNodeTypes,
} from "../templates/shared";
import { vitestConfigSource } from "../templates/vite-config";

/**
 * Vitest with happy-dom and `@shadow-js/testing`, configured the way `tools/local/smoke.mjs` of the
 * ShadowJS repository proves it: the ShadowJS plugin compiles JSX, the `happy-dom` environment
 * makes the plugin select the browser build, and `auto-cleanup` unmounts after each test. The
 * example tests pass on a fresh project.
 *
 * @since 1.0.0
 */
export function applyVitest(draft: Draft): void {
  const { options, files } = draft;
  addDevDependency(draft, "vitest");
  addDevDependency(draft, "happy-dom");
  addDevDependency(draft, "@shadow-js/testing");
  addDevDependency(draft, "@testing-library/dom");
  draft.scripts["test"] = "vitest run";
  draft.scripts["test:watch"] = "vitest";
  if (options.ui) needNodeTypes(draft);
  includeInTsconfig(draft, "vitest.config.ts");
  includeInTsconfig(draft, "vitest.setup.ts");
  files.set("vitest.config.ts", vitestConfigSource(draft));
  files.set("vitest.setup.ts", 'import "@shadow-js/testing/auto-cleanup";\n');

  // A starter writes its own smoke test: its pages are not the sample app's.
  if (isStarter(options.template)) return;
  if (options.template === "dusk") {
    files.set("src/routes/index.test.tsx", startHomeTest());
    files.set("src/server/posts.test.ts", startServerTest());
    return;
  }
  if (!options.router) {
    files.set("src/App.test.tsx", spaCounterTest("App", "./App"));
    return;
  }
  files.set("src/pages/Home.test.tsx", spaCounterTest("Home", "./Home"));
  // The layout of a Clerk app needs a ClerkProvider, so the routed app is tested without Clerk only.
  if (!options.clerk) files.set("src/App.test.tsx", spaRouterTest());
}

/**
 * The accessibility checks every example test makes: one level-1 heading, a name for every button
 * and link, and alt text on every image. They use the matchers of `@shadow-js/testing/dom`, which
 * compute names the way assistive technology does.
 */
const A11Y_IMPORTS = ["expect.extend(accessibleMatchers);", ""];

function spaCounterTest(component: string, from: string): string {
  return lines([
    'import { accessibleMatchers, render, userEvent } from "@shadow-js/testing/dom";',
    'import { expect, it } from "vitest";',
    `import { ${component} } from "${from}";`,
    "",
    ...A11Y_IMPORTS,
    'it("counts clicks and lists the squares", async () => {',
    `  const view = render(() => <${component} />);`,
    '  expect(view.getByText("Count: 0")).toBeTruthy();',
    '  await userEvent.click(view.getByRole("button", { name: "Increment" }));',
    '  await userEvent.click(view.getByRole("button", { name: "Increment" }));',
    '  expect(view.getByText("Count: 2")).toBeTruthy();',
    '  expect(view.container.querySelectorAll("li")).toHaveLength(2);',
    "});",
    "",
    'it("has one level-1 heading, a name for every button, and alt text for every image", () => {',
    `  const view = render(() => <${component} />);`,
    '  expect(view.container.querySelectorAll("h1")).toHaveLength(1);',
    '  for (const button of view.getAllByRole("button")) {',
    "    expect(button).toHaveAccessibleName();",
    "  }",
    '  for (const image of view.container.querySelectorAll("img")) {',
    '    expect(image.getAttribute("alt")).not.toBeNull();',
    "  }",
    "});",
  ]);
}

function spaRouterTest(): string {
  return lines([
    'import { createMemoryHistory } from "@shadow-js/router";',
    'import { accessibleMatchers, render, userEvent } from "@shadow-js/testing/dom";',
    'import { expect, it } from "vitest";',
    'import { App } from "./App";',
    "",
    ...A11Y_IMPORTS,
    "const at = (path: string) => createMemoryHistory({ initialEntries: [path] });",
    "",
    'it("renders the route of the address", async () => {',
    '  const view = render(() => <App history={at("/about")} />);',
    '  expect(await view.findByRole("heading", { name: "About" })).toBeTruthy();',
    "});",
    "",
    'it("navigates with a link and shows the not-found page for an unknown address", async () => {',
    '  const view = render(() => <App history={at("/")} />);',
    '  await userEvent.click(await view.findByRole("link", { name: "About" }));',
    '  expect(await view.findByRole("heading", { name: "About" })).toBeTruthy();',
    "",
    '  const missing = render(() => <App history={at("/nope")} />);',
    '  expect(await missing.findByRole("heading", { name: "Page not found" })).toBeTruthy();',
    "});",
    "",
    'it("every page has one level-1 heading and named links", async () => {',
    '  const view = render(() => <App history={at("/")} />);',
    '  await view.findByRole("heading", { name: "ShadowJS" });',
    '  expect(view.container.querySelectorAll("h1")).toHaveLength(1);',
    '  for (const link of view.getAllByRole("link")) {',
    "    expect(link).toHaveAccessibleName();",
    "  }",
    '  const missing = render(() => <App history={at("/nope")} />);',
    '  await missing.findByRole("heading", { name: "Page not found" });',
    '  expect(missing.container.querySelectorAll("h1")).toHaveLength(1);',
    "});",
  ]);
}

function startHomeTest(): string {
  return lines([
    'import { accessibleMatchers, render, userEvent } from "@shadow-js/testing/dom";',
    'import { expect, it } from "vitest";',
    'import Home from "./index";',
    "",
    ...A11Y_IMPORTS,
    'it("counts clicks", async () => {',
    "  const view = render(() => <Home />);",
    '  const button = view.getByRole("button", { name: "Clicked 0 times" });',
    "  await userEvent.click(button);",
    '  expect(button.textContent).toBe("Clicked 1 times");',
    "});",
    "",
    'it("has one level-1 heading and a named button", () => {',
    "  const view = render(() => <Home />);",
    '  expect(view.container.querySelectorAll("h1")).toHaveLength(1);',
    '  expect(view.getByRole("button")).toHaveAccessibleName();',
    "});",
  ]);
}

function startServerTest(): string {
  return lines([
    "// @vitest-environment node",
    'import { isNotFound } from "@shadow-js/dusk/server";',
    'import { createTestEvent } from "@shadow-js/dusk/testing";',
    'import { expect, it } from "vitest";',
    'import { createPost, getPost, listPosts } from "./posts";',
    "",
    'it("creates a post and reads it back through the server functions", async () => {',
    "  const event = createTestEvent();",
    '  const created = await createPost.invoke({ title: "Test", body: "From a test" }, event);',
    "  expect(await getPost.invoke({ id: created.id }, event)).toEqual(created);",
    "  expect(await listPosts.invoke(undefined, event)).toContainEqual(created);",
    "});",
    "",
    'it("rejects input that fails validation with a 400", async () => {',
    '  const rejected = createPost.invoke({ title: "" }, createTestEvent());',
    "  await expect(rejected).rejects.toMatchObject({ status: 400 });",
    "});",
    "",
    'it("answers an unknown post with notFound()", async () => {',
    '  const missing = getPost.invoke({ id: "missing" }, createTestEvent());',
    "  await expect(missing).rejects.toSatisfy(isNotFound);",
    "});",
  ]);
}
