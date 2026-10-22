import { PassThrough } from "node:stream";
import type { RunContext, Runner, RunOutcome } from "../../src/run";
import { Screen } from "./screen";

/** A terminal stand-in: a readable that says it is a TTY and accepts raw mode, plus collected output. */
export class FakeTerminal extends PassThrough {
  isTTY = true;
  isRaw = false;
  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
}

/** One child process the command asked for. */
export interface Call {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly inherit: boolean | "stderr";
}

/** What the fake runner answers. */
export interface Answers {
  /** Exit status of `git --version`. Default 0 (git exists). */
  gitVersion?: number;
  /** Whether the directory is already inside a work tree. Default false. */
  insideRepository?: boolean;
  /** Exit status of `git init`. Default 0. */
  gitInit?: number;
  /** Exit status of the install. Default 0. `null` means the program could not start at all. */
  install?: number | null;
  /** The install never finishes on its own: it ends (stopped by SIGTERM) when the run is aborted. */
  hang?: boolean;
}

/** Records every call and answers like git and a package manager would. */
export function fakeRunner(answers: Answers = {}): {
  runner: Runner;
  calls: Call[];
  /** Resolves when the install (the call that is not git) has started. */
  installStarted: Promise<void>;
} {
  const calls: Call[] = [];
  let announce: () => void = () => undefined;
  const installStarted = new Promise<void>((resolve) => {
    announce = resolve;
  });
  const runner: Runner = {
    async run(command, args, cwd, inherit, signal): Promise<RunOutcome> {
      calls.push({ command, args, cwd, inherit });
      if (command === "git") {
        if (args[0] === "--version")
          return { status: answers.gitVersion ?? 0, signal: null, stdout: "git version 2" };
        if (args[0] === "rev-parse") {
          return answers.insideRepository === true
            ? { status: 0, signal: null, stdout: "true\n" }
            : { status: 128, signal: null, stdout: "" };
        }
        return { status: answers.gitInit ?? 0, signal: null, stdout: "" };
      }
      announce();
      if (answers.hang === true) {
        return new Promise<RunOutcome>((resolve) => {
          const stop = (): void => resolve({ status: null, signal: "SIGTERM", stdout: "" });
          if (signal?.aborted === true) stop();
          else signal?.addEventListener("abort", stop, { once: true });
        });
      }
      const status = answers.install === undefined ? 0 : answers.install;
      return { status, signal: null, stdout: "" };
    },
  };
  return { runner, calls, installStarted };
}

/** A stand-in for the process signals: a test fires them, the command listens. */
export class FakeSignals {
  private readonly listeners = new Map<string, Set<() => void>>();

  on(name: "SIGINT" | "SIGTERM", listener: () => void): void {
    const set = this.listeners.get(name) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(name, set);
  }

  off(name: "SIGINT" | "SIGTERM", listener: () => void): void {
    this.listeners.get(name)?.delete(listener);
  }

  /** Delivers `name` to every listener, as the operating system would. */
  fire(name: "SIGINT" | "SIGTERM"): void {
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener();
  }

  /** How many listeners are registered, across both signals. */
  get listenerCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

/** A command context whose output is collected in memory. */
export interface Harness {
  readonly ctx: RunContext;
  readonly calls: Call[];
  readonly stdin: FakeTerminal;
  readonly signals: FakeSignals;
  /** Resolves when the install has started. */
  readonly installStarted: Promise<void>;
  /** Everything written to stdout, with `waitFor` to wait for a question to appear. */
  readonly screen: Screen;
  stdout(): string;
  stderr(): string;
}

/** Builds a context for `run()`: no real terminal, no real child process. */
export function harness(
  cwd: string,
  options: {
    tty?: boolean;
    env?: Record<string, string | undefined>;
    answers?: Answers;
  } = {},
): Harness {
  const stdin = new FakeTerminal();
  stdin.isTTY = options.tty === true;
  const screen = new Screen();
  let err = "";
  const { runner, calls, installStarted } = fakeRunner(options.answers);
  const signals = new FakeSignals();
  const ctx: RunContext = {
    cwd,
    env: options.env ?? {},
    signals,
    stdin,
    stdout: {
      isTTY: options.tty === true,
      write: (text: string) => screen.write(text),
    },
    stderr: {
      write: (text: string) => {
        err += text;
        return true;
      },
    },
    runner,
    version: "9.9.9",
  };
  return {
    ctx,
    calls,
    stdin,
    signals,
    installStarted,
    screen,
    stdout: () => screen.text,
    stderr: () => err,
  };
}
