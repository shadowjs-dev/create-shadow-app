import type { PromptOutput } from "../../src/prompts";

/** Collects what a prompt draws and lets a test wait for a piece of it, without timers. */
export class Screen implements PromptOutput {
  text = "";
  private readonly waiters: { needle: string; from: number; resolve: () => void }[] = [];

  write(chunk: string): boolean {
    this.text += chunk;
    for (const waiter of [...this.waiters]) {
      if (this.text.indexOf(waiter.needle, waiter.from) !== -1) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
    return true;
  }

  /** Resolves once `needle` has been drawn after this call (or is already on screen after `from`). */
  waitFor(needle: string, from = 0): Promise<void> {
    if (this.text.indexOf(needle, from) !== -1) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ needle, from, resolve }));
  }
}

/** Key sequences as a terminal sends them. */
export const KEYS = {
  up: "\u001b[A",
  down: "\u001b[B",
  right: "\u001b[C",
  left: "\u001b[D",
  enter: "\r",
  space: " ",
  backspace: "\u007f",
  ctrlC: "\u0003",
  ctrlU: "\u0015",
} as const;

/** True when the text contains an ANSI color or style sequence (`ESC [ <digits> m`). */
export function hasColor(text: string): boolean {
  return text
    .split("\u001b[")
    .slice(1)
    .some((part) => {
      const end = part.search(/[^0-9]/);
      return end > 0 && part[end] === "m";
    });
}
