/**
 * `next-router-to-shadow`: `next/link`, `useRouter` and `usePathname` as far as
 * the nextjs migration guide (shadowjs.net/migrate/nextjs/) documents them.
 */
import { child, children, flag, type Node, nameOf, type Reference } from "./ast";
import {
  calleeCall,
  type Draft,
  isIdentifier,
  plainArguments,
  ROUTER,
  type Rule,
  type Ruleset,
  renameBinding,
} from "./framework";

const LINK = "next/link";
const NAVIGATION = "next/navigation";
const PAGES_ROUTER = "next/router";

const HINTS: ReadonlyMap<string, string> = new Map([
  [
    "useSearchParams",
    "Use `useSearch()` for validated values or `useLocation().search` for the raw string.",
  ],
  ["useParams", "`useParams()` of @shadow-js/router returns a view with one memo per key."],
  [
    "redirect",
    "Use `throw redirect(to)` from @shadow-js/dusk in `beforeLoad` or a loader, or `<Navigate to>` in a component.",
  ],
  ["permanentRedirect", "Use `throw redirect(to, { status: 308 })` from @shadow-js/dusk."],
  ["notFound", "Use `throw notFound()`."],
  ["useSelectedLayoutSegment", "Use `useMatches()` or `useMatch()`."],
]);

/** Props of `next/link` that `A` has no equivalent for. */
const LINK_PROPS_WITHOUT_EQUIVALENT: ReadonlySet<string> = new Set([
  "replace",
  "scroll",
  "shallow",
  "passHref",
  "legacyBehavior",
  "locale",
  "as",
  "onNavigate",
]);

/** Checks the props of one `<Link>` element and renames `prefetch={false}` and `className`. */
function checkLinkProps(draft: Draft, opening: Node): void {
  for (const attribute of children(opening, "attributes")) {
    if (attribute.type !== "JSXAttribute") continue;
    const nameNode = child(attribute, "name");
    const name = nameOf(nameNode);
    if (nameNode === null || name === null) continue;
    if (LINK_PROPS_WITHOUT_EQUIVALENT.has(name)) {
      draft.block(attribute, `\`${name}\` has no equivalent on A.`);
    } else if (name === "className") {
      // A reads `class` itself (to join `activeClass`); the guide's example spells it that way.
      const duplicate = children(opening, "attributes").some(
        (other) => other.type === "JSXAttribute" && nameOf(child(other, "name")) === "class",
      );
      if (duplicate) draft.block(attribute, "Both `class` and `className` are set; keep one.");
      else draft.replace(nameNode, "class");
    } else if (name === "prefetch") {
      const value = child(attribute, "value");
      const expression = value === null ? null : child(value, "expression");
      if (expression?.type === "Literal" && expression["value"] === false) {
        draft.replace(nameNode, "preload");
      } else {
        draft.block(
          attribute,
          "`prefetch` other than `{false}` has no equivalent: A preloads on intent by default.",
        );
      }
    } else if (name === "href") {
      const value = child(attribute, "value");
      const expression = value === null ? null : child(value, "expression");
      if (expression?.type === "ObjectExpression") {
        draft.block(
          attribute,
          "An object `href` has no equivalent: pass a string, or `to`, `params` and `search`.",
        );
      }
    }
  }
}

/** `import Link from "next/link"` becomes `A` from `@shadow-js/router`. */
const link: Rule = (draft, binding, references) => {
  renameBinding(draft, binding, references, { module: ROUTER, name: "A" });
  const module = draft.transform.module;
  for (const reference of references) {
    const parent = module.parent(reference.node);
    if (reference.kind === "jsx" && parent?.type === "JSXOpeningElement")
      checkLinkProps(draft, parent);
  }
};

/** Renames one `router.<member>` of Next.js to its ShadowJS name. */
function routerMember(draft: Draft, member: Node): void {
  const module = draft.transform.module;
  const property = child(member, "property");
  const name = nameOf(property);
  const call = module.parent(member);
  if (property === null || name === null || flag(member, "computed")) {
    draft.block(member, "`router` is indexed by a computed key; review it by hand.");
    return;
  }
  if (call?.type !== "CallExpression" || call["callee"] !== member) {
    draft.block(member, `\`router.${name}\` is read, not called; it has no documented equivalent.`);
    return;
  }
  const args = plainArguments(call) ?? [];
  const first = args[0];
  switch (name) {
    case "push":
      if (args.length === 1) draft.replace(property, "navigate");
      else draft.block(call, "`router.push` with options (such as `scroll`) has no equivalent.");
      return;
    case "replace":
      if (args.length === 1 && first !== undefined) {
        draft.replace(property, "navigate");
        draft.insert(first.end, ", { replace: true }");
      } else {
        draft.block(call, "`router.replace` with options has no equivalent.");
      }
      return;
    case "back":
    case "forward":
      if (args.length === 0) draft.replace(property, `history.${name}`);
      else draft.block(call, `\`router.${name}\` takes no arguments in ShadowJS.`);
      return;
    case "refresh":
      draft.replace(property, "invalidate");
      return;
    case "prefetch":
      draft.replace(property, "preload");
      return;
    default:
      draft.block(call, `\`router.${name}\` has no documented equivalent.`);
  }
}

/** One use of a variable that holds the router. */
function routerUse(draft: Draft, reference: Reference): void {
  const member = draft.transform.module.parent(reference.node);
  if (member?.type === "MemberExpression" && member["object"] === reference.node) {
    routerMember(draft, member);
  } else {
    draft.block(
      reference.node,
      `\`${reference.name}\` is passed, destructured or assigned; review it by hand.`,
    );
  }
}

/** `useRouter()` keeps its name; its methods are renamed as the guide's table says. */
const useRouter: Rule = (draft, binding, references) => {
  const module = draft.transform.module;
  for (const reference of references) {
    const call = calleeCall(draft, reference);
    if (call === null) {
      draft.block(reference.node, "`useRouter` is used as a value, not called.");
      continue;
    }
    const parent = module.parent(call);
    const id = parent === undefined ? null : child(parent, "id");
    if (parent?.type === "MemberExpression" && parent["object"] === call) {
      routerMember(draft, parent);
    } else if (
      parent?.type === "VariableDeclarator" &&
      parent["init"] === call &&
      isIdentifier(id)
    ) {
      for (const use of module.referencesTo(id)) routerUse(draft, use);
    } else {
      draft.block(
        call,
        "The router is not stored in a plain `const router = useRouter()`; review it by hand.",
      );
    }
  }
  renameBinding(draft, binding, references, { module: ROUTER, name: "useRouter" });
};

/** `usePathname()` becomes `useLocation().pathname`. */
const usePathname: Rule = (draft, binding, references) => {
  for (const reference of references) {
    const call = calleeCall(draft, reference);
    if (call === null || (plainArguments(call)?.length ?? 1) !== 0) {
      draft.block(
        reference.node,
        "`usePathname` is used as a value, not called without arguments.",
      );
      continue;
    }
    draft.replace(call, "useLocation().pathname");
    draft.note(
      call,
      "`usePathname()` became `useLocation().pathname`: read it inside JSX or an effect to follow navigation.",
    );
  }
  if (!draft.transform.canBind(ROUTER, "useLocation", "useLocation")) {
    draft.block(binding.specifier, "`useLocation` is already declared in this file.");
  }
  draft.request({ module: ROUTER, imported: "useLocation", local: "useLocation" });
};

const RULES: ReadonlyMap<string, Rule> = new Map<string, Rule>([
  [`${LINK}#default`, link],
  [`${NAVIGATION}#useRouter`, useRouter],
  [`${PAGES_ROUTER}#useRouter`, useRouter],
  [`${NAVIGATION}#usePathname`, usePathname],
]);

/** The `next-router-to-shadow` mappings. @internal */
export const NEXT_RULES: Ruleset = {
  sources: new Set([LINK, NAVIGATION, PAGES_ROUTER]),
  rules: RULES,
  hints: HINTS,
  guide: "nextjs",
};
