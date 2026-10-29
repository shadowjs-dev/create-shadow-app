import { type StdioOptions, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { checkArgs, type ParsedArgs, parseArgs } from "./args";
import { completionScript, isCompletionShell, SHELL_CHOICES } from "./completion";
import {
  type JsonError,
  type JsonWarning,
  jsonFailure,
  jsonSuccess,
  jsonText,
  RunFailure,
  wantsJson,
} from "./json";
import { parseManifest } from "./local";
import {
  candidateName,
  packageNameProblem,
  resolveTarget,
  toPackageName,
  UsageError,
} from "./names";
import {
  ADDONS,
  type AdapterName,
  type AddonName,
  addonsFor,
  enabledAddons,
  isDuskBased,
  type LocalPack,
  type PackageManager,
  resolveOptions,
  type ScaffoldOptions,
  TEMPLATE_INFO,
  type TemplateName,
} from "./options";
import { detectPackageManager, installInvocation } from "./pm";
import { buildProject, type Project } from "./project";
import { CancelError, createPrompter, type PromptInput, type PromptOutput } from "./prompts";
import { createStyle, type Style, supportsColor } from "./style";
import { runScript } from "./templates/shared";
import { inspectTarget, writeProject } from "./writer";

/**
 * The command line: parses the arguments, asks what is missing (on a terminal), builds the
 * project in memory and only then touches the disk. Everything the outside world provides (streams,
 * environment, child processes) arrives through {@link RunContext}, so the whole flow is tested
 * with fakes and a temporary directory.
 */

/**
 * Exit code: success.
 * @since 1.0.0
 */
export const EXIT_OK = 0;
/**
 * Exit code: the work failed (non-empty directory, install failed, pack directory incomplete).
 * @since 1.0.0
 */
export const EXIT_FAILURE = 1;
/**
 * Exit code: the command line was wrong.
 * @since 1.0.0
 */
export const EXIT_USAGE = 2;
/**
 * Exit code: the user canceled with Ctrl-C (128 + SIGINT).
 * @since 1.0.0
 */
export const EXIT_CANCELED = 130;
/**
 * Exit code: the process was terminated (128 + SIGTERM).
 * @since 1.0.0
 */
export const EXIT_TERMINATED = 143;

/** The signals a run listens for: cleanup first, then the matching exit code. @since 1.0.0 */
export type CancelSignal = "SIGINT" | "SIGTERM";

/** What happened when a program was run. @since 1.0.0 */
export interface RunOutcome {
  /** Exit status; `null` when the program could not start or was stopped by a signal. */
  readonly status: number | null;
  /** The signal that stopped the program, if one did. */
  readonly signal?: NodeJS.Signals | null;
  readonly stdout: string;
}

/**
 * Runs child processes; faked in tests. `signal` stops the child when it is aborted: the run is
 * canceled and the half-written project is removed. `inherit` gives the child this process's
 * streams (`true`), or sends its output to stderr (`"stderr"`, for a `--json` run: stdout is the
 * document), or captures what it prints (`false`).
 * @since 1.0.0
 */
export interface Runner {
  run(
    command: string,
    args: readonly string[],
    cwd: string,
    inherit: boolean | "stderr",
    signal?: AbortSignal,
  ): Promise<RunOutcome>;
}

/** Where the process signals come from; `process` in the command line, a fake in tests. @since 1.0.0 */
export interface SignalSource {
  on(name: CancelSignal, listener: () => void): unknown;
  off(name: CancelSignal, listener: () => void): unknown;
}

/** Everything the command needs from the outside world. @since 1.0.0 */
export interface RunContext {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdin: PromptInput & { readonly isTTY?: boolean | undefined };
  readonly stdout: PromptOutput & { readonly isTTY?: boolean | undefined };
  readonly stderr: PromptOutput;
  readonly runner: Runner;
  /** Listens for SIGINT and SIGTERM while a command runs. Without it, a signal is not caught. */
  readonly signals?: SignalSource | undefined;
  /** Version printed by `--version`. */
  readonly version: string;
}

/**
 * The runner that spawns real processes. A stopped child reports its signal; a program that does
 * not exist reports no status and no signal.
 *
 * @since 1.0.0
 */
export const processRunner: Runner = {
  run(command, args, cwd, inherit, signal) {
    return new Promise<RunOutcome>((resolvePromise) => {
      let stdout = "";
      const stdio: StdioOptions =
        inherit === "stderr"
          ? ["inherit", 2, 2]
          : inherit
            ? "inherit"
            : ["ignore", "pipe", "ignore"];
      const child = spawn(command, [...args], {
        cwd,
        stdio,
        // Package manager shims are .cmd files on Windows; the arguments here are fixed words.
        shell: process.platform === "win32",
        signal,
      });
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
      });
      // A program that does not exist reports `error` (and no `close` with a status).
      child.once("error", () => resolvePromise({ status: null, signal: null, stdout }));
      child.once("close", (status, stopped) => resolvePromise({ status, signal: stopped, stdout }));
    });
  },
};

const HELP = (style: Style): string => `${style.bold("create-shadow-app")} - scaffold a ShadowJS app

${style.bold("Usage")}
  npm create shadow-app@latest [directory] [options]
  create-shadow-app [directory] [options]
  create-shadow-app completion <shell>   print a bash, zsh or fish completion script
  create-shadow-app codemod <name> [paths]   migrate React, Solid or Next.js code to ShadowJS

${style.bold("Template")}
  -t, --template <name>      spa (Vite SPA), dusk (full stack), content, dashboard or api  [default: spa]
      --adapter <name>       dusk only: node, bun, deno, cloudflare, vercel, netlify, tarout or static
                             (the deployment target; default: the Node server, run by dusk start)
      --name <package>       npm package name  [default: derived from the directory]

${style.bold("Add-ons")} (each: --x to add, --no-x to leave out)
  --tailwind                 Tailwind CSS 4 (@tailwindcss/vite)
  --biome                    Biome lint and format  [default: on]
  --vitest                   Vitest, happy-dom, @shadow-js/testing, an example test
  --convex                   Convex: provider, schema, sample functions
  --clerk                    Clerk: provider, sign-in/up, a protected page
  --ui                       shadow-ui scaffolding (components.json, cn(), theme); adds Tailwind
  --eslint                   @shadow-js/eslint-plugin flat config (dusk config for Dusk apps)
  --devtools                 the reactive-graph inspector, in development only
  --router                   spa only: client-side routing (Clerk and Convex imply it)

${style.bold("Behavior")}
  -y, --yes                  accept the defaults, ask nothing
      --no-install           do not install dependencies
      --no-git               do not run git init
      --pm <name>            npm, pnpm, yarn or bun  [default: the one that ran this, else npm]
      --force                write into a directory that is not empty (overwrites files of the same name)
      --dry-run              show what would be written; write nothing
      --allow-outside        permit a directory outside the current one
      --json                 print one JSON document on stdout instead of words; nothing is asked
  -h, --help                 show this help
  -v, --version              show the version

${style.bold("Before ShadowJS is published")}
      --local <packDir>      use the tarballs in <packDir> (written by \`npm run pack:local\`)
      --pack-root <repo>     same, with <repo>/.pack

${style.bold("Exit codes")}  0 done, 1 failed, 2 wrong arguments, 130 canceled (Ctrl-C), 143 terminated (SIGTERM)

${style.bold("Examples")}
  npm create shadow-app@latest my-app
  npm create shadow-app@latest my-app -- --template dusk --tailwind --vitest
  node dist/cli.js my-app --template dusk --local /path/to/shadowjs/.pack
`;

function addonOptions(
  selected: ReadonlySet<string>,
): Partial<Record<AddonName | "router", boolean>> {
  const out: Partial<Record<AddonName | "router", boolean>> = {};
  for (const addon of ADDONS) out[addon.name] = selected.has(addon.name);
  out.router = selected.has("router");
  return out;
}

/** The directory as the user should type it after `cd`. */
function displayPath(cwd: string, target: string): string {
  const away = relative(cwd, target);
  const shown = away === "" ? "." : away.startsWith("..") || isAbsolute(away) ? target : away;
  return /\s/.test(shown) ? JSON.stringify(shown) : shown;
}

/**
 * Runs `work`, and gives a plain `Error` it throws the code of the step (the message stays as it is). A refusal of the
 * command line, a cancellation and a {@link RunFailure} pass through.
 */
function guard<T>(code: string, work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof Error && error.constructor === Error) {
      throw new RunFailure(error.message, code);
    }
    throw error;
  }
}

function readLocalPack(ctx: RunContext, args: ParsedArgs, target: string): LocalPack | undefined {
  const given =
    args.local ?? (args.packRoot === undefined ? undefined : join(args.packRoot, ".pack"));
  if (given === undefined) return undefined;
  const directory = resolve(ctx.cwd, given);
  const file = join(directory, "manifest.json");
  const failure = (message: string): RunFailure =>
    new RunFailure(message, "CREATE_SHADOW_APP_LOCAL_PACK");
  if (!existsSync(file)) {
    throw failure(
      `${file} not found. Run \`npm run pack:local\` in the ShadowJS repository first${
        args.packRoot === undefined ? "" : `, or check --pack-root ${args.packRoot}`
      }.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw failure(`${file} is not valid JSON (${error instanceof Error ? error.message : "?"}).`);
  }
  const manifest = guard("CREATE_SHADOW_APP_LOCAL_PACK", () => parseManifest(parsed, file));
  for (const entry of manifest.packages) {
    if (!existsSync(entry.tarball)) {
      throw failure(
        `${entry.tarball} does not exist. Run \`npm run pack:local\` again; the pack directory is out of date.`,
      );
    }
  }
  return { manifest, from: target };
}

interface Choices {
  readonly directory: string;
  readonly template: TemplateName;
  readonly adapter?: AdapterName | undefined;
  readonly addons: ReadonlySet<string>;
  readonly install: boolean;
}

/**
 * The package name a directory gives, or why it cannot. The explicit `--name` wins and is checked
 * on its own; otherwise the name is the folder's last segment.
 */
function nameOf(
  explicit: string | undefined,
  target: string,
): { name: string } | { problem: string } {
  if (explicit !== undefined) {
    const problem = packageNameProblem(explicit);
    return problem === undefined ? { name: explicit } : { problem };
  }
  const derived = toPackageName(target);
  if (derived !== undefined) return { name: derived };
  const candidate = candidateName(target);
  if (candidate === "") {
    return {
      problem: `Cannot derive a package name from "${target}": use letters, digits, - and _, or pass --name <package>.`,
    };
  }
  return { problem: `${packageNameProblem(candidate) ?? ""} Or pass --name <package>.`.trim() };
}

async function ask(
  ctx: RunContext,
  args: ParsedArgs,
  style: Style,
  signal: AbortSignal,
): Promise<Choices> {
  const prompter = createPrompter(ctx.stdin, ctx.stdout, style, signal);
  const directory =
    args.directory ??
    (await prompter.text("Project name", {
      initial: "shadow-app",
      validate: (value) => {
        try {
          const found = nameOf(undefined, resolveTarget(ctx.cwd, value, args.allowOutside));
          return "problem" in found ? found.problem : undefined;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
    }));
  const template =
    args.template ??
    (await prompter.select<TemplateName>(
      "Template",
      TEMPLATE_INFO.map((info) => ({ value: info.name, label: info.name, hint: info.hint })),
      "spa",
    ));
  if (args.adapter !== undefined && template !== "dusk") {
    throw new UsageError("--adapter applies to the dusk template only; add --template dusk.");
  }
  const preset = new Set<string>(
    ADDONS.filter((addon) => addon.defaultOn).map((addon) => addon.name),
  );
  for (const [name, on] of Object.entries(args.addons)) {
    if (on === true) preset.add(name);
    else preset.delete(name);
  }
  const choices = [
    ...addonsFor(template).map((addon) => ({
      value: addon.name as string,
      label: addon.label,
      hint: addon.hint,
    })),
    ...(template === "spa"
      ? [{ value: "router", label: "Router", hint: "client-side routing with @shadow-js/router" }]
      : []),
  ];
  const picked = new Set(await prompter.multiselect("Add-ons", choices, [...preset]));
  // A flag on the command line beats the answer.
  for (const [name, on] of Object.entries(args.addons)) {
    if (on === true) picked.add(name);
    else picked.delete(name);
  }
  const install = args.install ?? (await prompter.confirm("Install dependencies now?", true));
  return { directory, template, adapter: args.adapter, addons: picked, install };
}

function defaults(args: ParsedArgs): Choices {
  if (args.directory === undefined) {
    throw new UsageError(
      "Missing project directory. Run: create-shadow-app my-app",
      "CREATE_SHADOW_APP_MISSING_DIRECTORY",
    );
  }
  const addons = new Set<string>(
    ADDONS.filter((addon) => addon.defaultOn).map((addon) => addon.name),
  );
  for (const [name, on] of Object.entries(args.addons)) {
    if (on === true) addons.add(name);
    else addons.delete(name);
  }
  return {
    directory: args.directory,
    template: args.template ?? "spa",
    addons,
    install: args.install ?? true,
    adapter: args.adapter,
  };
}

function describePlan(project: Project, target: string, style: Style): string {
  const { options } = project;
  const extras: string[] = enabledAddons(options);
  if (options.router && options.template === "spa") extras.push("router");
  const files = [...project.files.keys()].sort();
  const lines = [
    `${style.bold("Dry run")}: nothing is written.`,
    `Would create ${target}`,
    `  template: ${options.template}`,
    `  add-ons: ${extras.length === 0 ? "none" : extras.join(", ")}`,
    `  package manager: ${options.packageManager}`,
    `  ShadowJS packages: ${options.local === undefined ? "from the registry" : `from ${options.local.manifest.packages.length} local tarballs`}`,
    "",
    `${files.length} files:`,
    ...files.map((file) => `  ${file}`),
    "",
    "Dependencies:",
  ];
  const manifest: unknown = JSON.parse(project.files.get("package.json") ?? "{}");
  for (const section of ["dependencies", "devDependencies"] as const) {
    const group: unknown =
      typeof manifest === "object" && manifest !== null
        ? Reflect.get(manifest, section)
        : undefined;
    if (typeof group !== "object" || group === null) continue;
    lines.push(`  ${section}:`);
    for (const [name, range] of Object.entries(group)) lines.push(`    ${name} ${String(range)}`);
  }
  return `${lines.join("\n")}\n`;
}

/** The commands to type after the scaffold: `cd`, the install when it did not run, `dev`, and the template's own steps. */
function stepList(project: Project, cwd: string, target: string, installed: boolean): string[] {
  const steps: string[] = [];
  const shown = displayPath(cwd, target);
  if (shown !== ".") steps.push(`cd ${shown}`);
  if (!installed) steps.push(...project.installCommands);
  steps.push(runScript(project.options.packageManager, "dev"), ...project.steps);
  return steps;
}

function nextSteps(
  project: Project,
  cwd: string,
  target: string,
  installed: boolean,
  style: Style,
): string {
  const { options } = project;
  const pm = options.packageManager;
  const steps = stepList(project, cwd, target, installed);
  const lines = [style.bold("Next steps"), ...steps.map((step) => `  ${step}`)];
  if (isDuskBased(options.template)) {
    lines.push("", `Production: ${runScript(pm, "build")}, then ${runScript(pm, "start")}`);
  }
  if (options.local !== undefined) {
    lines.push(
      "",
      `ShadowJS comes from local tarballs. After you rebuild ShadowJS, run \`npm run pack:local\` in its repository and install again here.`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** How the git step ended, as `--json` names it. */
type GitStatus = "initialized" | "existing-repository" | "git-missing" | "failed" | "disabled";

/** What a run learned, for the JSON document: the facts, the warnings, and the failure that ended it. */
interface Outcome {
  /** The command the document names. */
  command: string;
  data: Record<string, unknown>;
  readonly warnings: JsonWarning[];
  /** The failure of a run that ended without throwing (a failed install). */
  failure?: JsonError;
}

/** The facts of a scaffold (or of a dry run), for the JSON document. */
function scaffoldData(
  project: Project,
  target: string,
  files: readonly string[],
  state: {
    readonly dryRun: boolean;
    readonly installed: boolean;
    readonly git: GitStatus;
    readonly steps: readonly string[];
  },
): Record<string, unknown> {
  const { options } = project;
  const addons: string[] = enabledAddons(options);
  if (options.router && options.template === "spa") addons.push("router");
  const manifest: unknown = JSON.parse(project.files.get("package.json") ?? "{}");
  const group = (section: string): unknown =>
    typeof manifest === "object" && manifest !== null ? Reflect.get(manifest, section) : undefined;
  return {
    name: options.name,
    directory: target,
    template: options.template,
    adapter: options.adapter ?? null,
    addons,
    packageManager: options.packageManager,
    local: options.local !== undefined,
    dryRun: state.dryRun,
    files: [...files].sort(),
    dependencies: group("dependencies") ?? {},
    devDependencies: group("devDependencies") ?? {},
    installed: state.installed,
    git: state.git,
    nextSteps: state.steps,
  };
}

/** Where a run got to, so a cancellation knows what to take back. */
interface Progress {
  /** The project folder, once the run may write into it. */
  target?: string;
  /** What the folder held before the run wrote into it. */
  before?: Snapshot;
}

/** The entries of the target before the write: a missing folder, or the names that were there. */
interface Snapshot {
  readonly existed: boolean;
  readonly names: ReadonlySet<string>;
}

function snapshotOf(target: string): Snapshot {
  if (inspectTarget(target) === "missing") return { existed: false, names: new Set() };
  return { existed: true, names: new Set(readdirSync(target)) };
}

/**
 * Takes back what the run created: the whole folder when it was missing, otherwise the entries that
 * were not there before. Entries that existed (and were overwritten by `--force`) stay as they are.
 *
 * @returns The paths removed.
 */
function removeLeftovers(target: string, before: Snapshot): string[] {
  if (!before.existed) {
    rmSync(target, { recursive: true, force: true });
    return [target];
  }
  const removed: string[] = [];
  for (const name of readdirSync(target)) {
    if (before.names.has(name)) continue;
    const path = join(target, name);
    rmSync(path, { recursive: true, force: true });
    removed.push(path);
  }
  return removed;
}

/** Throws a {@link CancelError} when the run was aborted, or when a child was stopped by a signal. */
function throwIfCanceled(signal: AbortSignal, stopped?: NodeJS.Signals | null): void {
  // The abort reason is the signal the user sent; a child stopped because of it reports the same
  // or SIGTERM, which must not change the answer.
  if (signal.aborted) throw new CancelError(signal.reason === "SIGTERM" ? "SIGTERM" : "SIGINT");
  if (stopped === "SIGINT" || stopped === "SIGTERM") throw new CancelError(stopped);
}

/**
 * Reports a cancellation, takes back what the run created, and returns the exit code.
 */
function reportCancel(
  ctx: RunContext,
  style: Style,
  error: CancelError,
  progress: Progress,
): number {
  const code = error.signal === "SIGTERM" ? EXIT_TERMINATED : EXIT_CANCELED;
  if (progress.target === undefined || progress.before === undefined) {
    ctx.stderr.write(`${style.yellow("Canceled.")}\n`);
    return code;
  }
  try {
    const removed = removeLeftovers(progress.target, progress.before);
    const note =
      removed.length === 0
        ? "Nothing was left behind."
        : progress.before.existed && progress.before.names.size > 0
          ? "Removed what this run created; files that were already there keep their new content."
          : "Removed what this run created.";
    ctx.stderr.write(`${style.yellow("Canceled.")} ${note}\n`);
  } catch (cleanupError) {
    const reason = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
    ctx.stderr.write(
      `${style.yellow("Canceled.")} Could not remove everything this run created in ${progress.target}: ${reason}\n`,
    );
  }
  return code;
}

/**
 * Connects the process signals to an abort controller for the length of one run.
 *
 * @returns A function that removes the listeners again.
 */
function watchSignals(source: SignalSource | undefined, control: AbortController): () => void {
  if (source === undefined) return () => undefined;
  const names: CancelSignal[] = ["SIGINT", "SIGTERM"];
  const listeners = names.map((name) => {
    const listener = (): void => control.abort(name);
    source.on(name, listener);
    return { name, listener };
  });
  return () => {
    for (const { name, listener } of listeners) source.off(name, listener);
  };
}

/**
 * Runs the command.
 *
 * SIGINT and SIGTERM (when `ctx.signals` delivers them) cancel the run: an open question is dropped,
 * a running install is stopped, and the files and folders this run created are removed. The exit
 * code is 130 for SIGINT and 143 for SIGTERM.
 *
 * @param argv The arguments without the program name.
 * @param ctx Streams, environment, working directory, the process runner and the signals.
 * @returns The exit code: 0 done, 1 failed, 2 wrong arguments, 130 or 143 canceled.
 * @example
 * const code = await run(["my-app", "--template", "dusk", "--yes"], context);
 * @since 1.0.0
 */
export async function run(argv: readonly string[], ctx: RunContext): Promise<number> {
  const json = wantsJson(argv);
  const style = createStyle(!json && supportsColor(ctx.env, ctx.stdout.isTTY === true));
  const control = new AbortController();
  const progress: Progress = {};
  const outcome: Outcome = { command: "create-shadow-app", data: {}, warnings: [] };
  // The words of a `--json` run go to stderr: stdout is for the document.
  const work: RunContext = json ? { ...ctx, stdout: ctx.stderr } : ctx;
  const unwatch = watchSignals(ctx.signals, control);
  let code: number;
  let failure: JsonError | undefined;
  try {
    code = await execute(argv, work, style, control.signal, progress, outcome);
    failure = outcome.failure;
  } catch (error) {
    if (error instanceof CancelError) {
      code = reportCancel(work, style, error, progress);
      failure = {
        code: "CREATE_SHADOW_APP_CANCELED",
        message: `canceled by ${error.signal === "SIGTERM" ? "SIGTERM" : "SIGINT"}.`,
      };
    } else {
      const message = error instanceof Error ? error.message : String(error);
      work.stderr.write(`${style.red("error")} ${message}\n`);
      if (error instanceof UsageError) {
        work.stderr.write(`${style.dim("Run create-shadow-app --help for the options.")}\n`);
        code = EXIT_USAGE;
        failure = { code: error.code, message };
      } else {
        code = EXIT_FAILURE;
        failure =
          error instanceof RunFailure
            ? { code: error.code, message }
            : { code: "CREATE_SHADOW_APP_UNEXPECTED", message: `unexpected error: ${message}` };
      }
    }
  } finally {
    unwatch();
  }
  if (json) {
    ctx.stdout.write(
      jsonText(
        code === EXIT_OK
          ? jsonSuccess(outcome.command, outcome.data, outcome.warnings)
          : jsonFailure(
              outcome.command,
              failure ?? { code: "CREATE_SHADOW_APP_FAILED", message: "the command failed." },
              outcome.data,
              outcome.warnings,
            ),
      ),
    );
  }
  return code;
}

/**
 * The arguments after `completion` when the command line is `create-shadow-app [--json] completion ...`, or undefined
 * when it is a project directory. Only the first word names the command: a directory called `completion` is `./completion`.
 */
function completionArguments(argv: readonly string[]): readonly string[] | undefined {
  return commandArguments(argv, "completion");
}

/** The arguments after the command `name`, or undefined when the first word is something else. */
function commandArguments(argv: readonly string[], name: string): readonly string[] | undefined {
  const first = argv.findIndex((arg) => arg !== "--json");
  return argv[first] === name ? [...argv.slice(0, first), ...argv.slice(first + 1)] : undefined;
}

/** `create-shadow-app completion <shell>`: prints the script (or `{ shell, script }` with `--json`). */
function runCompletion(
  rest: readonly string[],
  ctx: RunContext,
  style: Style,
  json: boolean,
  outcome: Outcome,
): number {
  outcome.command = "create-shadow-app completion";
  const operands: string[] = [];
  for (const arg of rest) {
    if (arg === "--json") continue;
    if (arg === "-h" || arg === "--help") {
      if (json) outcome.data = { usage: HELP(style) };
      else ctx.stdout.write(HELP(style));
      return EXIT_OK;
    }
    if (arg.startsWith("-")) {
      throw new UsageError(`Unknown option ${arg}.`, "CREATE_SHADOW_APP_UNKNOWN_OPTION");
    }
    operands.push(arg);
  }
  const invalid = (message: string): UsageError =>
    new UsageError(message, "CREATE_SHADOW_APP_INVALID_SHELL");
  const [shell, extra] = operands;
  if (shell === undefined) throw invalid(`Missing shell: expected ${SHELL_CHOICES}.`);
  if (extra !== undefined) {
    throw invalid(`Unexpected argument "${extra}": expected one shell (${SHELL_CHOICES}).`);
  }
  if (!isCompletionShell(shell)) {
    throw invalid(`Unknown shell "${shell}": expected ${SHELL_CHOICES}.`);
  }
  const script = completionScript(shell);
  if (json) outcome.data = { shell, script };
  else ctx.stdout.write(script);
  return EXIT_OK;
}

async function execute(
  argv: readonly string[],
  ctx: RunContext,
  style: Style,
  signal: AbortSignal,
  progress: Progress,
  outcome: Outcome,
): Promise<number> {
  const completion = completionArguments(argv);
  if (completion !== undefined)
    return runCompletion(completion, ctx, style, wantsJson(argv), outcome);
  const codemod = commandArguments(argv, "codemod");
  if (codemod !== undefined) {
    // Loaded here and nowhere else: scaffolding never reads the codemod code.
    const { runCodemodCommand } = await import("./codemod-command");
    return runCodemodCommand(codemod, ctx, style, wantsJson(argv), outcome);
  }
  const args = parseArgs(argv);
  if (args.help) {
    if (args.json) outcome.data = { usage: HELP(style) };
    else ctx.stdout.write(HELP(style));
    return EXIT_OK;
  }
  if (args.version) {
    if (args.json) outcome.data = { version: ctx.version };
    else ctx.stdout.write(`${ctx.version}\n`);
    return EXIT_OK;
  }
  // `--json` never asks: the answer must not depend on whether a person sits at the terminal.
  const interactive =
    !args.yes && !args.json && ctx.stdin.isTTY === true && ctx.stdout.isTTY === true;
  checkArgs(args, interactive);
  const choices = interactive ? await ask(ctx, args, style, signal) : defaults(args);
  if (choices.adapter !== undefined && choices.template !== "dusk") {
    throw new UsageError("--adapter applies to the dusk template only; add --template dusk.");
  }
  const target = resolveTarget(ctx.cwd, choices.directory, args.allowOutside);
  const named = nameOf(args.name, target);
  if ("problem" in named) {
    throw new UsageError(named.problem, "CREATE_SHADOW_APP_INVALID_NAME");
  }
  const name = named.name;
  const packageManager: PackageManager = detectPackageManager(
    args.packageManager,
    ctx.env,
    ctx.cwd,
  );
  const local = readLocalPack(ctx, args, target);
  const input: ScaffoldOptions = {
    name,
    template: choices.template,
    adapter: choices.adapter,
    ...addonOptions(choices.addons),
    packageManager,
    local,
  };
  // `resolveOptions` refuses combinations (a starter with an add-on it cannot take): that is a wrong
  // command line, exit 2, not an unexpected failure.
  try {
    resolveOptions(input);
  } catch (error) {
    if (error instanceof Error) throw new UsageError(error.message);
    throw error;
  }
  const project = buildProject(input);

  const state = guard("CREATE_SHADOW_APP_WRITE_FAILED", () => inspectTarget(target));
  if (state === "not-empty" && !args.force) {
    throw new RunFailure(
      `${target} is not empty. Choose another directory, or pass --force to write into it.`,
      "CREATE_SHADOW_APP_DIRECTORY_NOT_EMPTY",
    );
  }
  if (args.dryRun) {
    if (args.json) {
      outcome.data = scaffoldData(project, target, [...project.files.keys()], {
        dryRun: true,
        installed: false,
        git: "disabled",
        steps: stepList(project, ctx.cwd, target, false),
      });
    } else {
      ctx.stdout.write(describePlan(project, target, style));
    }
    return EXIT_OK;
  }

  progress.before = snapshotOf(target);
  progress.target = target;
  throwIfCanceled(signal);
  const written = guard("CREATE_SHADOW_APP_WRITE_FAILED", () =>
    writeProject(target, project.files, { force: args.force }),
  );
  ctx.stdout.write(
    `${style.green("Created")} ${name} in ${written.directory} ${style.dim(`(${written.files.length} files)`)}\n`,
  );
  const facts = (installed: boolean, git: GitStatus): Record<string, unknown> =>
    scaffoldData(project, written.directory, written.files, {
      dryRun: false,
      installed,
      git,
      steps: stepList(project, ctx.cwd, target, installed),
    });

  throwIfCanceled(signal);
  const git: GitStatus = args.git === false ? "disabled" : await initGit(ctx, target, style);
  outcome.data = facts(false, git);

  let installed = false;
  if (choices.install) {
    throwIfCanceled(signal);
    const { command, args: installArgs } = installInvocation(packageManager);
    ctx.stdout.write(`\n${style.dim(`${command} ${installArgs.join(" ")}`)}\n`);
    const outcomeOfInstall = await ctx.runner.run(
      command,
      installArgs,
      target,
      args.json ? "stderr" : true,
      signal,
    );
    throwIfCanceled(signal, outcomeOfInstall.signal);
    const again = `Install later with \`${command} install\` in ${displayPath(ctx.cwd, target)}.`;
    if (outcomeOfInstall.status === null) {
      const why =
        outcomeOfInstall.signal === undefined || outcomeOfInstall.signal === null
          ? `could not start \`${command}\`: is it installed and on your PATH?`
          : `\`${command} install\` was stopped by ${outcomeOfInstall.signal}.`;
      ctx.stderr.write(`${style.red("error")} ${why} The files are written. ${again}\n`);
      outcome.failure = {
        code: "CREATE_SHADOW_APP_INSTALL_FAILED",
        message: `${why} The files are written. ${again}`,
      };
      return EXIT_FAILURE;
    }
    if (outcomeOfInstall.status !== 0) {
      const message = `\`${command} install\` failed (exit ${outcomeOfInstall.status}). The files are written; fix the problem (offline? use --no-install and install when you are connected). ${again}`;
      ctx.stderr.write(`${style.red("error")} ${message}\n`);
      outcome.failure = { code: "CREATE_SHADOW_APP_INSTALL_FAILED", message };
      return EXIT_FAILURE;
    }
    installed = true;
    outcome.data = facts(true, git);
  }
  ctx.stdout.write(`\n${nextSteps(project, ctx.cwd, target, installed, style)}`);
  return EXIT_OK;
}

/** `git init` unless git is missing or the directory is already inside a work tree. Returns how the step ended. */
async function initGit(ctx: RunContext, target: string, style: Style): Promise<GitStatus> {
  const version = await ctx.runner.run("git", ["--version"], target, false);
  if (version.status !== 0) {
    ctx.stdout.write(`${style.dim("git was not found: skipped git init.")}\n`);
    return "git-missing";
  }
  const inside = await ctx.runner.run("git", ["rev-parse", "--is-inside-work-tree"], target, false);
  if (inside.status === 0 && inside.stdout.trim() === "true") {
    ctx.stdout.write(`${style.dim("Already inside a git repository: skipped git init.")}\n`);
    return "existing-repository";
  }
  const init = await ctx.runner.run("git", ["init", "-q"], target, false);
  ctx.stdout.write(
    init.status === 0
      ? `${style.dim("Initialized a git repository.")}\n`
      : `${style.yellow("warning")} git init failed; continuing without a repository.\n`,
  );
  return init.status === 0 ? "initialized" : "failed";
}
