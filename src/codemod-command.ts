import { type FileResult, MAX_CODEMOD_FILE_BYTES, runCodemod } from "./codemod";
import { CODEMOD_NAMES, type CodemodName, isCodemodName } from "./codemod-names";
import { type JsonWarning, RunFailure } from "./json";
import { UsageError } from "./names";
import type { PromptOutput } from "./prompts";
import type { Style } from "./style";

/**
 * `create-shadow-app codemod <name> [paths...]`: parsing the command line and printing the run. The
 * transformation itself is in `codemod.ts`.
 */

/** Where the command reports what it learned, for the `--json` document. @internal */
export interface CodemodSink {
  command: string;
  data: Record<string, unknown>;
  readonly warnings: JsonWarning[];
}

/** The streams and directory the command needs. @internal */
export interface CodemodContext {
  readonly cwd: string;
  readonly stdout: PromptOutput;
  readonly stderr: PromptOutput;
}

const NAME_CHOICES = `${CODEMOD_NAMES.slice(0, -1).join(", ")} or ${CODEMOD_NAMES[CODEMOD_NAMES.length - 1]}`;

/**
 * The usage text of the command.
 * @param style Colors, or none.
 * @returns The text, ending with a newline.
 * @internal
 */
export function codemodHelp(style: Style): string {
  return `${style.bold("create-shadow-app codemod")} - migrate code to ShadowJS

${style.bold("Usage")}
  create-shadow-app codemod <name> [paths...] [--dry-run | --write] [--json]

${style.bold("Codemods")}
  react-to-shadow            useState, useReducer, useMemo, useEffect, useCallback and imports from react
  preact-to-shadow           the same hooks from preact/hooks and preact/compat; render, Component and signals are reported
  solid-to-shadow            createSignal, createEffect, createMemo and imports from solid-js and solid-js/web
  next-router-to-shadow      next/link, useRouter and usePathname
  react-router-to-shadow     Link, NavLink, Outlet, Navigate, useNavigate, useLocation and useParams of react-router

${style.bold("Options")}
      --dry-run              print a unified diff and write nothing  [default]
      --write                apply the changes
      --json                 print one JSON document on stdout instead of words
  -h, --help                 show this help

Paths are files or folders under the current directory (default: the directory itself). node_modules, dist and
.git are skipped, and so are files over 1 MiB. A path outside the current directory is refused, and then nothing
is written. Running a codemod twice changes nothing the second time.

${style.bold("Exit codes")}  0 done, 1 a path was refused or the run failed, 2 wrong arguments
`;
}

interface Parsed {
  readonly name: CodemodName;
  readonly paths: readonly string[];
  readonly write: boolean;
  readonly help: boolean;
}

/** Parses the words after `codemod`. Every mistake is a {@link UsageError}. */
function parseCodemodArgs(rest: readonly string[]): Parsed {
  const operands: string[] = [];
  let dryRun = false;
  let write = false;
  let help = false;
  let options = true;
  for (const arg of rest) {
    if (options && arg === "--") options = false;
    else if (options && arg === "--json") continue;
    else if (options && arg === "--dry-run") dryRun = true;
    else if (options && arg === "--write") write = true;
    else if (options && (arg === "-h" || arg === "--help")) help = true;
    else if (options && arg.startsWith("-") && arg !== "-") {
      throw new UsageError(`Unknown option ${arg}.`, "CREATE_SHADOW_APP_UNKNOWN_OPTION");
    } else operands.push(arg);
  }
  if (help) return { name: CODEMOD_NAMES[0], paths: [], write: false, help };
  if (dryRun && write) {
    throw new UsageError("--dry-run and --write cannot be used together.");
  }
  const [name, ...paths] = operands;
  if (name === undefined) {
    throw new UsageError(
      `Missing codemod name: expected ${NAME_CHOICES}.`,
      "CREATE_SHADOW_APP_UNKNOWN_CODEMOD",
    );
  }
  if (!isCodemodName(name)) {
    throw new UsageError(
      `Unknown codemod "${name}": expected ${NAME_CHOICES}.`,
      "CREATE_SHADOW_APP_UNKNOWN_CODEMOD",
    );
  }
  return { name, paths: paths.length === 0 ? ["."] : paths, write, help };
}

/** One line for a file that was skipped, or null when there is nothing to tell. */
function skipMessage(file: FileResult): string | null {
  switch (file.reason) {
    case "too-large":
      return `skipped: larger than ${MAX_CODEMOD_FILE_BYTES / 1024 / 1024} MiB.`;
    case "node_modules":
      return "skipped: inside node_modules.";
    case "dist":
      return "skipped: inside dist.";
    case "unsupported-extension":
      return "skipped: not a JavaScript or TypeScript source file.";
    case "parse-error":
      return `skipped: it does not parse (${file.message ?? "syntax error"}).`;
    case "not-utf8":
      return "skipped: it is not valid UTF-8, so writing it back could corrupt it.";
    case "too-deep":
      return "skipped: it is nested too deeply to analyze.";
    case "conflict":
      return `skipped: two changes overlap (${file.message ?? "conflict"}). Edit it by hand.`;
    default:
      return null;
  }
}

/**
 * Runs the command.
 *
 * @param rest The arguments after `codemod`.
 * @param ctx The working directory and the streams.
 * @param style Colors, or none.
 * @param json True with `--json`.
 * @param sink Where the facts and warnings for the JSON document go.
 * @returns The exit code, 0 when the run finished.
 * @throws UsageError for a wrong command line (exit 2).
 * @throws RunFailure when a path is outside the working directory or missing (exit 1).
 * @internal
 */
export async function runCodemodCommand(
  rest: readonly string[],
  ctx: CodemodContext,
  style: Style,
  json: boolean,
  sink: CodemodSink,
): Promise<number> {
  sink.command = "create-shadow-app codemod";
  const parsed = parseCodemodArgs(rest);
  if (parsed.help) {
    if (json) sink.data = { usage: codemodHelp(style) };
    else ctx.stdout.write(codemodHelp(style));
    return 0;
  }

  const { files } = await runCodemod({
    name: parsed.name,
    targets: parsed.paths,
    cwd: ctx.cwd,
    write: parsed.write,
  });

  const tally = { changed: 0, unchanged: 0, skipped: 0, refused: 0, written: 0 };
  for (const file of files) {
    tally[file.status] += 1;
    if (file.written) tally.written += 1;
  }
  sink.data = {
    codemod: parsed.name,
    mode: parsed.write ? "write" : "dry-run",
    files: files.map((file) => ({
      file: file.file,
      status: file.status,
      ...(file.reason === undefined ? {} : { reason: file.reason }),
      written: file.written,
      ...(file.diff === undefined ? {} : { diff: file.diff }),
      reports: file.reports,
    })),
    summary: tally,
  };

  for (const file of files) {
    for (const report of file.reports) {
      const where = `${file.file}:${report.line}`;
      sink.warnings.push({
        code:
          report.level === "warning"
            ? "CREATE_SHADOW_APP_CODEMOD_UNSUPPORTED"
            : "CREATE_SHADOW_APP_CODEMOD_NOTE",
        message: `${where}: ${report.message}`,
      });
      ctx.stderr.write(
        `${report.level === "warning" ? style.yellow("warning") : style.dim("note")} ${where}: ${report.message}\n`,
      );
    }
    const skip = file.status === "skipped" ? skipMessage(file) : null;
    if (skip !== null) {
      sink.warnings.push({
        code: "CREATE_SHADOW_APP_CODEMOD_SKIPPED",
        message: `${file.file}: ${skip}`,
      });
      ctx.stderr.write(`${style.yellow("warning")} ${file.file}: ${skip}\n`);
    }
  }

  const refused = files.filter((file) => file.status === "refused");
  if (refused.length > 0) {
    const list = refused
      .map((file) =>
        file.reason === "missing"
          ? `${file.file} does not exist`
          : `${file.file} is outside the current directory`,
      )
      .join("; ");
    throw new RunFailure(
      `Nothing was changed: ${list}. Pass files or folders under the current directory.`,
      "CREATE_SHADOW_APP_CODEMOD_REFUSED",
    );
  }

  for (const file of files) {
    if (file.status !== "changed") continue;
    if (parsed.write) ctx.stdout.write(`${style.green("updated")} ${file.file}\n`);
    else ctx.stdout.write(file.diff ?? "");
  }
  const count = (n: number): string => `${n} ${n === 1 ? "file" : "files"}`;
  if (tally.changed === 0) {
    ctx.stdout.write(`${style.dim("Nothing to change.")}\n`);
  } else if (parsed.write) {
    ctx.stdout.write(`${style.green("Changed")} ${count(tally.changed)}.\n`);
  } else {
    ctx.stdout.write(
      `${count(tally.changed)} would change. ${style.dim("Run again with --write to apply.")}\n`,
    );
  }
  return 0;
}
