/**
 * The machine-readable output of `create-shadow-app`. With `--json`, the command prints one document on stdout and nothing
 * else there; the words a person would read go to stderr, and nothing is asked.
 *
 * ```json
 * { "schema": 1, "command": "create-shadow-app", "ok": true, "data": {}, "warnings": [] }
 * ```
 *
 * `ok` is true exactly when the exit code is 0; a failure adds `error: { code, message }` and may still carry `data`.
 * The same contract (schema 1) is printed by `dusk` and `shadow-ui`; each package has its own copy of this small module,
 * so the commands share no code at runtime.
 */

/**
 * The version of the document. A change to the meaning of a key raises it.
 * @since 1.0.0
 */
export const JSON_SCHEMA = 1;

/** A warning in the document: a stable code and a sentence. @since 1.0.0 */
export interface JsonWarning {
  /** A stable SCREAMING_SNAKE code with the `CREATE_SHADOW_APP_` prefix. */
  readonly code: string;
  readonly message: string;
}

/** The failure in the document: a stable code and a sentence a person can act on. @since 1.0.0 */
export interface JsonError {
  /** A stable SCREAMING_SNAKE code with the `CREATE_SHADOW_APP_` prefix. */
  readonly code: string;
  readonly message: string;
}

/** What every `--json` run prints. @since 1.0.0 */
export interface JsonDocument {
  readonly schema: typeof JSON_SCHEMA;
  /** The command that ran: `create-shadow-app`, or `create-shadow-app completion`. */
  readonly command: string;
  /** True exactly when the exit code is 0. */
  readonly ok: boolean;
  /** The facts of the command. `{}` when it has none, and what is known when the command failed. */
  readonly data: Readonly<Record<string, unknown>>;
  readonly warnings: readonly JsonWarning[];
  /** Only when `ok` is false. */
  readonly error?: JsonError;
}

/**
 * The error codes and warning codes of the command, for the documentation and the tests. The `CODEMOD_UNSUPPORTED`,
 * `CODEMOD_NOTE` and `CODEMOD_SKIPPED` codes appear in `warnings`, never in `error`.
 * @since 1.0.0
 */
export const ERROR_CODES = [
  "CREATE_SHADOW_APP_UNKNOWN_OPTION",
  "CREATE_SHADOW_APP_INVALID_OPTION",
  "CREATE_SHADOW_APP_MISSING_DIRECTORY",
  "CREATE_SHADOW_APP_INVALID_DIRECTORY",
  "CREATE_SHADOW_APP_INVALID_NAME",
  "CREATE_SHADOW_APP_INVALID_SHELL",
  "CREATE_SHADOW_APP_DIRECTORY_NOT_EMPTY",
  "CREATE_SHADOW_APP_LOCAL_PACK",
  "CREATE_SHADOW_APP_WRITE_FAILED",
  "CREATE_SHADOW_APP_INSTALL_FAILED",
  "CREATE_SHADOW_APP_CANCELED",
  "CREATE_SHADOW_APP_FAILED",
  "CREATE_SHADOW_APP_UNEXPECTED",
  "CREATE_SHADOW_APP_UNKNOWN_CODEMOD",
  "CREATE_SHADOW_APP_CODEMOD_REFUSED",
  "CREATE_SHADOW_APP_CODEMOD_UNSUPPORTED",
  "CREATE_SHADOW_APP_CODEMOD_NOTE",
  "CREATE_SHADOW_APP_CODEMOD_SKIPPED",
] as const;

/**
 * A failure of the work (not of the command line) that carries its code for `--json`. The message is printed as it is.
 *
 * @example
 * new RunFailure("/tmp/app is not empty.", "CREATE_SHADOW_APP_DIRECTORY_NOT_EMPTY").code;
 * @since 1.0.0
 */
export class RunFailure extends Error {
  /** The stable code `--json` prints. */
  readonly code: string;

  /**
   * @param message What went wrong and what to do about it.
   * @param code The stable code of the failure. Defaults to `CREATE_SHADOW_APP_FAILED`.
   */
  constructor(message: string, code = "CREATE_SHADOW_APP_FAILED") {
    super(message);
    this.name = "RunFailure";
    this.code = code;
  }
}

/**
 * A successful document.
 * @param command The command that ran.
 * @param data The facts of the command.
 * @param warnings The warnings; none by default.
 * @returns The document.
 * @example
 * jsonSuccess("create-shadow-app", { name: "app" }).ok; // true
 * @since 1.0.0
 */
export function jsonSuccess(
  command: string,
  data: Readonly<Record<string, unknown>>,
  warnings: readonly JsonWarning[] = [],
): JsonDocument {
  return { schema: JSON_SCHEMA, command, ok: true, data, warnings };
}

/**
 * A failed document.
 * @param command The command that ran.
 * @param error The code and the message.
 * @param data What is known despite the failure.
 * @param warnings The warnings raised before it.
 * @returns The document, with `ok: false`.
 * @example
 * jsonFailure("create-shadow-app", { code: "CREATE_SHADOW_APP_FAILED", message: "no" }).ok; // false
 * @since 1.0.0
 */
export function jsonFailure(
  command: string,
  error: JsonError,
  data: Readonly<Record<string, unknown>> = {},
  warnings: readonly JsonWarning[] = [],
): JsonDocument {
  return { schema: JSON_SCHEMA, command, ok: false, data, warnings, error };
}

/**
 * The text to write for a document: indented, ending with a newline.
 * @param document The document.
 * @returns The text.
 * @since 1.0.0
 */
export function jsonText(document: JsonDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Whether the command line asks for JSON: `--json` anywhere before a `--`. Read before the line is parsed, so a refused
 * command line is answered in JSON too.
 * @param argv The arguments after `create-shadow-app`.
 * @returns True for `--json`.
 * @example
 * wantsJson(["my-app", "--json"]); // true
 * @since 1.0.0
 */
export function wantsJson(argv: readonly string[]): boolean {
  for (const arg of argv) {
    if (arg === "--") return false;
    if (arg === "--json") return true;
  }
  return false;
}

/**
 * Prints an uncaught exception or a rejected promise as a JSON failure, then exits 1. Installed by the bin when the
 * command line asks for JSON, so a crash is no exception to "stdout carries one document". A reader that went away
 * (`| head -n 1` closed the pipe) is not a crash: the process exits quietly.
 * @param command The command the document names.
 * @since 1.0.0
 */
export function installCrashHandlers(command: string): void {
  let crashed = false;
  const crash = (error: unknown): void => {
    if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "EPIPE") {
      process.exit(0);
    }
    // The document itself may fail to write (the pipe closed meanwhile); one attempt is all there is.
    if (crashed) process.exit(1);
    crashed = true;
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.stack !== undefined) {
      process.stderr.write(`${error.stack}\n`);
    }
    const document = jsonFailure(command, {
      code: "CREATE_SHADOW_APP_UNEXPECTED",
      message: `unexpected error: ${message}`,
    });
    process.stdout.write(jsonText(document), () => process.exit(1));
  };
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
}
