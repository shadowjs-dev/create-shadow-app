/**
 * `preact-to-shadow`: the hooks and components of Preact, which are React's by design, take the rules of `react-to-shadow`; what
 * Preact adds (`render`, `Component`, `@preact/signals`) is reported with what to write instead.
 */

import type { Rule, Ruleset } from "./framework";
import { REACT_RULES } from "./react";

const HOOKS = "preact/hooks";
const COMPAT = "preact/compat";
const CORE = "preact";
const SIGNALS = "@preact/signals";
const SIGNALS_CORE = "@preact/signals-core";

/** The names the React rules know, with the Preact modules that export them. */
const RULES: ReadonlyMap<string, Rule> = (() => {
  const rules = new Map<string, Rule>();
  for (const [key, rule] of REACT_RULES.rules) {
    const name = key.slice(key.indexOf("#") + 1);
    rules.set(`${HOOKS}#${name}`, rule);
    rules.set(`${COMPAT}#${name}`, rule);
    // `preact` itself exports the context and fragment helpers.
    if (name === "createContext" || name === "Fragment") rules.set(`${CORE}#${name}`, rule);
  }
  return rules;
})();

const HINTS: ReadonlyMap<string, string> = new Map([
  ...REACT_RULES.hints,
  ["useErrorBoundary", "Wrap the part in `<ErrorBoundary>` from `@shadow-js/web`."],
  ["render", "ShadowJS `render` takes a function: `render(() => <App />, container)`."],
  ["hydrate", "ShadowJS `hydrate` takes a function: `hydrate(() => <App />, container)`."],
  ["h", "Write JSX: the compiler needs no `h`."],
  ["createElement", "Write JSX: the compiler needs no `createElement`."],
  ["Component", "Class components have no equivalent; write a function component."],
  ["PureComponent", "Class components have no equivalent; write a function component."],
  ["createRef", "Use `createRef()` from `@shadow-js/core`, or a plain `let` for a value."],
  ["toChildArray", "Use `children(() => props.children)`."],
  ["options", "There are no render hooks to patch; use a compiler plugin for build-time changes."],
  [
    "signal",
    "Use `const [value, setValue] = useSignal(initial)`: read with `value()`, write with `setValue(next)`.",
  ],
  ["computed", "Use `useMemo(() => ...)`, which returns an accessor."],
  ["effect", "Use `useEffect(() => ...)` inside a component, or `createRoot` outside one."],
  ["batch", "Use `batch` from `@shadow-js/core`."],
  [
    "useSignal",
    "Use `const [value, setValue] = useSignal(initial)`: read with `value()`, write with `setValue(next)`.",
  ],
  ["useComputed", "Use `useMemo(() => ...)`, which returns an accessor."],
  ["useSignalEffect", "Use `useEffect(() => ...)`."],
]);

/** The `preact-to-shadow` mappings. @internal */
export const PREACT_RULES: Ruleset = {
  sources: new Set([CORE, HOOKS, COMPAT, SIGNALS, SIGNALS_CORE]),
  rules: RULES,
  hints: HINTS,
  guide: "preact",
};
