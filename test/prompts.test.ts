import { describe, expect, it } from "vitest";
import { CancelError, createPrompter } from "../src/prompts";
import { createStyle } from "../src/style";
import { FakeTerminal } from "./support/context";
import { hasColor, KEYS, Screen } from "./support/screen";

function setup(color = false) {
  const input = new FakeTerminal();
  const screen = new Screen();
  const prompter = createPrompter(input, screen, createStyle(color));
  /** Waits until the question is on screen, then types. */
  const answer = async (marker: string, keys: string[]): Promise<void> => {
    await screen.waitFor(marker);
    for (const key of keys) input.write(key);
  };
  return { input, screen, prompter, answer };
}

describe("prompts on a terminal", () => {
  it("[CSA-100] a text question returns what was typed, trims nothing, and shows the default when empty", async () => {
    const { prompter, answer, screen } = setup();
    const first = prompter.text("Project name", { initial: "shadow-app" });
    await answer("Project name", ["m", "y", "-", "a", "p", "p", "p", KEYS.backspace, KEYS.enter]);
    expect(await first).toBe("my-app");
    expect(screen.text).toContain("shadow-app");

    const second = prompter.text("Another", { initial: "fallback" });
    await answer("Another", [KEYS.enter]);
    expect(await second).toBe("fallback");
  });

  it("[CSA-101] a text question keeps asking while the validator complains, and shows its message", async () => {
    const { prompter, answer, screen, input } = setup();
    const result = prompter.text("Name", {
      validate: (value) => (value.length < 3 ? "At least three characters" : undefined),
    });
    await answer("Name", ["a", KEYS.enter]);
    await screen.waitFor("At least three characters");
    for (const key of ["b", "c", KEYS.enter]) input.write(key);
    expect(await result).toBe("abc");
  });

  it("[CSA-102] a single choice moves with the arrows, wraps around, and returns the value", async () => {
    const { prompter, answer } = setup();
    const choices = [
      { value: "spa", label: "spa", hint: "single-page app" },
      { value: "dusk", label: "dusk" },
      { value: "other", label: "other" },
    ];
    const down = prompter.select("Template", choices, "spa");
    await answer("Template", [KEYS.down, KEYS.enter]);
    expect(await down).toBe("dusk");

    const wrap = prompter.select("Again", choices, "spa");
    await answer("Again", [KEYS.up, KEYS.enter]);
    expect(await wrap).toBe("other");

    const initial = prompter.select("Initial", choices, "dusk");
    await answer("Initial", [KEYS.enter]);
    expect(await initial).toBe("dusk");
  });

  it("[CSA-103] a multiple choice toggles with space, all with a, and returns the chosen values in list order", async () => {
    const { prompter, answer, screen } = setup();
    const choices = ["tailwind", "biome", "vitest"].map((value) => ({ value, label: value }));
    const some = prompter.multiselect("Add-ons", choices, ["biome"]);
    await answer("Add-ons", [KEYS.space, KEYS.down, KEYS.down, KEYS.space, KEYS.enter]);
    expect(await some).toEqual(["tailwind", "biome", "vitest"]);
    expect(screen.text).toContain("[x]");

    const none = prompter.multiselect("Second", choices, ["biome"]);
    await answer("Second", [KEYS.down, KEYS.space, KEYS.enter]);
    expect(await none).toEqual([]);

    const all = prompter.multiselect("Third", choices, []);
    await answer("Third", ["a", KEYS.enter]);
    expect(await all).toEqual(["tailwind", "biome", "vitest"]);
  });

  it("[CSA-104] a yes/no question takes y, n or the default on enter", async () => {
    const { prompter, answer } = setup();
    const yes = prompter.confirm("Install?", false);
    await answer("Install?", ["y"]);
    expect(await yes).toBe(true);
    const no = prompter.confirm("Sure?", true);
    await answer("Sure?", ["n"]);
    expect(await no).toBe(false);
    const dflt = prompter.confirm("Default?", true);
    await answer("Default?", [KEYS.enter]);
    expect(await dflt).toBe(true);
  });

  it("[CSA-105] Ctrl-C cancels, leaves raw mode and pauses the input", async () => {
    const { prompter, answer, input } = setup();
    const result = prompter.text("Name");
    await answer("Name", [KEYS.ctrlC]);
    await expect(result).rejects.toBeInstanceOf(CancelError);
    expect(input.isRaw).toBe(false);
    expect(input.isPaused()).toBe(true);
  });

  it("[CSA-106] draws only plain text and cursor movement without color, and color codes with it", async () => {
    const plain = setup(false);
    const a = plain.prompter.select("Plain", [{ value: 1, label: "one" }], 1);
    await plain.answer("Plain", [KEYS.enter]);
    await a;
    // Cursor control (A, J) is allowed; colors (m) are not.
    expect(hasColor(plain.screen.text)).toBe(false);
    const colored = setup(true);
    const b = colored.prompter.select("Colored", [{ value: 1, label: "one" }], 1);
    await colored.answer("Colored", [KEYS.enter]);
    await b;
    expect(hasColor(colored.screen.text)).toBe(true);
  });
});
