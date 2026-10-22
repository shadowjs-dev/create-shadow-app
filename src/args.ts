import { UsageError } from "./names";
import {
  ADAPTERS,
  ADDONS,
  type AdapterName,
  type AddonName,
  PACKAGE_MANAGERS,
  type PackageManager,
  TEMPLATES,
  type TemplateName,
} from "./options";

/** Command-line parsing: pure, no I/O, every mistake is a {@link UsageError}. */

/** The parsed command line. `undefined` means "not given": the prompts or defaults decide. @since 1.0.0 */
export interface ParsedArgs {
  directory: string | undefined;
  name: string | undefined;
  template: TemplateName | undefined;
  /** Add-ons switched on (`true`) or off (`false`) by flags. */
  addons: Partial<Record<AddonName | "router", boolean>>;
  yes: boolean;
  /** `false` after `--no-install`. */
  install: boolean | undefined;
  /** `false` after `--no-git`. */
  git: boolean | undefined;
  packageManager: PackageManager | undefined;
  /** `--adapter`: the deployment target of the `dusk` template. */
  adapter: AdapterName | undefined;
  force: boolean;
  dryRun: boolean;
  local: string | undefined;
  packRoot: string | undefined;
  allowOutside: boolean;
  /** `--json`: one JSON document on stdout instead of words; nothing is asked. */
  json: boolean;
  help: boolean;
  version: boolean;
}

const TOGGLES: readonly (AddonName | "router")[] = [...ADDONS.map((addon) => addon.name), "router"];

/** Options that take a value. */
const VALUED = new Set([
  "--template",
  "-t",
  "--name",
  "--pm",
  "--local",
  "--pack-root",
  "--adapter",
]);

/**
 * Parses `argv` (without the program name).
 *
 * Flags: `--template|-t <spa|dusk>`, `--name`, one `--x`/`--no-x` pair per add-on and for
 * `--router`, `--yes|-y`, `--no-install`, `--no-git`, `--pm`, `--force`, `--dry-run`, `--local`,
 * `--pack-root`, `--allow-outside`, `--json`, `--help|-h`, `--version|-v`. Values may be written
 * `--flag value` or `--flag=value`; `--` ends the options.
 *
 * @param argv The arguments.
 * @returns What was asked for.
 * @throws UsageError for an unknown option, a missing or invalid value, or a second directory.
 * @example
 * parseArgs(["my-app", "--template", "dusk", "--no-biome"]).template; // "dusk"
 * @since 1.0.0
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {
    directory: undefined,
    name: undefined,
    template: undefined,
    addons: {},
    yes: false,
    install: undefined,
    git: undefined,
    packageManager: undefined,
    adapter: undefined,
    force: false,
    dryRun: false,
    local: undefined,
    packRoot: undefined,
    allowOutside: false,
    json: false,
    help: false,
    version: false,
  };
  let optionsEnded = false;
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index] ?? "";
    if (optionsEnded || !raw.startsWith("-") || raw === "-") {
      positional(args, raw);
      continue;
    }
    if (raw === "--") {
      optionsEnded = true;
      continue;
    }
    const equals = raw.startsWith("--") ? raw.indexOf("=") : -1;
    const flag = equals === -1 ? raw : raw.slice(0, equals);
    let value: string | undefined = equals === -1 ? undefined : raw.slice(equals + 1);
    if (VALUED.has(flag)) {
      if (value === undefined) {
        value = argv[index + 1];
        index += 1;
      }
      if (value === undefined || value === "" || (value.startsWith("-") && equals === -1)) {
        throw new UsageError(`${flag} needs a value.`);
      }
      setValued(args, flag, value);
      continue;
    }
    if (value !== undefined) throw new UsageError(`${flag} does not take a value.`);
    setSwitch(args, flag);
  }
  return args;
}

function positional(args: ParsedArgs, value: string): void {
  if (args.directory !== undefined) throw new UsageError(`Unexpected argument "${value}".`);
  args.directory = value;
}

function setValued(args: ParsedArgs, flag: string, value: string): void {
  switch (flag) {
    case "--template":
    case "-t": {
      const template = TEMPLATES.find((candidate) => candidate === value);
      if (template === undefined) {
        throw new UsageError(
          `Unknown template "${value}". Choose one of: ${TEMPLATES.join(", ")}.`,
        );
      }
      args.template = template;
      return;
    }
    case "--pm": {
      const manager = PACKAGE_MANAGERS.find((candidate) => candidate === value);
      if (manager === undefined) {
        throw new UsageError(
          `Unknown package manager "${value}". Choose one of: ${PACKAGE_MANAGERS.join(", ")}.`,
        );
      }
      args.packageManager = manager;
      return;
    }
    case "--adapter": {
      const adapter = ADAPTERS.find((candidate) => candidate === value);
      if (adapter === undefined) {
        throw new UsageError(`Unknown adapter "${value}". Choose one of: ${ADAPTERS.join(", ")}.`);
      }
      args.adapter = adapter;
      return;
    }
    case "--name":
      args.name = value;
      return;
    case "--local":
      args.local = value;
      return;
    case "--pack-root":
      args.packRoot = value;
      return;
    default:
      throw new UsageError(`Unknown option ${flag}.`, "CREATE_SHADOW_APP_UNKNOWN_OPTION");
  }
}

function setSwitch(args: ParsedArgs, flag: string): void {
  switch (flag) {
    case "--yes":
    case "-y":
      args.yes = true;
      return;
    case "--no-install":
      args.install = false;
      return;
    case "--install":
      args.install = true;
      return;
    case "--no-git":
      args.git = false;
      return;
    case "--git":
      args.git = true;
      return;
    case "--force":
      args.force = true;
      return;
    case "--dry-run":
      args.dryRun = true;
      return;
    case "--allow-outside":
      args.allowOutside = true;
      return;
    case "--json":
      args.json = true;
      return;
    case "--help":
    case "-h":
      args.help = true;
      return;
    case "--version":
    case "-v":
      args.version = true;
      return;
    default:
      break;
  }
  const negated = flag.startsWith("--no-");
  const name = flag.slice(negated ? 5 : 2);
  const toggle = TOGGLES.find((candidate) => candidate === name);
  if (toggle === undefined || !flag.startsWith("--")) {
    throw new UsageError(
      `Unknown option ${flag}. Run with --help to see the options.`,
      "CREATE_SHADOW_APP_UNKNOWN_OPTION",
    );
  }
  args.addons[toggle] = !negated;
}

/**
 * Checks combinations that make no sense.
 *
 * @param args Parsed arguments.
 * @param interactive True on a terminal that will ask the questions: an `--adapter` without a
 *   template is then allowed, because the template question comes next.
 * @throws UsageError for contradictory flags.
 * @example
 * checkArgs(parseArgs(["app", "--template", "spa", "--adapter", "node"])); // throws UsageError
 * @since 1.0.0
 */
export function checkArgs(args: ParsedArgs, interactive = false): void {
  if (args.local !== undefined && args.packRoot !== undefined) {
    throw new UsageError("Use either --local <packDir> or --pack-root <repo>, not both.");
  }
  if (args.template === "dusk" && args.addons.router === false) {
    throw new UsageError("The dusk template always routes; --no-router only applies to spa.");
  }
  if (args.addons.ui === true && args.addons.tailwind === false) {
    throw new UsageError("--ui needs Tailwind: drop --no-tailwind, or drop --ui.");
  }
  const templateMissing = args.template === undefined && interactive;
  if (args.adapter !== undefined && args.template !== "dusk" && !templateMissing) {
    throw new UsageError("--adapter applies to the dusk template only; add --template dusk.");
  }
}
