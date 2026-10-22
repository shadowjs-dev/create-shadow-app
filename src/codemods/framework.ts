import { child, children, type Edit, type Node, nameOf, type Reference } from "./ast";
import type { ImportBinding, ImportRequest, Transform } from "./transform";

/** The ShadowJS packages the codemods write imports for. @internal */
export const CORE = "@shadow-js/core";
/** @internal */
export const WEB = "@shadow-js/web";
/** @internal */
export const WEB_SERVER = "@shadow-js/web/server";
/** @internal */
export const ROUTER = "@shadow-js/router";

/** Where an import moves to: a package and the name it exports. @internal */
export interface Target {
  readonly module: string;
  readonly name: string;
}

/**
 * The changes one import binding asks for. Nothing reaches the file until {@link Draft.commit}, and
 * a draft that was blocked commits only its warnings: a half-migrated binding would be wrong code.
 *
 * @internal
 */
export class Draft {
  readonly transform: Transform;
  private readonly edits: Edit[] = [];
  private readonly requests: ImportRequest[] = [];
  private readonly warnings: Array<{ node: Node; message: string }> = [];
  private readonly notes: Array<{ node: Node; message: string }> = [];
  private stopped = false;

  /**
   * @param transform The run these changes belong to.
   */
  constructor(transform: Transform) {
    this.transform = transform;
  }

  /** True after {@link Draft.block}. */
  get blocked(): boolean {
    return this.stopped;
  }

  insert(offset: number, value: string): void {
    this.edits.push({ start: offset, end: offset, text: value });
  }

  replace(node: Node, value: string): void {
    this.edits.push({ start: node.start, end: node.end, text: value });
  }

  remove(start: number, end: number): void {
    if (end > start) this.edits.push({ start, end, text: "" });
  }

  /** Asks for a name to be imported. */
  request(request: ImportRequest): void {
    this.requests.push(request);
  }

  /** Says why the binding cannot be migrated; nothing else of this draft is applied. */
  block(at: Node, message: string): void {
    this.stopped = true;
    this.warnings.push({ node: at, message });
  }

  /** Reports something the codemod did that deserves a second look. */
  note(at: Node, message: string): void {
    this.notes.push({ node: at, message });
  }

  /**
   * Applies the draft to the run.
   *
   * @param binding The import specifier the draft migrates, dropped when the draft is not blocked.
   * @returns True when the binding was migrated.
   */
  commit(binding: ImportBinding): boolean {
    for (const warning of this.warnings) this.transform.warn(warning.node, warning.message);
    if (this.stopped) return false;
    for (const note of this.notes) this.transform.note(note.node, note.message);
    this.transform.edits.push(...this.edits);
    for (const request of this.requests) this.transform.request(request);
    this.transform.dropImport(binding);
    return true;
  }
}

/** The call whose callee is this reference, if there is one. @internal */
export function calleeCall(draft: Draft, reference: Reference): Node | null {
  const parent = draft.transform.module.parent(reference.node);
  if (parent?.type === "CallExpression" && parent["callee"] === reference.node) return parent;
  return null;
}

/** The arguments of a call, or null when one is a spread. @internal */
export function plainArguments(call: Node): Node[] | null {
  const args = children(call, "arguments");
  return args.some((arg) => arg.type === "SpreadElement") ? null : args;
}

/** Steps through `as`, `satisfies`, `!` and `<T>` wrappers to the expression inside. @internal */
export function unwrapTypes(node: Node): Node {
  let current = node;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSTypeAssertion"
  ) {
    const inner = child(current, "expression");
    if (inner === null) break;
    current = inner;
  }
  return current;
}

/** The raw element list of an array pattern, with `null` for holes. @internal */
export function rawElements(node: Node): unknown[] {
  const value = node["elements"];
  return Array.isArray(value) ? value : [];
}

/** Tells whether a node is an identifier named `name`. @internal */
export function isIdentifier(node: unknown, name?: string): node is Node {
  if (typeof node !== "object" || node === null) return false;
  const candidate = node as Node;
  return candidate.type === "Identifier" && (name === undefined || nameOf(candidate) === name);
}

/**
 * Renames a binding to the name it has in ShadowJS. The local name changes with it (every use is
 * rewritten) unless the person aliased the import or the new name is already taken: then the alias
 * stays and only the import changes.
 *
 * @param draft Where the changes go.
 * @param binding The import being migrated.
 * @param references Every use of its local name.
 * @param target The package and name that replace it.
 * @returns The local name the code uses after the change.
 * @internal
 */
export function renameBinding(
  draft: Draft,
  binding: ImportBinding,
  references: readonly Reference[],
  target: Target,
): string {
  const aliased = binding.imported !== "default" && binding.imported !== binding.local;
  let local = aliased ? binding.local : target.name;
  if (local !== binding.local && !draft.transform.canBind(target.module, target.name, local)) {
    local = binding.local;
  }
  draft.request({ module: target.module, imported: target.name, local });
  if (local === binding.local) return local;
  for (const reference of references) {
    if (reference.kind === "read" || reference.kind === "jsx") {
      draft.replace(reference.node, local);
    } else if (reference.kind === "shorthand") {
      draft.insert(reference.node.end, `: ${local}`);
    } else {
      draft.block(
        reference.node,
        `\`${binding.local}\` is ${reference.kind === "export" ? "re-exported" : "assigned"}; rename it by hand.`,
      );
    }
  }
  return local;
}

/** The sentence that points at a migration guide. @internal */
export function guideNote(guide: "react" | "solid" | "nextjs" | "preact" | "react-router"): string {
  return `Guide: https://shadowjs.net/guides/migrate/${guide}/`;
}

/** Migrates one import binding by filling a draft. */
export type Rule = (draft: Draft, binding: ImportBinding, references: readonly Reference[]) => void;

/** The mappings of one codemod. @internal */
export interface Ruleset {
  /** The modules whose imports are migrated. */
  readonly sources: ReadonlySet<string>;
  /** Rules keyed `module#name`; `default` names a default import. */
  readonly rules: ReadonlyMap<string, Rule>;
  /** What to tell the person about a name that has no rule, keyed by the imported name. */
  readonly hints: ReadonlyMap<string, string>;
  readonly guide: "react" | "solid" | "nextjs" | "preact" | "react-router";
  /** Looks at default and namespace imports that have no rule. */
  readonly opaque?: (
    transform: Transform,
    binding: ImportBinding,
    references: readonly Reference[],
  ) => void;
}

/** A rule that renames a binding and checks nothing else. @internal */
export function renameRule(module: string, name: string): Rule {
  return (draft, binding, references) => {
    renameBinding(draft, binding, references, { module, name });
  };
}

/**
 * Runs a ruleset over a file: every import it knows is migrated, every import it does not know is
 * reported, and nothing is guessed.
 *
 * @param transform The run.
 * @param set The mappings.
 * @internal
 */
export function runRuleset(transform: Transform, set: Ruleset): void {
  for (const binding of transform.importBindings(set.sources)) {
    if (binding.typeOnly) continue;
    const references = transform.module.referencesTo(binding.localNode);
    const rule = set.rules.get(`${binding.source}#${binding.imported}`);
    if (rule !== undefined) {
      const draft = new Draft(transform);
      rule(draft, binding, references);
      draft.commit(binding);
    } else if (binding.imported === "default" || binding.imported === "*") {
      set.opaque?.(transform, binding, references);
    } else {
      const hint = set.hints.get(binding.imported);
      transform.warn(
        binding.specifier,
        `\`${binding.imported}\` from "${binding.source}" is not migrated automatically. ${hint ?? "Review it by hand."} ${guideNote(set.guide)}`,
      );
    }
  }
}
