import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { safeJoin } from "./names";

/** Where a project is written, and the rules for writing it. */

/** The state of the target directory before writing. @since 1.0.0 */
export type TargetState = "missing" | "empty" | "not-empty";

/** The reason a Node file-system error carries, without its stack or path noise. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Looks at the target without changing it.
 *
 * @param target Absolute path.
 * @returns `missing`, `empty` or `not-empty`.
 * @throws Error when the path exists and is not a directory, or when it cannot be read (for
 *   example because a parent of it is a file).
 * @example
 * inspectTarget("/does/not/exist/app"); // "missing"
 * @since 1.0.0
 */
export function inspectTarget(target: string): TargetState {
  let isDirectory: boolean;
  try {
    isDirectory = statSync(target).isDirectory();
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, "code") === "ENOENT") return "missing";
    throw new Error(`${target} cannot be used: ${reasonOf(error)}`);
  }
  if (!isDirectory) throw new Error(`${target} exists and is not a directory.`);
  return readdirSync(target).length === 0 ? "empty" : "not-empty";
}

/** What was written. @since 1.0.0 */
export interface WriteResult {
  readonly directory: string;
  /** Relative paths, in the order they were written. */
  readonly files: string[];
}

/** True when `path` is `root` or lies below it. */
function within(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

/**
 * The folders the write has to create, deepest first, so they can be removed in that order.
 */
function missingFolders(root: string, folders: readonly string[]): string[] {
  const missing = new Set<string>();
  for (const start of folders) {
    let folder = start;
    while (within(root, folder) && !existsSync(folder)) {
      missing.add(folder);
      const parent = dirname(folder);
      if (parent === folder) break;
      folder = parent;
    }
  }
  return [...missing].sort((a, b) => b.length - a.length);
}

/**
 * Removes what a failed write created. Only files and folders that did not exist before the write
 * are removed; a folder that cannot be removed is reported in the returned list, never ignored.
 */
function rollback(createdFiles: readonly string[], createdFolders: readonly string[]): string[] {
  const left: string[] = [];
  for (const file of [...createdFiles].reverse()) {
    try {
      rmSync(file, { force: true });
    } catch (error) {
      left.push(`${file} (${reasonOf(error)})`);
    }
  }
  for (const folder of createdFolders) {
    try {
      rmdirSync(folder);
    } catch (error) {
      if (existsSync(folder)) left.push(`${folder} (${reasonOf(error)})`);
    }
  }
  return left;
}

/** Two names that differ only by case are one file on macOS and Windows; refuse them together. */
function rejectCaseCollisions(files: readonly string[]): void {
  const seen = new Map<string, string>();
  for (const file of files) {
    const key = file.toLowerCase();
    const other = seen.get(key);
    if (other !== undefined && other !== file) {
      throw new Error(
        `${JSON.stringify(other)} and ${JSON.stringify(file)} differ only by case: on macOS and Windows they are one file.`,
      );
    }
    seen.set(key, file);
  }
}

/**
 * Writes a file map below `directory`.
 *
 * Everything is checked before the first byte is written: a path that would leave the project, two
 * names that differ only by case, or a directory that is not empty (without `force`), throws and
 * leaves the disk untouched. With `force` existing files of the same name are overwritten and other
 * files stay. If a write fails part-way (a permission, a disk, a file where a folder must go), the
 * files and folders this call created are removed again, and the error names the file.
 *
 * @param directory Target directory (created when missing).
 * @param files Relative POSIX path to content.
 * @param options `force` allows writing into a non-empty directory.
 * @returns The absolute directory and the files written.
 * @throws Error `<dir> is not empty.`, a refused path, or `Could not write <file>: <reason>`.
 * @example
 * writeProject("/work/app", new Map([["README.md", "# app\n"]]), { force: false });
 * @since 1.0.0
 */
export function writeProject(
  directory: string,
  files: ReadonlyMap<string, string>,
  options: { force: boolean },
): WriteResult {
  const target = resolve(directory);
  const targets = [...files.keys()].map((file) => [file, safeJoin(target, file)] as const);
  rejectCaseCollisions([...files.keys()]);
  const state = inspectTarget(target);
  if (state === "not-empty" && !options.force) throw new Error(`${target} is not empty.`);
  const createdFolders = missingFolders(
    target,
    targets.map(([, path]) => dirname(path)),
  );
  const createdFiles: string[] = [];
  const written: string[] = [];
  let current = "";
  try {
    for (const [relative, path] of targets) {
      current = relative;
      mkdirSync(dirname(path), { recursive: true });
      const fresh = !existsSync(path);
      writeFileSync(path, files.get(relative) ?? "");
      if (fresh) createdFiles.push(path);
      written.push(relative);
    }
  } catch (error) {
    const left = rollback(createdFiles, createdFolders);
    const note = left.length === 0 ? "" : ` The write could not be undone for: ${left.join(", ")}.`;
    throw new Error(`Could not write ${current}: ${reasonOf(error)}.${note}`);
  }
  return { directory: target, files: written };
}
