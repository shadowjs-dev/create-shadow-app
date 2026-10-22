import * as nodePath from "node:path";

/** The path functions of one platform; tests pass `win32` to check Windows rules on any machine. @since 1.0.0 */
export type PathApi = nodePath.PlatformPath;

/**
 * Package names and paths from untrusted input (a command-line argument, a prompt answer): what is
 * accepted, and what is refused before anything is written.
 */

const NPM_NAME = /^(?:@[a-z0-9\-~][a-z0-9\-._~]*\/)?[a-z0-9\-~][a-z0-9\-._~]*$/;

/** Names npm refuses for a new package, whatever the scope (`validate-npm-package-name`). */
const NPM_RESERVED: ReadonlySet<string> = new Set(["node_modules", "favicon.ico"]);

/**
 * Node's built-in modules. npm refuses them as unscoped package names: `import "http"` would reach
 * the built-in, never the package. A scope avoids the clash.
 */
const BUILT_IN_MODULES: ReadonlySet<string> = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

/** The device names Windows reserves: a folder called `CON` or `nul.txt` cannot exist there. */
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/** Characters a Windows folder name may not hold, and the backslash, which is a separator there. */
const WINDOWS_FORBIDDEN = '<>:"|?*\\';

/** True when a folder name holds a character Windows refuses, or a control character. */
function holdsForbidden(segment: string): boolean {
  return [...segment].some((char) => WINDOWS_FORBIDDEN.includes(char) || char.charCodeAt(0) < 32);
}

/**
 * Why `name` cannot be a new package's name, or `undefined` when npm accepts it: lowercase, no
 * spaces, URL-safe, at most 214 characters, optionally scoped, and not a name npm reserves.
 *
 * @param name Candidate name.
 * @returns The problem, in a sentence that says how to fix it, or `undefined`.
 * @example
 * packageNameProblem("http"); // '"http" cannot be a package name: ... Choose another name, or add a scope such as @you/http.'
 * @since 1.0.0
 */
export function packageNameProblem(name: string): string | undefined {
  if (name.length === 0 || name.length > 214 || !NPM_NAME.test(name)) {
    return `"${name}" is not a valid npm package name.`;
  }
  if (name.startsWith("@")) return undefined;
  const reason = NPM_RESERVED.has(name)
    ? `npm reserves "${name}"`
    : BUILT_IN_MODULES.has(name)
      ? `"${name}" is the name of a Node built-in module`
      : undefined;
  if (reason === undefined) return undefined;
  if (NPM_RESERVED.has(name))
    return `"${name}" cannot be a package name: ${reason}. Choose another name.`;
  return `"${name}" cannot be a package name: ${reason}. Choose another name, or add a scope such as @you/${name}.`;
}

/**
 * True for names npm accepts for a new package: see {@link packageNameProblem}.
 *
 * @param name Candidate name.
 * @returns Whether `npm publish` would accept it.
 * @example
 * isValidPackageName("@scope/app"); // true
 * isValidPackageName("My App"); // false
 * isValidPackageName("http"); // false
 * @since 1.0.0
 */
export function isValidPackageName(name: string): boolean {
  return packageNameProblem(name) === undefined;
}

/**
 * Turns a directory name into a valid package name.
 *
 * @param directory A path; only its last segment is used.
 * @param path The path functions of the platform. Default: this machine's.
 * @returns The name (`My App!` becomes `my-app`), or `undefined` when nothing usable remains.
 * @example
 * toPackageName("/tmp/My Cool_App"); // "my-cool_app"
 * @since 1.0.0
 */
export function toPackageName(directory: string, path: PathApi = nodePath): string | undefined {
  const base = candidateName(directory, path);
  return isValidPackageName(base) ? base : undefined;
}

/**
 * The directory's last segment, lowercased and with every character a package name cannot hold
 * turned into `-`. It is not yet a valid name: check it with {@link packageNameProblem}. Empty when
 * nothing usable remains.
 *
 * @param directory A path; only its last segment is used.
 * @param path The path functions of the platform. Default: this machine's.
 * @returns The candidate, possibly empty.
 * @example
 * candidateName("/tmp/http"); // "http", which packageNameProblem refuses
 * @since 1.0.0
 */
export function candidateName(directory: string, path: PathApi = nodePath): string {
  return path
    .basename(path.resolve(directory))
    .toLowerCase()
    .replace(/[^a-z0-9\-._~]+/g, "-")
    .replace(/^[-._]+|-+$/g, "");
}

/**
 * What Windows refuses in a folder name, checked on every platform so a project made here can be
 * cloned there. Checked per segment of the argument: the drive of a Windows absolute path is the
 * one colon that is allowed.
 */
function windowsProblem(input: string, path: PathApi): string | undefined {
  const windowsStyle = path.sep === "\\";
  const segments = input.split(windowsStyle ? /[\\/]+/ : /\/+/);
  for (const [index, segment] of segments.entries()) {
    if (segment === "" || segment === "." || segment === "..") continue;
    if (windowsStyle && index === 0 && /^[A-Za-z]:$/.test(segment)) continue;
    if (holdsForbidden(segment)) {
      return `"${input}" has a character Windows does not allow in a folder name (< > : " | ? * \\ or a control character).`;
    }
    if (/[. ]$/.test(segment)) {
      return `"${input}" ends a folder name with a dot or a space, which Windows does not allow.`;
    }
    if (WINDOWS_DEVICE.test(segment)) {
      return `"${segment}" is a name Windows reserves (CON, PRN, AUX, NUL, COM1-9, LPT1-9). Choose another folder name.`;
    }
  }
  return undefined;
}

/**
 * A refused input. The command line prints the message and exits with the usage code.
 *
 * @example
 * new UsageError("Unknown option --x.").name; // "UsageError"
 * @since 1.0.0
 */
export class UsageError extends Error {
  /** The stable code `--json` prints, such as `CREATE_SHADOW_APP_UNKNOWN_OPTION`. */
  readonly code: string;

  /**
   * @param message What was wrong and how to fix it.
   * @param code The stable code of the refusal. Defaults to `CREATE_SHADOW_APP_INVALID_OPTION`.
   */
  constructor(message: string, code = "CREATE_SHADOW_APP_INVALID_OPTION") {
    super(message);
    this.name = "UsageError";
    this.code = code;
  }
}

/**
 * Resolves the directory argument against the working directory.
 *
 * It refuses an empty argument, a NUL byte, the filesystem root and, unless `allowOutside` is set,
 * any path that leaves the working directory (`../x`, `/elsewhere`, another drive): a typo or a
 * script that builds the argument from untrusted text must not write elsewhere by accident.
 *
 * @param cwd The working directory.
 * @param input The directory argument.
 * @param allowOutside Permit a target outside `cwd`.
 * @param path The path functions of the platform. Default: this machine's.
 * @returns The absolute target path.
 * @throws UsageError for a refused path.
 * @example
 * resolveTarget("/work", "apps/web", false); // "/work/apps/web"
 * @since 1.0.0
 */
export function resolveTarget(
  cwd: string,
  input: string,
  allowOutside: boolean,
  path: PathApi = nodePath,
): string {
  if (input.trim() === "")
    throw new UsageError("The project directory is empty.", "CREATE_SHADOW_APP_INVALID_DIRECTORY");
  if (input.includes("\0")) {
    throw new UsageError(
      "The project directory contains a NUL byte.",
      "CREATE_SHADOW_APP_INVALID_DIRECTORY",
    );
  }
  const windows = windowsProblem(input, path);
  if (windows !== undefined) throw new UsageError(windows, "CREATE_SHADOW_APP_INVALID_DIRECTORY");
  const target = path.resolve(cwd, input);
  if (target === path.resolve(target, "..")) {
    throw new UsageError(
      "Refusing to scaffold into the root of the filesystem.",
      "CREATE_SHADOW_APP_INVALID_DIRECTORY",
    );
  }
  const away = path.relative(cwd, target);
  const outside = away === ".." || away.startsWith(`..${path.sep}`) || path.isAbsolute(away);
  if (outside && !allowOutside) {
    throw new UsageError(
      `"${input}" is outside the current directory (${cwd}). Choose a path below it, or pass --allow-outside.`,
      "CREATE_SHADOW_APP_INVALID_DIRECTORY",
    );
  }
  return target;
}

/**
 * Joins a project-relative file path to the target, refusing anything that could land outside it:
 * absolute paths, drive letters, `..` segments, NUL bytes and backslashes.
 *
 * @param target Absolute project directory.
 * @param file Relative POSIX path from the file map.
 * @param path The path functions of the platform. Default: this machine's.
 * @returns The absolute path of the file.
 * @throws Error when the path would escape `target`.
 * @example
 * safeJoin("/work/app", "src/main.tsx"); // "/work/app/src/main.tsx"
 * @since 1.0.0
 */
export function safeJoin(target: string, file: string, path: PathApi = nodePath): string {
  const unsafe =
    file === "" ||
    file.includes("\0") ||
    file.includes("\\") ||
    file.startsWith("/") ||
    /^[A-Za-z]:/.test(file) ||
    file.split("/").some((part) => part === ".." || part === "." || part === "");
  if (unsafe) throw new Error(`Refusing to write outside the project: ${JSON.stringify(file)}`);
  const joined = path.resolve(target, ...file.split("/"));
  const away = path.relative(target, joined);
  // A segment check: a folder named `..x` is inside the project, only `..` itself is a way out.
  const escapes = away === ".." || away.startsWith(`..${path.sep}`);
  if (away === "" || escapes || path.isAbsolute(away)) {
    throw new Error(`Refusing to write outside the project: ${JSON.stringify(file)}`);
  }
  return joined;
}
