/** Terminal colors that respect `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb` and non-terminal output. */

/** Wraps text in styles; every function returns the text unchanged when colors are off. @since 1.0.0 */
export interface Style {
  readonly enabled: boolean;
  bold(text: string): string;
  dim(text: string): string;
  red(text: string): string;
  green(text: string): string;
  yellow(text: string): string;
  cyan(text: string): string;
}

/**
 * Decides whether to color output: `NO_COLOR` (any non-empty value) turns it off, `FORCE_COLOR`
 * (anything but `0` or empty) turns it on, otherwise it is on for a terminal that is not `dumb`.
 *
 * @param env The environment variables.
 * @param isTTY Whether the output stream is a terminal.
 * @returns Whether to emit ANSI color codes.
 * @example
 * supportsColor({ NO_COLOR: "1" }, true); // false
 * @since 1.0.0
 */
export function supportsColor(
  env: Readonly<Record<string, string | undefined>>,
  isTTY: boolean,
): boolean {
  const noColor = env["NO_COLOR"];
  if (noColor !== undefined && noColor !== "") return false;
  const force = env["FORCE_COLOR"];
  if (force !== undefined && force !== "") return force !== "0" && force !== "false";
  return isTTY && env["TERM"] !== "dumb";
}

/**
 * Creates the styling functions.
 *
 * @param enabled Whether to emit color codes ({@link supportsColor}).
 * @returns Styling functions.
 * @example
 * createStyle(false).green("ok"); // "ok"
 * @since 1.0.0
 */
export function createStyle(enabled: boolean): Style {
  const wrap =
    (open: number, close: number) =>
    (text: string): string =>
      enabled ? `\u001b[${open}m${text}\u001b[${close}m` : text;
  return {
    enabled,
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39),
  };
}
