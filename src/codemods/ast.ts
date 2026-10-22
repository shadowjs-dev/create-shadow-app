/**
 * The syntax tree layer of the codemods: a lazily loaded parser, a scope-aware reference table and
 * source-range edits. Nothing here knows about React, Solid or Next.js.
 */

/** A node of the ESTree-shaped tree that `oxc-parser` returns. @internal */
export interface Node {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

/** How a name is used at one place. @internal */
export type ReferenceKind =
  /** A value read. */
  | "read"
  /** An assignment target, an update or a destructuring target. */
  | "write"
  /** The value of a shorthand property: `{ name }`. */
  | "shorthand"
  /** The name of a JSX element, or the root of a member name. */
  | "jsx"
  /** The local name of an export specifier: `export { name }`. */
  | "export";

/** One use of a name, with the declaration it resolves to. @internal */
export interface Reference {
  readonly node: Node;
  readonly name: string;
  readonly kind: ReferenceKind;
  /** The identifier node that declares the name, or undefined for a global. */
  readonly declaration: Node | undefined;
}

/** A text edit by source range. `start === end` inserts. @internal */
export interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** A line-numbered message for the person running the codemod. @internal */
export interface Report {
  /** One-based line. */
  readonly line: number;
  /** `warning` is something left for the person to do; `note` is something the codemod did. */
  readonly level: "warning" | "note";
  readonly message: string;
}

/** The parser refused the file. @internal */
export class ParseFailure extends Error {}

/** Two edits touch the same range. @internal */
export class EditConflict extends Error {}

/** Reads a child node. @internal */
export function child(node: Node, key: string): Node | null {
  const value = node[key];
  return isNode(value) ? value : null;
}

/** Reads a list of child nodes, dropping holes. @internal */
export function children(node: Node, key: string): Node[] {
  const value = node[key];
  return Array.isArray(value) ? value.filter(isNode) : [];
}

/** Reads a string field. @internal */
export function text(node: Node, key: string): string | null {
  const value = node[key];
  return typeof value === "string" ? value : null;
}

/** Reads a boolean field. @internal */
export function flag(node: Node, key: string): boolean {
  return node[key] === true;
}

/** Tells whether a value is a tree node. @internal */
export function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    typeof (value as { start?: unknown }).start === "number" &&
    typeof (value as { end?: unknown }).end === "number"
  );
}

/** The name of an identifier-like node. @internal */
export function nameOf(node: Node | null): string | null {
  if (node === null) return null;
  if (node.type === "Identifier" || node.type === "JSXIdentifier") return text(node, "name");
  return null;
}

type OxcModule = typeof import("oxc-parser");
let oxc: Promise<OxcModule> | undefined;

/** The language the parser reads a file as, from its extension. */
function languageOf(filename: string): "ts" | "tsx" | "jsx" {
  if (filename.endsWith(".tsx")) return "tsx";
  if (filename.endsWith(".ts") || filename.endsWith(".mts") || filename.endsWith(".cts")) {
    return "ts";
  }
  return "jsx";
}

/**
 * Parses one file. The parser is loaded on first use, so a scaffolding run never pays for it.
 * @param filename The file name, for the language and for messages.
 * @param source The text.
 * @returns The program node.
 * @throws ParseFailure when the text is not valid for its language.
 * @internal
 */
export async function parseProgram(filename: string, source: string): Promise<Node> {
  oxc ??= import("oxc-parser");
  const { parseSync } = await oxc;
  const result = parseSync(filename, source, { lang: languageOf(filename), preserveParens: false });
  const first = result.errors[0];
  if (first !== undefined) throw new ParseFailure(first.message);
  const program: unknown = result.program;
  if (!isNode(program)) throw new ParseFailure("the parser returned no program");
  return program;
}

const SKIPPED_KEYS: ReadonlySet<string> = new Set([
  "typeAnnotation",
  "returnType",
  "typeParameters",
  "typeArguments",
  "superTypeArguments",
  "implements",
]);

const SKIPPED_TYPES: ReadonlySet<string> = new Set([
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSDeclareFunction",
  "TSModuleDeclaration",
  "TSEnumDeclaration",
  "TSImportEqualsDeclaration",
  "TSExportAssignment",
  "TSNamespaceExportDeclaration",
]);

const FUNCTIONS: ReadonlySet<string> = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

const BLOCK_SCOPES: ReadonlySet<string> = new Set([
  "BlockStatement",
  "Program",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "SwitchStatement",
  "StaticBlock",
]);

const PATTERN_PARENTS: ReadonlySet<string> = new Set([
  "ArrayPattern",
  "ObjectPattern",
  "AssignmentPattern",
  "RestElement",
]);

/** The identifiers a binding pattern declares. */
function patternIdentifiers(pattern: Node | null, out: Node[]): void {
  if (pattern === null) return;
  switch (pattern.type) {
    case "Identifier":
      out.push(pattern);
      return;
    case "ArrayPattern":
      for (const element of children(pattern, "elements")) patternIdentifiers(element, out);
      return;
    case "ObjectPattern":
      for (const property of children(pattern, "properties")) {
        patternIdentifiers(
          property.type === "RestElement" ? property : child(property, "value"),
          out,
        );
      }
      return;
    case "AssignmentPattern":
      patternIdentifiers(child(pattern, "left"), out);
      return;
    case "RestElement":
      patternIdentifiers(child(pattern, "argument"), out);
      return;
    case "TSParameterProperty":
      patternIdentifiers(child(pattern, "parameter"), out);
      return;
    default:
      return;
  }
}

/** Breaks a source text into the offsets where its lines start. */
function lineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

/**
 * Everything the codemods ask of a parsed file: parents, declarations, every use of every name and
 * the declaration each use resolves to. Built in one walk, so a file is analyzed once.
 *
 * @internal
 */
export class Module {
  readonly program: Node;
  readonly source: string;
  /** Every declared name in the file, at any depth. */
  readonly declaredNames: Set<string> = new Set();
  private readonly parents = new Map<Node, Node>();
  private readonly scopes = new Map<Node, Map<string, Node>>();
  private readonly bindings = new Set<Node>();
  private readonly uses: Reference[] = [];
  private readonly byDeclaration = new Map<Node, Reference[]>();
  private readonly starts: number[];

  /**
   * @param program The parsed program.
   * @param source The text it was parsed from.
   */
  constructor(program: Node, source: string) {
    this.program = program;
    this.source = source;
    this.starts = lineStarts(source);
    this.walk(program, [], "");
    for (const use of this.uses) {
      const list = use.declaration === undefined ? undefined : this.listFor(use.declaration);
      list?.push(use);
    }
  }

  /** The parent of a node, if it has one. */
  parent(node: Node): Node | undefined {
    return this.parents.get(node);
  }

  /** Every use of the name that `declaration` declares, in source order. */
  referencesTo(declaration: Node): readonly Reference[] {
    return this.byDeclaration.get(declaration) ?? [];
  }

  /** Every use of every name. */
  references(): readonly Reference[] {
    return this.uses;
  }

  /** The one-based line of an offset. */
  lineOf(offset: number): number {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((this.starts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  }

  /** The source text of a node. */
  slice(node: Node): string {
    return this.source.slice(node.start, node.end);
  }

  /** Walks up from a node, nearest first, excluding the node. */
  *ancestors(node: Node): Generator<Node> {
    let current = this.parents.get(node);
    while (current !== undefined) {
      yield current;
      current = this.parents.get(current);
    }
  }

  private listFor(declaration: Node): Reference[] {
    let list = this.byDeclaration.get(declaration);
    if (list === undefined) {
      list = [];
      this.byDeclaration.set(declaration, list);
    }
    return list;
  }

  private declare(scope: Node, identifier: Node): void {
    const name = text(identifier, "name");
    if (name === null) return;
    this.bindings.add(identifier);
    this.declaredNames.add(name);
    let names = this.scopes.get(scope);
    if (names === undefined) {
      names = new Map();
      this.scopes.set(scope, names);
    }
    if (!names.has(name)) names.set(name, identifier);
  }

  private walk(node: Node, stack: Node[], key: string): void {
    if (SKIPPED_TYPES.has(node.type)) return;
    const parent = stack[stack.length - 1];
    if (parent !== undefined) this.parents.set(node, parent);
    this.registerDeclarations(node, stack);
    if (node.type === "Identifier") this.noteIdentifier(node, parent, key);
    else if (node.type === "JSXIdentifier") this.noteJsx(node, parent, key);

    stack.push(node);
    for (const [name, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(name)) continue;
      if (Array.isArray(value)) {
        for (const item of value) if (isNode(item)) this.walk(item, stack, name);
      } else if (isNode(value)) {
        this.walk(value, stack, name);
      }
    }
    stack.pop();
  }

  /** Records what `node` declares, in the scope it declares into. */
  private registerDeclarations(node: Node, stack: readonly Node[]): void {
    const found: Node[] = [];
    switch (node.type) {
      case "VariableDeclaration": {
        const isVar = text(node, "kind") === "var";
        for (const declarator of children(node, "declarations")) {
          patternIdentifiers(child(declarator, "id"), found);
        }
        const scope = isVar ? this.functionScope(stack) : this.blockScope(stack);
        for (const identifier of found) this.declare(scope, identifier);
        return;
      }
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        for (const param of children(node, "params")) patternIdentifiers(param, found);
        for (const identifier of found) this.declare(node, identifier);
        const id = child(node, "id");
        if (id !== null) {
          this.declare(node.type === "FunctionDeclaration" ? this.blockScope(stack) : node, id);
        }
        return;
      }
      case "ClassDeclaration":
      case "ClassExpression": {
        const id = child(node, "id");
        if (id !== null)
          this.declare(node.type === "ClassDeclaration" ? this.blockScope(stack) : node, id);
        return;
      }
      case "CatchClause": {
        patternIdentifiers(child(node, "param"), found);
        for (const identifier of found) this.declare(node, identifier);
        return;
      }
      case "ImportSpecifier":
      case "ImportDefaultSpecifier":
      case "ImportNamespaceSpecifier": {
        const local = child(node, "local");
        const program = stack[0];
        if (local !== null && program !== undefined) this.declare(program, local);
        return;
      }
      default:
        return;
    }
  }

  private blockScope(stack: readonly Node[]): Node {
    for (let index = stack.length - 1; index >= 0; index--) {
      const node = stack[index];
      if (node !== undefined && BLOCK_SCOPES.has(node.type)) return node;
    }
    return this.program;
  }

  private functionScope(stack: readonly Node[]): Node {
    for (let index = stack.length - 1; index >= 0; index--) {
      const node = stack[index];
      if (node !== undefined && (FUNCTIONS.has(node.type) || node.type === "StaticBlock")) {
        return node;
      }
    }
    return this.program;
  }

  private resolve(node: Node, name: string): Node | undefined {
    let current: Node | undefined = this.parents.get(node);
    while (current !== undefined) {
      const found = this.scopes.get(current)?.get(name);
      if (found !== undefined) return found;
      current = this.parents.get(current);
    }
    return undefined;
  }

  private isWriteTarget(node: Node): boolean {
    let current = node;
    let parent = this.parents.get(current);
    while (parent !== undefined) {
      if (parent.type === "AssignmentExpression") return parent["left"] === current;
      if (parent.type === "UpdateExpression") return true;
      if (parent.type === "ForInStatement" || parent.type === "ForOfStatement") {
        return parent["left"] === current;
      }
      if (parent.type === "Property" && this.parents.get(parent)?.type === "ObjectPattern") {
        current = parent;
      } else if (PATTERN_PARENTS.has(parent.type)) {
        if (parent.type === "AssignmentPattern" && parent["left"] !== current) return false;
        current = parent;
      } else {
        return false;
      }
      parent = this.parents.get(current);
    }
    return false;
  }

  private noteIdentifier(node: Node, parent: Node | undefined, key: string): void {
    if (this.bindings.has(node) || parent === undefined) return;
    const computed = flag(parent, "computed");
    switch (parent.type) {
      case "MemberExpression":
        if (key === "property" && !computed) return;
        break;
      case "Property":
        if (key === "key" && !computed) return;
        break;
      case "MethodDefinition":
      case "PropertyDefinition":
      case "AccessorProperty":
        if (key === "key" && !computed) return;
        break;
      case "LabeledStatement":
      case "BreakStatement":
      case "ContinueStatement":
      case "MetaProperty":
      case "ImportSpecifier":
      case "ExportAllDeclaration":
        return;
      case "ExportSpecifier":
        if (key !== "local") return;
        break;
      default:
        break;
    }
    const name = text(node, "name");
    if (name === null) return;
    let kind: ReferenceKind = "read";
    if (parent.type === "ExportSpecifier") kind = "export";
    else if (this.isWriteTarget(node)) kind = "write";
    else if (parent.type === "Property" && flag(parent, "shorthand")) kind = "shorthand";
    this.uses.push({ node, name, kind, declaration: this.resolve(node, name) });
  }

  private noteJsx(node: Node, parent: Node | undefined, key: string): void {
    if (parent === undefined) return;
    const name = text(node, "name");
    if (name === null) return;
    const isTag =
      (parent.type === "JSXOpeningElement" || parent.type === "JSXClosingElement") &&
      key === "name";
    const isMemberRoot = parent.type === "JSXMemberExpression" && key === "object";
    if (!isTag && !isMemberRoot) return;
    if (isTag && /^[a-z]/.test(name)) return;
    this.uses.push({ node, name, kind: "jsx", declaration: this.resolve(node, name) });
  }
}

/**
 * Applies edits to a text. Identical edits collapse; edits that overlap are an error, because the
 * result would depend on the order.
 *
 * @param source The original text.
 * @param edits The edits, in any order.
 * @returns The edited text.
 * @throws EditConflict when two edits overlap.
 * @internal
 */
export function applyEdits(source: string, edits: readonly Edit[]): string {
  const seen = new Set<string>();
  const unique: Edit[] = [];
  for (const edit of edits) {
    const id = `${edit.start}:${edit.end}:${edit.text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(edit);
  }
  const ordered = unique
    .map((edit, index) => ({ edit, index }))
    .sort(
      (a, b) =>
        a.edit.start - b.edit.start ||
        a.edit.end - a.edit.start - (b.edit.end - b.edit.start) ||
        a.index - b.index,
    );
  let out = "";
  let cursor = 0;
  for (const { edit } of ordered) {
    if (edit.start < cursor) throw new EditConflict(`edits overlap at offset ${edit.start}`);
    out += source.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return out + source.slice(cursor);
}
