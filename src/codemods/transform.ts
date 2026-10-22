import {
  applyEdits,
  child,
  children,
  type Edit,
  type Module,
  type Node,
  nameOf,
  type Report,
  text,
} from "./ast";

/** One name a file imports, with the declaration and specifier that import it. @internal */
export interface ImportBinding {
  readonly declaration: Node;
  readonly specifier: Node;
  readonly source: string;
  /** The exported name; `default` for a default import and `*` for a namespace import. */
  readonly imported: string;
  readonly local: string;
  /** The identifier that declares the local name. */
  readonly localNode: Node;
  /** True for `import type` and `import { type X }`. */
  readonly typeOnly: boolean;
}

/** A name a codemod needs imported from a ShadowJS package. @internal */
export interface ImportRequest {
  readonly module: string;
  readonly imported: string;
  readonly local: string;
}

/**
 * The state of one codemod run over one file: the parsed module, the edits and the reports. The
 * codemods only describe changes here; {@link Transform.finish} turns them into text.
 *
 * @internal
 */
export class Transform {
  readonly module: Module;
  readonly edits: Edit[] = [];
  readonly reports: Report[] = [];
  /** The line ending of the file, used for every line the codemod adds. */
  readonly eol: string;
  private readonly requests: ImportRequest[] = [];
  private readonly removed = new Set<Node>();

  /**
   * @param module The analyzed file.
   */
  constructor(module: Module) {
    this.module = module;
    this.eol = module.source.includes("\r\n") ? "\r\n" : "\n";
  }

  /** Inserts text at an offset. */
  insert(offset: number, value: string): void {
    this.edits.push({ start: offset, end: offset, text: value });
  }

  /** Replaces the source of a node. */
  replace(node: Node, value: string): void {
    this.edits.push({ start: node.start, end: node.end, text: value });
  }

  /** Deletes a source range. */
  remove(start: number, end: number): void {
    if (end > start) this.edits.push({ start, end, text: "" });
  }

  /** Reports something the codemod left for the person to do. */
  warn(at: Node, message: string): void {
    this.reports.push({ line: this.module.lineOf(at.start), level: "warning", message });
  }

  /** Reports something the codemod did that deserves a second look. */
  note(at: Node, message: string): void {
    this.reports.push({ line: this.module.lineOf(at.start), level: "note", message });
  }

  /** Every import of the given sources. */
  importBindings(sources: ReadonlySet<string>): ImportBinding[] {
    const found: ImportBinding[] = [];
    for (const declaration of children(this.module.program, "body")) {
      if (declaration.type !== "ImportDeclaration") continue;
      const source = this.sourceText(declaration);
      if (source === null || !sources.has(source)) continue;
      const declarationTypeOnly = text(declaration, "importKind") === "type";
      for (const specifier of children(declaration, "specifiers")) {
        const localNode = child(specifier, "local");
        const local = nameOf(localNode);
        if (localNode === null || local === null) continue;
        let imported = "*";
        if (specifier.type === "ImportDefaultSpecifier") imported = "default";
        else if (specifier.type === "ImportSpecifier") {
          const name = child(specifier, "imported");
          imported = nameOf(name) ?? (name === null ? null : text(name, "value")) ?? local;
        }
        found.push({
          declaration,
          specifier,
          source,
          imported,
          local,
          localNode,
          typeOnly: declarationTypeOnly || text(specifier, "importKind") === "type",
        });
      }
    }
    return found;
  }

  /**
   * Asks for a name to be imported from a package, and for a specifier of a migrated package to go.
   *
   * @param request What to import.
   */
  request(request: ImportRequest): void {
    this.requests.push(request);
  }

  /** Drops an import specifier of the old package. */
  dropImport(binding: ImportBinding): void {
    this.removed.add(binding.specifier);
  }

  /**
   * Tells whether a local name can be bound to `imported` from `module` without clashing with
   * anything the file declares.
   */
  canBind(module: string, imported: string, local: string): boolean {
    if (!this.module.declaredNames.has(local)) return true;
    return this.existingImports(module).some(
      (binding) => binding.imported === imported && binding.local === local && !binding.typeOnly,
    );
  }

  /**
   * Builds the result.
   *
   * @returns The new text.
   * @throws EditConflict when two edits overlap.
   */
  finish(): string {
    this.planImports();
    return applyEdits(this.module.source, withoutRedundant(this.edits));
  }

  private sourceText(declaration: Node): string | null {
    const source = child(declaration, "source");
    return source === null ? null : text(source, "value");
  }

  private existingImports(module: string): ImportBinding[] {
    return this.importBindings(new Set([module]));
  }

  private planImports(): void {
    const byDeclaration = new Map<Node, Node[]>();
    for (const declaration of children(this.module.program, "body")) {
      if (declaration.type !== "ImportDeclaration") continue;
      const specifiers = children(declaration, "specifiers");
      if (specifiers.some((specifier) => this.removed.has(specifier))) {
        byDeclaration.set(declaration, specifiers);
      }
    }
    for (const [declaration, specifiers] of byDeclaration)
      this.rewriteDeclaration(declaration, specifiers);
    this.addRequests([...byDeclaration.keys()][0]);
  }

  /** Removes the dropped specifiers of one declaration, keeping everything else as written. */
  private rewriteDeclaration(declaration: Node, specifiers: readonly Node[]): void {
    const source = this.module.source;
    const kept = specifiers.filter((specifier) => !this.removed.has(specifier));
    if (kept.length === 0) {
      let end = declaration.end;
      while (source[end] === " " || source[end] === "\t") end++;
      if (source[end] === "\r" && source[end + 1] === "\n") end += 2;
      else if (source[end] === "\n") end += 1;
      else end = declaration.end;
      this.remove(declaration.start, end);
      return;
    }
    const defaultSpecifier = specifiers.find(
      (specifier) => specifier.type === "ImportDefaultSpecifier",
    );
    if (defaultSpecifier !== undefined && this.removed.has(defaultSpecifier)) {
      const rest = source.slice(defaultSpecifier.end, declaration.end);
      const open = rest.search(/[{*]/);
      if (open >= 0) this.remove(defaultSpecifier.start, defaultSpecifier.end + open);
    }
    const named = specifiers.filter((specifier) => specifier.type === "ImportSpecifier");
    const keptNamed = named.filter((specifier) => !this.removed.has(specifier));
    if (keptNamed.length === named.length) return;
    const first = named[0];
    const last = named[named.length - 1];
    if (first === undefined || last === undefined) return;
    if (keptNamed.length > 0) {
      const second = named[1];
      const separator = second === undefined ? ", " : source.slice(first.end, second.start);
      this.edits.push({
        start: first.start,
        end: last.end,
        text: keptNamed.map((specifier) => this.module.slice(specifier)).join(separator),
      });
      return;
    }
    const close = source.indexOf("}", last.end);
    const keptDefault =
      defaultSpecifier !== undefined && !this.removed.has(defaultSpecifier)
        ? defaultSpecifier
        : null;
    if (keptDefault !== null && close >= 0) this.remove(keptDefault.end, close + 1);
  }

  /** Adds the requested imports, merged into an existing declaration of the package or as a new one. */
  private addRequests(anchor: Node | undefined): void {
    const modules = [...new Set(this.requests.map((request) => request.module))];
    const fresh: string[] = [];
    for (const module of modules) {
      const existing = this.existingImports(module).filter((binding) => !binding.typeOnly);
      const wanted: ImportRequest[] = [];
      for (const request of this.requests) {
        if (request.module !== module) continue;
        if (wanted.some((other) => other.local === request.local)) continue;
        if (existing.some((b) => b.imported === request.imported && b.local === request.local))
          continue;
        wanted.push(request);
      }
      if (wanted.length === 0) continue;
      const specifierText = (request: ImportRequest): string =>
        request.imported === request.local
          ? request.imported
          : `${request.imported} as ${request.local}`;

      const host = this.mergeTarget(module);
      if (host !== undefined) {
        const named = children(host, "specifiers").filter((s) => s.type === "ImportSpecifier");
        const last = named[named.length - 1];
        if (last !== undefined) {
          this.insert(last.end, wanted.map((request) => `, ${specifierText(request)}`).join(""));
          continue;
        }
      }
      const names = wanted
        .map(specifierText)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .join(", ");
      fresh.push(this.declarationText(names, module, anchor));
    }
    if (fresh.length === 0) return;
    this.insert(anchor?.start ?? this.afterImports(), fresh.join(""));
  }

  /** The declaration of `module` that new names can join: value imports with named specifiers only. */
  private mergeTarget(module: string): Node | undefined {
    for (const declaration of children(this.module.program, "body")) {
      if (declaration.type !== "ImportDeclaration") continue;
      if (this.sourceText(declaration) !== module) continue;
      if (text(declaration, "importKind") === "type") continue;
      const specifiers = children(declaration, "specifiers");
      if (specifiers.length > 0 && specifiers.every((s) => s.type === "ImportSpecifier")) {
        return declaration;
      }
    }
    return undefined;
  }

  /** Where a new import goes in a file that has none to stand beside: after the directives. */
  private afterImports(): number {
    let at = 0;
    for (const statement of children(this.module.program, "body")) {
      if (statement.type === "ImportDeclaration" || text(statement, "directive") !== null) {
        at = statement.end;
        while (this.module.source[at] === " " || this.module.source[at] === "\t") at++;
        if (this.module.source[at] === "\r") at++;
        if (this.module.source[at] === "\n") at++;
      } else break;
    }
    return at;
  }

  /** One import line, with the quotes and the semicolon style of the file. */
  private declarationText(names: string, module: string, anchor: Node | undefined): string {
    const reference =
      anchor ?? children(this.module.program, "body").find((s) => s.type === "ImportDeclaration");
    const source = this.module.source;
    const quote = reference === undefined ? '"' : this.quoteOf(reference);
    const semicolon = reference === undefined || source[reference.end - 1] === ";" ? ";" : "";
    return `import { ${names} } from ${quote}${module}${quote}${semicolon}${this.eol}`;
  }

  private quoteOf(declaration: Node): string {
    const node = child(declaration, "source");
    const first = node === null ? undefined : this.module.source[node.start];
    return first === "'" ? "'" : '"';
  }
}

/**
 * Drops the edits that sit inside a range another edit deletes. A dependency array that is removed
 * contains reads that were also rewritten; the deletion wins, and the rewrite would only conflict.
 */
function withoutRedundant(edits: readonly Edit[]): Edit[] {
  const deletions = edits.filter((edit) => edit.text === "" && edit.end > edit.start);
  return edits.filter(
    (edit) =>
      !deletions.some((deletion) =>
        edit.end > edit.start
          ? deletion !== edit &&
            edit.start >= deletion.start &&
            edit.end <= deletion.end &&
            !(edit.start === deletion.start && edit.end === deletion.end)
          : edit.start > deletion.start && edit.start < deletion.end,
      ),
  );
}
