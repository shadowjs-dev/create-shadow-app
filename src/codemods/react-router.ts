/**
 * `react-router-to-shadow`: the links, outlet, redirect component and navigation hooks of React Router (and the Remix
 * packages that re-export them) as far as the react-router migration guide (shadowjs.net/migrate/react-router/) documents them. The route table
 * (`<Routes>`, `createBrowserRouter`) is a structural change and is reported, not rewritten.
 */
import { child, children, type Node, nameOf, type Reference } from "./ast";
import {
  calleeCall,
  type Draft,
  isIdentifier,
  plainArguments,
  ROUTER,
  type Rule,
  type Ruleset,
  renameBinding,
  renameRule,
} from "./framework";

/** The packages that export the same names. */
const SOURCES = ["react-router", "react-router-dom", "@remix-run/react"] as const;

const HINTS: ReadonlyMap<string, string> = new Map([
  [
    "BrowserRouter",
    "Create the router with `createRouter({ routes })` and render it with `<RouterProvider router={router} />`.",
  ],
  [
    "HashRouter",
    "Create the router with `createRouter({ routes, history: createHashHistory() })`.",
  ],
  [
    "MemoryRouter",
    "Create the router with `createRouter({ routes, history: createMemoryHistory() })`.",
  ],
  [
    "Routes",
    "Declare routes with `defineRoute(path, { component, loader, children })` and pass them to `createRouter`.",
  ],
  ["Route", "Declare routes with `defineRoute(path, { component, loader, children })`."],
  ["createBrowserRouter", "Use `createRouter({ routes })` with `defineRoute`."],
  ["createRoutesFromElements", "Use `defineRoute` objects."],
  [
    "RouterProvider",
    "Render `<RouterProvider router={router} />` from `@shadow-js/router`; the router comes from `createRouter`.",
  ],
  [
    "useSearchParams",
    "Use `useSearch()` for validated values or `useLocation().search` for the raw string.",
  ],
  [
    "useLoaderData",
    "`useLoaderData()` of `@shadow-js/router` returns an accessor: read the data with `()`.",
  ],
  ["useRouteError", "Give the route an `error` component that receives the error as a prop."],
  ["useMatches", "Use `useMatches()` of `@shadow-js/router`; the shape differs."],
  ["useRevalidator", "Use `useRouter().invalidate()`."],
  ["useNavigation", "Use `useNavigation()` of `@shadow-js/router`; read its state with `()`."],
  ["redirect", "Use `throw redirect(to)` from `@shadow-js/router` in `beforeLoad` or a loader."],
  ["json", "Return the value from the loader; there is no Response wrapper."],
  ["Form", "Use `<Form action={serverFn}>` from `@shadow-js/dusk/client`, or a plain `<form>`."],
  ["useFetcher", "Use `useFetcher()` from `@shadow-js/dusk/client`."],
  ["useSubmit", "Use `useSubmit()` from `@shadow-js/dusk/client`."],
  ["ScrollRestoration", "Install the `scroll()` feature from `@shadow-js/router/scroll`."],
]);

/** Props of `Link` and `NavLink` that `A` has no equivalent for. */
const PROPS_WITHOUT_EQUIVALENT: ReadonlySet<string> = new Set([
  "reloadDocument",
  "preventScrollReset",
  "unstable_viewTransition",
  "unstable_defaultShouldRevalidate",
  "discover",
  "caseSensitive",
  "target",
  "download",
]);

/** A string or number literal value of an attribute, or undefined. */
function literalValue(attribute: Node): unknown {
  const value = child(attribute, "value");
  if (value === null) return undefined;
  if (value.type === "Literal") return value["value"];
  const expression = child(value, "expression");
  return expression?.type === "Literal" ? expression["value"] : undefined;
}

/** Checks one `<Link>` or `<NavLink>`: renames `className` and `prefetch`, refuses what `A` cannot do. */
function checkLinkProps(draft: Draft, opening: Node): void {
  const attributes = children(opening, "attributes");
  for (const attribute of attributes) {
    if (attribute.type === "JSXSpreadAttribute") {
      draft.block(attribute, "A spread of props cannot be checked against `A`; review it by hand.");
      continue;
    }
    if (attribute.type !== "JSXAttribute") continue;
    const nameNode = child(attribute, "name");
    const name = nameOf(nameNode);
    if (nameNode === null || name === null) continue;
    if (PROPS_WITHOUT_EQUIVALENT.has(name)) {
      draft.block(attribute, `\`${name}\` has no equivalent on A.`);
    } else if (name === "to") {
      const value = child(attribute, "value");
      const expression = value === null ? null : child(value, "expression");
      if (expression?.type === "ObjectExpression") {
        draft.block(
          attribute,
          "An object `to` has no equivalent: pass a string, or `to`, `search` and `hash` props.",
        );
      }
    } else if (name === "className" || name === "style") {
      const value = child(attribute, "value");
      const expression = value === null ? null : child(value, "expression");
      if (
        expression !== null &&
        (expression.type === "ArrowFunctionExpression" || expression.type === "FunctionExpression")
      ) {
        draft.block(
          attribute,
          `\`${name}\` as a function of \`{ isActive }\` has no equivalent: use \`activeClass\` for the active state.`,
        );
      } else if (name === "className") {
        const duplicate = attributes.some(
          (other) => other.type === "JSXAttribute" && nameOf(child(other, "name")) === "class",
        );
        if (duplicate) draft.block(attribute, "Both `class` and `className` are set; keep one.");
        else draft.replace(nameNode, "class");
      }
    } else if (name === "prefetch") {
      const mode = literalValue(attribute);
      if (mode === "intent" || mode === "viewport" || mode === "render" || mode === "none") {
        draft.replace(nameNode, "preload");
      } else {
        draft.block(
          attribute,
          '`prefetch` is not one of the literals "intent", "viewport", "render" or "none".',
        );
      }
    } else if (name === "activeClassName") {
      draft.replace(nameNode, "activeClass");
    }
  }
}

/** `Link` and `NavLink` become `A` from `@shadow-js/router`. */
const link: Rule = (draft, binding, references) => {
  renameBinding(draft, binding, references, { module: ROUTER, name: "A" });
  const module = draft.transform.module;
  for (const reference of references) {
    const parent = module.parent(reference.node);
    if (reference.kind === "jsx" && parent?.type === "JSXOpeningElement")
      checkLinkProps(draft, parent);
  }
};

/** Looks at the calls of a `navigate` function: a number moves through history, which `navigate` of ShadowJS does not do. */
function navigateUse(draft: Draft, reference: Reference): void {
  const module = draft.transform.module;
  const call = module.parent(reference.node);
  if (call?.type !== "CallExpression" || call["callee"] !== reference.node) {
    draft.block(reference.node, `\`${reference.name}\` is passed or stored; review it by hand.`);
    return;
  }
  const args = plainArguments(call);
  const first = args?.[0];
  if (args === null || first === undefined) {
    draft.block(call, "`navigate` is called with a spread or without a target.");
    return;
  }
  const inner = first.type === "UnaryExpression" ? child(first, "argument") : first;
  if (inner?.type === "Literal" && typeof inner["value"] === "number") {
    draft.block(
      call,
      "`navigate(-1)` moves through history: use `useRouter().history.back()` or `.forward()`.",
    );
  }
}

/** `useNavigate()` keeps its name; calls with a number are refused. */
const useNavigate: Rule = (draft, binding, references) => {
  const module = draft.transform.module;
  for (const reference of references) {
    const call = calleeCall(draft, reference);
    if (call === null) {
      draft.block(reference.node, "`useNavigate` is used as a value, not called.");
      continue;
    }
    const parent = module.parent(call);
    const id = parent === undefined ? null : child(parent, "id");
    if (parent?.type === "VariableDeclarator" && parent["init"] === call && isIdentifier(id)) {
      for (const use of module.referencesTo(id)) navigateUse(draft, use);
    } else {
      draft.block(
        call,
        "The navigate function is not stored in a plain `const navigate = useNavigate()`; review it by hand.",
      );
    }
  }
  renameBinding(draft, binding, references, { module: ROUTER, name: "useNavigate" });
};

/** `useParams()` keeps its name; destructuring it at setup is reported, because a reused component would not follow the URL. */
const useParams: Rule = (draft, binding, references) => {
  const module = draft.transform.module;
  for (const reference of references) {
    const call = calleeCall(draft, reference);
    const parent = call === null ? undefined : module.parent(call);
    const id = parent === undefined ? null : child(parent, "id");
    if (parent?.type === "VariableDeclarator" && id?.type === "ObjectPattern") {
      draft.note(
        call as Node,
        "`useParams()` returns a view with one memo per key: read `params.id` where it is used instead of destructuring it once, or the component will not follow the URL when it is reused.",
      );
    }
  }
  renameBinding(draft, binding, references, { module: ROUTER, name: "useParams" });
};

const RULES = new Map<string, Rule>();
for (const source of SOURCES) {
  RULES.set(`${source}#Link`, link);
  RULES.set(`${source}#NavLink`, link);
  RULES.set(`${source}#Outlet`, renameRule(ROUTER, "Outlet"));
  RULES.set(`${source}#Navigate`, renameRule(ROUTER, "Navigate"));
  RULES.set(`${source}#useLocation`, renameRule(ROUTER, "useLocation"));
  RULES.set(`${source}#useNavigate`, useNavigate);
  RULES.set(`${source}#useParams`, useParams);
}

/** The `react-router-to-shadow` mappings. @internal */
export const REACT_ROUTER_RULES: Ruleset = {
  sources: new Set<string>(SOURCES),
  rules: RULES,
  hints: HINTS,
  guide: "react-router",
};
