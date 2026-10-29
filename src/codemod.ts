/**
 * Source-to-source codemods that move React, Preact, Solid and Next.js code onto ShadowJS. Each one parses a
 * file with oxc-parser and edits it by source range, so formatting and comments outside the edited
 * ranges stay as written. Nothing is rewritten by pattern matching on text.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { CODEMOD_NAMES, type CodemodName, isCodemodName } from "./codemod-names";
import { EditConflict, Module, ParseFailure, parseProgram, type Report } from "./codemods/ast";
import { unifiedDiff } from "./codemods/diff";
import { type Ruleset, runRuleset } from "./codemods/framework";
import { NEXT_RULES } from "./codemods/next";
import { PREACT_RULES } from "./codemods/preact";
import { REACT_RULES } from "./codemods/react";
import { REACT_ROUTER_RULES } from "./codemods/react-router";
import { SOLID_RULES } from "./codemods/solid";
import { Transform } from "./codemods/transform";

/**
 * The largest file a codemod reads. A bigger file is skipped and reported, never parsed.
 * @since 1.0.0
 */
export const MAX_CODEMOD_FILE_BYTES: number = 1024 * 1024;

export { CODEMOD_NAMES, type CodemodName, isCodemodName };

const RULESETS: Readonly<Record<CodemodName, Ruleset>> = {
  "react-to-shadow": REACT_RULES,
  "preact-to-shadow": PREACT_RULES,
  "solid-to-shadow": SOLID_RULES,
  "next-router-to-shadow": NEXT_RULES,
  "react-router-to-shadow": REACT_ROUTER_RULES,
};

/**
 * Something the codemod did or left for the person, with the line it is about.
 * @since 1.0.0
 */
export type CodemodReport = Report;

/**
 * The result of one codemod on one text.
 * @since 1.0.0
 */
export interface TransformResult {
  /** The new text; the input itself when nothing changed. */
  readonly output: string;
  readonly changed: boolean;
  /** Sorted by line. */
  readonly reports: readonly CodemodReport[];
}

/** Why a file was skipped. @since 1.0.0 */
export type SkipReason =
  | "too-large"
  | "node_modules"
  | "dist"
  | "unsupported-extension"
  | "parse-error"
  | "not-utf8"
  | "too-deep"
  | "conflict";

/** Why a path was refused: no file is written when one is. @since 1.0.0 */
export type RefuseReason = "outside-cwd" | "missing";

/**
 * What happened to one file.
 * @since 1.0.0
 */
export interface FileResult {
  /** Relative to the working directory, with forward slashes. */
  readonly file: string;
  readonly status: "changed" | "unchanged" | "skipped" | "refused";
  readonly reason?: SkipReason | RefuseReason;
  /** A sentence for `skipped` files whose reason needs one, such as the parser's message. */
  readonly message?: string;
  /** The unified diff of a changed file. */
  readonly diff?: string;
  readonly reports: readonly CodemodReport[];
  /** True when the new text was written to the disk. */
  readonly written: boolean;
}

/**
 * What to run.
 * @since 1.0.0
 */
export interface RunOptions {
  readonly name: CodemodName;
  /** Files or folders, relative to `cwd`. */
  readonly targets: readonly string[];
  readonly cwd: string;
  /** True to write the changes; false to compute them only. */
  readonly write: boolean;
}

/**
 * The files a run looked at, in the order of its targets.
 * @since 1.0.0
 */
export interface RunResult {
  readonly files: readonly FileResult[];
}

const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const BOM = "﻿";

/**
 * Runs one codemod over one source text. It never touches the disk.
 *
 * @param codemod The codemod.
 * @param filename The file name, which decides the language (`.tsx`, `.ts`, `.jsx`, ...) and appears in errors.
 * @param input The source text.
 * @returns The new text, whether it changed, and the reports.
 * @throws When the text cannot be parsed, or two edits overlap.
 * @example
 * const { output } = await transformSource("solid-to-shadow", "a.ts", 'import { createSignal } from "solid-js";\n');
 * @since 1.0.0
 */
export async function transformSource(
  codemod: CodemodName,
  filename: string,
  input: string,
): Promise<TransformResult> {
  const hasBom = input.startsWith(BOM);
  const source = hasBom ? input.slice(1) : input;
  const program = await parseProgram(filename, source);
  const transform = new Transform(new Module(program, source));
  runRuleset(transform, RULESETS[codemod]);
  const edited = transform.finish();
  const output = hasBom ? BOM + edited : edited;
  const reports = [...transform.reports].sort((a, b) => a.line - b.line);
  return { output, changed: output !== input, reports };
}

/**
 * Runs one codemod over files and folders under a working directory. A path that leaves the
 * directory (by `..`, an absolute path or a symbolic link) or does not exist is refused, and then
 * nothing at all is written. `node_modules`, `dist`, `.git`, declaration files and files over 1 MiB
 * are skipped.
 *
 * @param options What to run.
 * @returns One result per file.
 * @example
 * const { files } = await runCodemod({ name: "react-to-shadow", targets: ["src"], cwd: process.cwd(), write: false });
 * @since 1.0.0
 */
export async function runCodemod(options: RunOptions): Promise<RunResult> {
  const root = resolve(options.cwd);
  const realRoot = realpathSync(root);
  const files: FileResult[] = [];
  const seen = new Set<string>();
  const pending: Array<{ path: string; result: FileResult; text?: string }> = [];

  for (const target of options.targets) {
    const absolute = resolve(root, target);
    if (!isInside(root, absolute)) {
      files.push(refused(target, "outside-cwd"));
      continue;
    }
    if (!existsSync(absolute)) {
      files.push(refused(target, "missing"));
      continue;
    }
    const real = realpathSync(absolute);
    if (!isInside(realRoot, real)) {
      files.push(refused(target, "outside-cwd"));
      continue;
    }
    const name = display(realRoot, real);
    const excluded = excludedFolder(name);
    if (excluded !== null) {
      files.push(skipped(name, excluded));
      continue;
    }
    const isFolder = statSync(real).isDirectory();
    for (const path of isFolder ? walk(real) : [real]) {
      if (seen.has(path)) continue;
      seen.add(path);
      const item = await processFile(options.name, realRoot, path, isFolder);
      files.push(item.result);
      if (item.text !== undefined) pending.push({ path, result: item.result, text: item.text });
    }
  }

  const blocked = files.some((file) => file.status === "refused");
  if (!options.write || blocked) return { files };
  const written = new Map<string, FileResult>();
  for (const item of pending) {
    if (item.text === undefined) continue;
    writeFileSync(item.path, item.text);
    written.set(item.result.file, { ...item.result, written: true });
  }
  return { files: files.map((file) => written.get(file.file) ?? file) };
}

function refused(file: string, reason: RefuseReason): FileResult {
  return { file, status: "refused", reason, reports: [], written: false };
}

function skipped(file: string, reason: SkipReason, message?: string): FileResult {
  return message === undefined
    ? { file, status: "skipped", reason, reports: [], written: false }
    : { file, status: "skipped", reason, message, reports: [], written: false };
}

/** The path as printed: relative to the working directory, forward slashes, `.` for the directory. */
function display(root: string, path: string): string {
  const rel = relative(root, path).split(sep).join("/");
  return rel === "" ? "." : rel;
}

/** The excluded folder a path passes through, if any. */
function excludedFolder(name: string): "node_modules" | "dist" | null {
  for (const segment of name.split("/")) {
    if (segment === "node_modules") return "node_modules";
    if (segment === "dist") return "dist";
  }
  return null;
}

/** Reads, transforms and diffs one file. `text` is set only when the file changed. */
async function processFile(
  codemod: CodemodName,
  root: string,
  path: string,
  fromFolder: boolean,
): Promise<{ result: FileResult; text?: string }> {
  const file = display(root, path);
  const supported =
    SUPPORTED_EXTENSIONS.some((extension) => path.endsWith(extension)) &&
    !DECLARATION_FILE.test(path);
  if (!supported) {
    return { result: skipped(file, "unsupported-extension") };
  }
  if (statSync(path).size > MAX_CODEMOD_FILE_BYTES) {
    return { result: skipped(file, "too-large") };
  }
  const bytes = readFileSync(path);
  const input = bytes.toString("utf8");
  // Writing back text that was decoded with replacement characters would corrupt the file.
  if (!Buffer.from(input, "utf8").equals(bytes)) return { result: skipped(file, "not-utf8") };
  // A file the codemod has no import to migrate is left alone without being parsed in a folder walk.
  if (fromFolder && !mentionsASource(codemod, input)) {
    return { result: { file, status: "unchanged", reports: [], written: false } };
  }
  let transformed: TransformResult;
  try {
    transformed = await transformSource(codemod, file, input);
  } catch (error) {
    if (error instanceof ParseFailure)
      return { result: skipped(file, "parse-error", error.message) };
    if (error instanceof EditConflict) return { result: skipped(file, "conflict", error.message) };
    if (error instanceof RangeError) return { result: skipped(file, "too-deep") };
    throw error;
  }
  if (!transformed.changed) {
    return { result: { file, status: "unchanged", reports: transformed.reports, written: false } };
  }
  return {
    result: {
      file,
      status: "changed",
      diff: unifiedDiff(file, input, transformed.output),
      reports: transformed.reports,
      written: false,
    },
    text: transformed.output,
  };
}

/** Cheap pre-check for folder walks: does the text name any module the codemod migrates? */
function mentionsASource(codemod: CodemodName, input: string): boolean {
  for (const source of RULESETS[codemod].sources) if (input.includes(source)) return true;
  return false;
}

/** The part of a directory entry the walk reads. A `Dirent` fits. */
export interface WalkEntry {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

/**
 * Source files under a folder, sorted, without the folders the codemods never enter (`node_modules`,
 * `dist`, `.git`). The walk keeps its own stack of folders, so a tree of any depth is read without
 * recursion, and each folder's files are appended one by one (a spread of a big array into `push` could
 * pass the engine's argument limit). A symbolic link is neither a file nor a folder here, so it is never
 * followed.
 *
 * @param folder The folder to read.
 * @param readEntries Lists a folder. Tests pass a fake tree; the default reads the file system.
 * @returns Absolute paths in depth-first order: the entries of a folder by name, a subfolder's files
 *   where the subfolder sorts.
 * @example
 * import { walk } from "./codemod";
 *
 * const files = walk(process.cwd());
 * @since 1.0.1
 */
export function walk(
  folder: string,
  readEntries: (folder: string) => readonly WalkEntry[] = (dir) =>
    readdirSync(dir, { withFileTypes: true }),
): string[] {
  const found: string[] = [];
  const sorted = (dir: string): WalkEntry[] =>
    [...readEntries(dir)].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const stack = [{ folder, entries: sorted(folder), next: 0 }];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top === undefined) break;
    const entry = top.entries[top.next];
    if (entry === undefined) {
      stack.pop();
      continue;
    }
    top.next += 1;
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = join(top.folder, entry.name);
    if (entry.isDirectory()) {
      stack.push({ folder: full, entries: sorted(full), next: 0 });
    } else if (
      entry.isFile() &&
      SUPPORTED_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) &&
      !DECLARATION_FILE.test(entry.name)
    ) {
      found.push(full);
    }
  }
  return found;
}

/** Tells whether `path` is `root` or lies under it. */
function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
