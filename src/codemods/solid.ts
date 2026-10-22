/**
 * `solid-to-shadow`: the renames and the package moves of the solid migration guide (shadowjs.net/migrate/solid/).
 */
import type { Node } from "./ast";
import {
  CORE,
  calleeCall,
  type Draft,
  plainArguments,
  type Rule,
  type Ruleset,
  renameRule,
  WEB,
  WEB_SERVER,
} from "./framework";

const SOLID = "solid-js";
const SOLID_WEB = "solid-js/web";
const SOLID_STORE = "solid-js/store";

/** Same names in `@shadow-js/core`. */
const CORE_SAME = [
  "createRoot",
  "createContext",
  "useContext",
  "batch",
  "untrack",
  "onMount",
  "onCleanup",
  "onError",
  "catchError",
  "getOwner",
  "runWithOwner",
  "mergeProps",
  "splitProps",
  "children",
  "startTransition",
  "useTransition",
];

/** Same names in `@shadow-js/web`. */
const WEB_SAME = [
  "Show",
  "For",
  "Index",
  "Switch",
  "Match",
  "ErrorBoundary",
  "Suspense",
  "SuspenseList",
  "lazy",
];

const HINTS: ReadonlyMap<string, string> = new Map([
  ["on", "Use the two-function form `useEffect(deps, fn, { defer })`."],
  ["createComputed", "Use `useMemo` for a derivation, or `useRenderEffect(compute, apply)`."],
  ["createRenderEffect", "Use `useRenderEffect(compute, apply)`, which takes two functions."],
  [
    "createResource",
    "`useResource` returns one resource object, not a `[resource, { refetch }]` tuple.",
  ],
  ["createStore", "Use `useStore`; the setter forms differ."],
  ["createMutable", "Use `useStore` with a draft setter."],
  ["modifyMutable", "Use `setState(reconcile(next))`."],
  ["createReaction", "Use `useReaction(onInvalidate)`."],
  ["createDeferred", "Use `useDeferredValue(source)`."],
  ["from", "Use `useExternalStore`."],
  ["observable", "Use `useExternalStore`."],
  ["createAsync", "Use a route loader or `useResource`."],
]);

/** A rename that also checks the arguments of every call of the function. */
function checkedRename(name: string, check: (args: Node[]) => string | null): Rule {
  const rename = renameRule(CORE, name);
  return (draft: Draft, binding, references) => {
    for (const reference of references) {
      const call = calleeCall(draft, reference);
      if (call === null) continue;
      const args = plainArguments(call);
      const problem = args === null ? "it is called with a spread argument." : check(args);
      if (problem !== null) draft.block(call, `\`${binding.imported}\`: ${problem}`);
    }
    rename(draft, binding, references);
  };
}

/** Rules for names that keep their name and change package. */
function moves(from: string, names: readonly string[], target: string): Array<[string, Rule]> {
  return names.map((name): [string, Rule] => [`${from}#${name}`, renameRule(target, name)]);
}

const RULES: ReadonlyMap<string, Rule> = new Map<string, Rule>([
  [
    `${SOLID}#createSignal`,
    checkedRename("useSignal", (args) =>
      args.length === 0
        ? "ShadowJS needs an initial value; write `useSignal<T | undefined>(undefined)`."
        : null,
    ),
  ],
  [
    `${SOLID}#createEffect`,
    checkedRename("useEffect", (args) =>
      args.length === 1
        ? null
        : "an initial value argument has no equivalent; the return value is the cleanup.",
    ),
  ],
  [
    `${SOLID}#createMemo`,
    checkedRename("useMemo", (args) =>
      args.length === 1 ? null : "there is no initial value; options are the second argument.",
    ),
  ],
  [`${SOLID}#createSelector`, renameRule(CORE, "useSelector")],
  [`${SOLID}#createUniqueId`, renameRule(CORE, "useId")],
  ...moves(SOLID, CORE_SAME, CORE),
  ...moves(SOLID, WEB_SAME, WEB),
  ...moves(SOLID_WEB, WEB_SAME, WEB),
  ...moves(SOLID_WEB, ["render", "hydrate", "Portal", "Dynamic", "mergeProps"], WEB),
  ...moves(SOLID_WEB, ["isServer", "isDev"], CORE),
  ...moves(SOLID_WEB, ["renderToString", "generateHydrationScript", "HydrationScript"], WEB_SERVER),
  ...moves(SOLID_STORE, ["produce", "reconcile", "unwrap"], CORE),
]);

/** The `solid-to-shadow` mappings. @internal */
export const SOLID_RULES: Ruleset = {
  sources: new Set([SOLID, SOLID_WEB, SOLID_STORE]),
  rules: RULES,
  hints: HINTS,
  guide: "solid",
};
