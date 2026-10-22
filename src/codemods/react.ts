/**
 * `react-to-shadow`: the mappings of the react migration guide (shadowjs.net/migrate/react/) that can be applied without
 * knowing what the program means.
 */
import { child, flag, type Module, type Node, nameOf, type Reference, text } from "./ast";
import {
  CORE,
  calleeCall,
  type Draft,
  guideNote,
  isIdentifier,
  plainArguments,
  type Rule,
  type Ruleset,
  rawElements,
  renameRule,
  unwrapTypes,
  WEB,
} from "./framework";
import type { ImportBinding, Transform } from "./transform";

const SOURCE = "react";

/** Same-shape hooks and components that only change package. */
const MOVES: ReadonlyArray<readonly [string, string, string]> = [
  ["createContext", CORE, "createContext"],
  ["useContext", CORE, "useContext"],
  ["useId", CORE, "useId"],
  ["startTransition", CORE, "startTransition"],
  ["useEffectEvent", CORE, "useEvent"],
  ["Fragment", WEB, "Fragment"],
  ["Suspense", WEB, "Suspense"],
  ["lazy", WEB, "lazy"],
];

const HINTS: ReadonlyMap<string, string> = new Map([
  ["useRef", "Use a plain `let` variable, or `createRef()` for an element."],
  ["useLayoutEffect", "Use `useRenderEffect(compute, apply)`."],
  ["useInsertionEffect", "Use `useRenderEffect`."],
  ["useImperativeHandle", "Pass callbacks as props."],
  ["useSyncExternalStore", "`useExternalStore` returns an accessor; read the result with `()`."],
  ["useTransition", "The pending flag is an accessor: read it with `()`."],
  ["useDeferredValue", "`useDeferredValue` takes an accessor and returns one."],
  [
    "useActionState",
    "Use `useAction(action, initialState)`, which returns `[state, dispatch, pending]`.",
  ],
  ["useOptimistic", "`useOptimistic(source, reducer)` has a different signature."],
  ["useDebugValue", "Use the `name` option of the hook."],
  ["memo", "It is not needed: components run once."],
  ["forwardRef", "It is not needed: `ref` is a prop."],
  ["cloneElement", "Use `mergeProps` in a wrapper component."],
  ["Children", "Use `children(() => props.children)`."],
]);

/** Constructors whose result is one value that `useStore` keeps whole. */
const SINGLE_VALUE_CONSTRUCTORS: ReadonlySet<string> = new Set([
  "Date",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "RegExp",
]);

type Shape = "value" | "object" | "unknown";

/** What kind of state an initial value makes: a single value, a plain object or array, or unknown. */
function shapeOf(module: Module, node: Node): Shape {
  const inner = unwrapTypes(node);
  switch (inner.type) {
    case "Literal":
    case "TemplateLiteral":
      return "value";
    case "ObjectExpression":
    case "ArrayExpression":
      return "object";
    case "UnaryExpression": {
      const argument = child(inner, "argument");
      return argument !== null && unwrapTypes(argument).type === "Literal" ? "value" : "unknown";
    }
    case "Identifier":
      return nameOf(inner) === "undefined" && !module.declaredNames.has("undefined")
        ? "value"
        : "unknown";
    case "NewExpression": {
      const callee = nameOf(child(inner, "callee"));
      return callee !== null &&
        SINGLE_VALUE_CONSTRUCTORS.has(callee) &&
        !module.declaredNames.has(callee)
        ? "value"
        : "unknown";
    }
    default:
      return "unknown";
  }
}

/** Appends `()` to every read of a binding that became an accessor. */
function readAsAccessor(draft: Draft, identifier: Node): void {
  for (const reference of draft.transform.module.referencesTo(identifier)) {
    switch (reference.kind) {
      case "read":
        draft.insert(reference.node.end, "()");
        break;
      case "shorthand":
        draft.insert(reference.node.end, `: ${reference.name}()`);
        break;
      default:
        draft.block(
          reference.node,
          `\`${reference.name}\` is ${reference.kind === "write" ? "assigned" : "used as a JSX tag or re-exported"}, so it cannot become an accessor automatically.`,
        );
    }
  }
}

/** Runs `visit` for every call of a hook; any other use of the hook name blocks the migration. */
function eachCall(
  draft: Draft,
  binding: ImportBinding,
  references: readonly Reference[],
  visit: (call: Node, callee: Node) => void,
): void {
  for (const reference of references) {
    const call = calleeCall(draft, reference);
    if (call === null) {
      draft.block(reference.node, `\`${binding.local}\` is used as a value, not called.`);
    } else {
      visit(call, reference.node);
    }
  }
}

/** The destructured names of `const [a, b] = hook()`, or null after blocking. */
function arrayBinding(
  draft: Draft,
  call: Node,
  hook: string,
): { first: Node | null; second: Node | null } | null {
  const declarator = draft.transform.module.parent(call);
  const pattern = declarator === undefined ? null : child(declarator, "id");
  if (
    declarator?.type !== "VariableDeclarator" ||
    declarator["init"] !== call ||
    pattern?.type !== "ArrayPattern"
  ) {
    draft.block(call, `\`${hook}\` is not written as \`const [value, setValue] = ${hook}(...)\`.`);
    return null;
  }
  const elements = rawElements(pattern);
  if (
    elements.length > 2 ||
    elements.some((element) => element !== null && !isIdentifier(element))
  ) {
    draft.block(
      call,
      `The array pattern of \`${hook}\` has defaults, a rest element or too many names.`,
    );
    return null;
  }
  const [first, second] = elements;
  return {
    first: isIdentifier(first) ? first : null,
    second: isIdentifier(second) ? second : null,
  };
}

/** Points each call of a hook at its new name, aliasing the import when the person did. */
function retarget(
  draft: Draft,
  binding: ImportBinding,
  sites: ReadonlyArray<{ readonly callee: Node; readonly target: string }>,
  module: string,
): void {
  const names = [...new Set(sites.map((site) => site.target))];
  if (binding.local !== binding.imported) {
    if (names.length > 1) {
      draft.block(
        binding.specifier,
        `The alias \`${binding.local}\` is used for more than one ShadowJS hook.`,
      );
    }
    for (const name of names) draft.request({ module, imported: name, local: binding.local });
    return;
  }
  for (const name of names) {
    if (name !== binding.local && !draft.transform.canBind(module, name, name)) {
      draft.block(binding.specifier, `\`${name}\` is already declared in this file.`);
    }
    draft.request({ module, imported: name, local: name });
  }
  for (const site of sites)
    if (site.target !== binding.local) draft.replace(site.callee, site.target);
}

/** `useState` becomes `useStore`, or `useSignal` when the initial value has no known shape. */
const useState: Rule = (draft, binding, references) => {
  const module = draft.transform.module;
  const sites: Array<{ callee: Node; target: string }> = [];
  eachCall(draft, binding, references, (call, callee) => {
    const names = arrayBinding(draft, call, binding.local);
    if (names === null) return;
    const args = plainArguments(call);
    const first = args?.[0];
    if (args === null || args.length === 0) {
      draft.block(
        call,
        "`useState()` has no initial value; ShadowJS needs one, for example `useStore<T | undefined>(undefined)`.",
      );
      return;
    }
    if (args.length > 1 || first === undefined) {
      draft.block(call, "`useState` takes one argument.");
      return;
    }
    let initial = first;
    if (first.type === "ArrowFunctionExpression" || first.type === "FunctionExpression") {
      const body = child(first, "body");
      if (
        first.type !== "ArrowFunctionExpression" ||
        !flag(first, "expression") ||
        flag(first, "async") ||
        body === null ||
        hasParams(first)
      ) {
        draft.block(
          first,
          "The lazy initializer is not a plain `() => expression`; ShadowJS has no lazy initializer, so write the value.",
        );
        return;
      }
      draft.remove(first.start, body.start);
      draft.remove(body.end, first.end);
      initial = body;
    }
    const shape = shapeOf(module, initial);
    if (names.first !== null) {
      for (const reference of module.referencesTo(names.first)) {
        if (reference.kind === "write" || reference.kind === "export") {
          draft.block(
            reference.node,
            `\`${reference.name}\` is reassigned or re-exported, so it cannot become a store or accessor automatically.`,
          );
        }
      }
      if (shape !== "object") readAsAccessor(draft, names.first);
    }
    if (shape === "object" && names.second !== null) {
      draft.note(
        call,
        `\`${text(names.first ?? names.second, "name") ?? "state"}\` is a store now: \`${text(names.second, "name") ?? "the setter"}\` merges a partial object and an updater receives a draft to mutate. Check its calls.`,
      );
    }
    if (shape === "unknown") {
      draft.note(
        call,
        "The initial value has no literal shape, so this uses useSignal, which replaces the whole value like React. Use useStore for a plain object you update by key.",
      );
    }
    sites.push({ callee, target: shape === "unknown" ? "useSignal" : "useStore" });
  });
  retarget(draft, binding, sites, CORE);
};

/** True when a function has parameters. */
function hasParams(fn: Node): boolean {
  const params = fn["params"];
  return Array.isArray(params) && params.length > 0;
}

/** `useReducer` keeps its name and shape; the state it returns is an accessor. */
const useReducer: Rule = (draft, binding, references) => {
  const sites: Array<{ callee: Node; target: string }> = [];
  eachCall(draft, binding, references, (call, callee) => {
    const names = arrayBinding(draft, call, binding.local);
    if (names === null) return;
    if (plainArguments(call)?.length !== 2) {
      draft.block(
        call,
        "`useReducer` is called with a lazy initializer or a spread; write it by hand.",
      );
      return;
    }
    if (names.first !== null) readAsAccessor(draft, names.first);
    sites.push({ callee, target: "useReducer" });
  });
  retarget(draft, binding, sites, CORE);
};

/** `useMemo(fn, deps)` becomes `useMemo(fn)`, whose result is an accessor. */
const useMemo: Rule = (draft, binding, references) => {
  const module = draft.transform.module;
  const sites: Array<{ callee: Node; target: string }> = [];
  eachCall(draft, binding, references, (call, callee) => {
    const declarator = module.parent(call);
    const id = declarator === undefined ? null : child(declarator, "id");
    const args = plainArguments(call);
    if (
      declarator?.type !== "VariableDeclarator" ||
      declarator["init"] !== call ||
      !isIdentifier(id)
    ) {
      draft.block(call, "`useMemo` is not written as `const value = useMemo(...)`.");
      return;
    }
    const compute = args?.[0];
    const deps = args?.[1];
    if (
      args === null ||
      compute === undefined ||
      args.length > 2 ||
      (deps !== undefined && deps.type !== "ArrayExpression")
    ) {
      draft.block(call, "The dependencies of `useMemo` are not an array literal.");
      return;
    }
    if (deps !== undefined) {
      draft.remove(compute.end, deps.end);
      draft.note(
        call,
        "The dependency array of useMemo was removed: ShadowJS tracks what the function reads.",
      );
    }
    for (const reference of module.referencesTo(id)) {
      if (reference.kind === "write" || reference.kind === "export") {
        draft.block(reference.node, `\`${reference.name}\` is reassigned or re-exported.`);
      }
    }
    readAsAccessor(draft, id);
    sites.push({ callee, target: "useMemo" });
  });
  retarget(draft, binding, sites, CORE);
};

/** `useEffect(fn, [])` becomes `onMount(fn)`; other dependency arrays are removed with a note. */
const useEffect: Rule = (draft, binding, references) => {
  const sites: Array<{ callee: Node; target: string }> = [];
  eachCall(draft, binding, references, (call, callee) => {
    const args = plainArguments(call);
    const effect = args?.[0];
    if (args === null || effect === undefined || args.length > 2) {
      draft.block(call, "`useEffect` is called with a spread or more than two arguments.");
      return;
    }
    const deps = args[1];
    if (deps === undefined) {
      sites.push({ callee, target: "useEffect" });
      return;
    }
    if (deps.type !== "ArrayExpression") {
      draft.block(call, "The dependencies of `useEffect` are not an array literal.");
      return;
    }
    draft.remove(effect.end, deps.end);
    if (Array.isArray(deps["elements"]) && deps["elements"].length === 0) {
      draft.note(call, "`useEffect(fn, [])` became `onMount(fn)`: it runs once, untracked.");
      sites.push({ callee, target: "onMount" });
    } else {
      draft.note(
        call,
        "The dependency array of useEffect was removed: ShadowJS re-runs the effect when a value it reads changes. To react to one source only, use useEffect(source, fn).",
      );
      sites.push({ callee, target: "useEffect" });
    }
  });
  retarget(draft, binding, sites, CORE);
};

/** Parents where a function can stand in for the call that returned it. */
const FUNCTION_HOSTS: ReadonlySet<string> = new Set([
  "VariableDeclarator",
  "ArrayExpression",
  "Property",
  "JSXExpressionContainer",
  "ReturnStatement",
  "AssignmentExpression",
  "ExportDefaultDeclaration",
]);

/** `useCallback(fn, deps)` becomes `fn`: handlers are created once. */
const useCallback: Rule = (draft, binding, references) => {
  const module = draft.transform.module;
  eachCall(draft, binding, references, (call) => {
    const args = plainArguments(call);
    const fn = args?.[0];
    const deps = args?.[1];
    if (
      args === null ||
      fn === undefined ||
      args.length > 2 ||
      (deps !== undefined && deps.type !== "ArrayExpression")
    ) {
      draft.block(call, "The dependencies of `useCallback` are not an array literal.");
      return;
    }
    const parent = module.parent(call);
    const isFunction = fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression";
    const hosted =
      parent !== undefined &&
      (FUNCTION_HOSTS.has(parent.type) ||
        ((parent.type === "CallExpression" || parent.type === "NewExpression") &&
          parent["callee"] !== call));
    if (!hosted && isFunction) {
      draft.block(call, "`useCallback` is used inside a larger expression; remove it by hand.");
      return;
    }
    if (!isFunction && fn.type !== "Identifier" && fn.type !== "MemberExpression") {
      draft.block(call, "`useCallback` wraps something other than a function; remove it by hand.");
      return;
    }
    draft.remove(call.start, fn.start);
    draft.remove(fn.end, call.end);
  });
};

const RULES: ReadonlyMap<string, Rule> = new Map<string, Rule>([
  [`${SOURCE}#useState`, useState],
  [`${SOURCE}#useReducer`, useReducer],
  [`${SOURCE}#useMemo`, useMemo],
  [`${SOURCE}#useEffect`, useEffect],
  [`${SOURCE}#useCallback`, useCallback],
  ...MOVES.map(([name, module, target]): [string, Rule] => [
    `${SOURCE}#${name}`,
    renameRule(module, target),
  ]),
]);

/** `React.useState` and friends cannot be rewritten without the import being named. */
function namespaceUses(
  transform: Transform,
  binding: ImportBinding,
  references: readonly Reference[],
): void {
  for (const reference of references) {
    const member = transform.module.parent(reference.node);
    if (
      member?.type !== "MemberExpression" ||
      member["object"] !== reference.node ||
      flag(member, "computed")
    ) {
      continue;
    }
    const property = nameOf(child(member, "property"));
    if (property !== null && (RULES.has(`${SOURCE}#${property}`) || HINTS.has(property))) {
      transform.warn(
        member,
        `\`${binding.local}.${property}\` is not rewritten: import \`${property}\` by name and run the codemod again. ${guideNote("react")}`,
      );
    }
  }
}

/** The `react-to-shadow` mappings. @internal */
export const REACT_RULES: Ruleset = {
  sources: new Set([SOURCE]),
  rules: RULES,
  hints: HINTS,
  guide: "react",
  opaque: namespaceUses,
};
