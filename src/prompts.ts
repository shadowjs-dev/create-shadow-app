import { emitKeypressEvents } from "node:readline";
import type { Style } from "./style";

/**
 * Interactive questions without a dependency: a text field, a single choice, a multiple choice
 * (space toggles) and a yes/no. They need a terminal; the command line only calls them when both
 * stdin and stdout are TTYs. Output is plain ASCII plus cursor movement, nothing else.
 */

/** The part of a terminal input the prompts use: a readable stream that can switch to raw mode. @since 1.0.0 */
export interface PromptInput extends NodeJS.ReadableStream {
  readonly isTTY?: boolean | undefined;
  readonly isRaw?: boolean | undefined;
  setRawMode?(mode: boolean): unknown;
}

/** The part of a writable terminal stream the prompts use. @since 1.0.0 */
export interface PromptOutput {
  write(text: string): unknown;
}

/** What `readline` reports about a key press. @since 1.0.0 */
export interface KeyInfo {
  readonly name?: string | undefined;
  readonly ctrl?: boolean | undefined;
  readonly meta?: boolean | undefined;
}

/**
 * Thrown when the user presses Ctrl-C at a question (`SIGINT`), or the process receives a termination
 * signal while one is open (`SIGTERM`). The command line exits with 130 or 143.
 * @since 1.0.0
 */
export class CancelError extends Error {
  /** Which signal ended the question. */
  readonly signal: "SIGINT" | "SIGTERM";

  constructor(signal: "SIGINT" | "SIGTERM" = "SIGINT") {
    super("Canceled.");
    this.name = "CancelError";
    this.signal = signal;
  }
}

/** One option of a choice prompt. @since 1.0.0 */
export interface Choice<T> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string | undefined;
}

/** The questions. @since 1.0.0 */
export interface Prompter {
  text(
    message: string,
    options?: { initial?: string; validate?: (value: string) => string | undefined },
  ): Promise<string>;
  select<T>(message: string, choices: readonly Choice<T>[], initial?: T): Promise<T>;
  multiselect<T>(
    message: string,
    choices: readonly Choice<T>[],
    initial: readonly T[],
  ): Promise<T[]>;
  confirm(message: string, initial: boolean): Promise<boolean>;
}

/** The outcome of a key press: keep going (`undefined`) or finish with a value. */
interface Done<T> {
  readonly value: T;
  /** The one-line answer shown after the prompt. */
  readonly summary: string;
}

/**
 * Creates the prompts on a pair of streams.
 *
 * @param input A TTY input (or a stand-in with the same methods).
 * @param output Where the questions are drawn.
 * @param style Colors.
 * @param signal Aborted by a termination signal: the open question is then dropped, the terminal
 *   is given back, and the question rejects with a {@link CancelError}.
 * @returns The question functions.
 * @since 1.0.0
 */
export function createPrompter(
  input: PromptInput,
  output: PromptOutput,
  style: Style,
  signal?: AbortSignal,
): Prompter {
  emitKeypressEvents(input);

  /** Runs one question: draws it, feeds it key presses, redraws, and resolves with its answer. */
  function interact<T>(
    draw: () => string,
    onKey: (text: string, key: KeyInfo) => Done<T> | undefined,
    message: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wasRaw = input.isRaw === true;
      let drawn = 0;
      const paint = (text: string): void => {
        if (drawn > 0) output.write(`\u001b[${drawn}A`);
        output.write(`\r\u001b[0J${text}`);
        drawn = text.split("\n").length - 1;
      };
      const stop = (): void => {
        input.off("keypress", handler);
        signal?.removeEventListener("abort", onAbort);
        input.setRawMode?.(wasRaw);
        input.pause();
      };
      const onAbort = (): void => {
        stop();
        output.write("\n");
        reject(new CancelError(signal?.reason === "SIGTERM" ? "SIGTERM" : "SIGINT"));
      };
      const handler = (text: string | undefined, key: KeyInfo | undefined): void => {
        const info = key ?? {};
        if (info.ctrl === true && info.name === "c") {
          stop();
          output.write("\n");
          reject(new CancelError());
          return;
        }
        const done = onKey(text ?? "", info);
        if (done === undefined) {
          paint(draw());
          return;
        }
        stop();
        paint(`${style.green("v")} ${style.bold(message)} ${style.dim(done.summary)}\n`);
        resolve(done.value);
      };
      if (signal?.aborted === true) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      input.setRawMode?.(true);
      input.resume();
      input.on("keypress", handler);
      paint(draw());
    });
  }

  const hasControlCharacter = (text: string): boolean =>
    [...text].some((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127;
    });

  const printable = (text: string, key: KeyInfo): boolean =>
    text.length > 0 && key.ctrl !== true && key.meta !== true && !hasControlCharacter(text);

  return {
    text(message, options = {}) {
      let value = "";
      let problem: string | undefined;
      const initial = options.initial ?? "";
      return interact<string>(
        () =>
          `${style.cyan("?")} ${style.bold(message)} ${value === "" ? style.dim(initial) : value}\n${
            problem === undefined ? "" : `  ${style.red(problem)}\n`
          }`,
        (text, key) => {
          if (key.name === "return" || key.name === "enter") {
            const answer = value === "" ? initial : value;
            problem = options.validate?.(answer);
            return problem === undefined ? { value: answer, summary: answer } : undefined;
          }
          if (key.name === "backspace") value = value.slice(0, -1);
          else if (key.ctrl === true && key.name === "u") value = "";
          else if (printable(text, key)) value += text;
          problem = undefined;
          return undefined;
        },
        message,
      );
    },

    select(message, choices, initial) {
      let at = Math.max(
        0,
        choices.findIndex((choice) => choice.value === initial),
      );
      return interact(
        () =>
          `${style.cyan("?")} ${style.bold(message)}\n${choices
            .map((choice, index) => {
              const mark = index === at ? style.cyan(">") : " ";
              const label = index === at ? style.cyan(choice.label) : choice.label;
              return `  ${mark} ${label}${choice.hint === undefined ? "" : style.dim(`  ${choice.hint}`)}\n`;
            })
            .join("")}`,
        (_text, key) => {
          if (key.name === "up" || key.name === "k")
            at = (at + choices.length - 1) % choices.length;
          else if (key.name === "down" || key.name === "j") at = (at + 1) % choices.length;
          else if (key.name === "return" || key.name === "enter") {
            const choice = choices[at];
            if (choice !== undefined) return { value: choice.value, summary: choice.label };
          }
          return undefined;
        },
        message,
      );
    },

    multiselect(message, choices, initial) {
      let at = 0;
      const chosen = new Set(initial);
      return interact(
        () =>
          `${style.cyan("?")} ${style.bold(message)} ${style.dim("(up/down move, space toggles, a toggles all, enter confirms)")}\n${choices
            .map((choice, index) => {
              const mark = index === at ? style.cyan(">") : " ";
              const box = chosen.has(choice.value) ? style.green("[x]") : "[ ]";
              return `  ${mark} ${box} ${choice.label}${choice.hint === undefined ? "" : style.dim(`  ${choice.hint}`)}\n`;
            })
            .join("")}`,
        (text, key) => {
          if (key.name === "up" || key.name === "k")
            at = (at + choices.length - 1) % choices.length;
          else if (key.name === "down" || key.name === "j") at = (at + 1) % choices.length;
          else if (key.name === "space" || text === " ") {
            const choice = choices[at];
            if (choice !== undefined) {
              if (chosen.has(choice.value)) chosen.delete(choice.value);
              else chosen.add(choice.value);
            }
          } else if (key.name === "a") {
            if (chosen.size === choices.length) chosen.clear();
            else for (const choice of choices) chosen.add(choice.value);
          } else if (key.name === "return" || key.name === "enter") {
            const values = choices.filter((choice) => chosen.has(choice.value));
            return {
              value: values.map((choice) => choice.value),
              summary:
                values.length === 0 ? "none" : values.map((choice) => choice.label).join(", "),
            };
          }
          return undefined;
        },
        message,
      );
    },

    confirm(message, initial) {
      let answer = initial;
      return interact(
        () =>
          `${style.cyan("?")} ${style.bold(message)} ${style.dim(answer ? "(Y/n)" : "(y/N)")}\n`,
        (text, key) => {
          if (key.name === "return" || key.name === "enter") {
            return { value: answer, summary: answer ? "yes" : "no" };
          }
          if (text === "y" || text === "Y") return { value: true, summary: "yes" };
          if (text === "n" || text === "N") return { value: false, summary: "no" };
          if (key.name === "left" || key.name === "right") answer = !answer;
          return undefined;
        },
        message,
      );
    },
  };
}
