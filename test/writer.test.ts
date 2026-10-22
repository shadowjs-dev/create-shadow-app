import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProject } from "../src/project";
import { scaffold } from "../src/scaffold";
import { inspectTarget, writeProject } from "../src/writer";

const temp = (): string => mkdtempSync(join(tmpdir(), "csa-write-"));
const read = (dir: string, file: string): string => readFileSync(join(dir, file), "utf8");

describe("writing a project to disk", () => {
  it("[CSA-90] writes every file of the map, creating folders, with the content of the map", () => {
    const dir = join(temp(), "app");
    const project = buildProject({ name: "app", template: "dusk", tailwind: true, vitest: true });
    const result = writeProject(dir, project.files, { force: false });
    expect(result.directory).toBe(dir);
    expect(result.files).toEqual([...project.files.keys()]);
    for (const [path, text] of project.files) expect(read(dir, path), path).toBe(text);
    expect(existsSync(join(dir, "src", "routes", "[...rest].tsx"))).toBe(true);
  });

  it("[CSA-91] classifies the target: missing, empty, not empty, and refuses a file", () => {
    const root = temp();
    expect(inspectTarget(join(root, "nope"))).toBe("missing");
    expect(inspectTarget(root)).toBe("empty");
    writeFileSync(join(root, "keep.txt"), "x");
    expect(inspectTarget(root)).toBe("not-empty");
    expect(() => inspectTarget(join(root, "keep.txt"))).toThrow(/is not a directory/);
  });

  it("[CSA-92] never writes into a non-empty directory without force, and leaves it untouched", () => {
    const dir = temp();
    writeFileSync(join(dir, "keep.txt"), "mine");
    expect(() => writeProject(dir, new Map([["package.json", "{}\n"]]), { force: false })).toThrow(
      /is not empty\.$/,
    );
    expect(readdirSync(dir)).toEqual(["keep.txt"]);
    expect(read(dir, "keep.txt")).toBe("mine");
  });

  it("[CSA-93] with force it overwrites files of the same name and keeps the others", () => {
    const dir = temp();
    writeFileSync(join(dir, "keep.txt"), "mine");
    writeFileSync(join(dir, "package.json"), "old");
    writeProject(dir, new Map([["package.json", "{}\n"]]), { force: true });
    expect(read(dir, "package.json")).toBe("{}\n");
    expect(read(dir, "keep.txt")).toBe("mine");
  });

  it("[CSA-94] a bad path anywhere in the map stops the write before the first file is written", () => {
    const dir = join(temp(), "app");
    const files = new Map([
      ["package.json", "{}\n"],
      ["src/ok.ts", "1\n"],
      ["../escape.txt", "no\n"],
    ]);
    expect(() => writeProject(dir, files, { force: false })).toThrow(/outside the project/);
    expect(existsSync(dir)).toBe(false);
    const absolute = new Map([["/tmp/escape.txt", "no\n"]]);
    expect(() => writeProject(dir, absolute, { force: false })).toThrow(/outside the project/);
  });

  it("[CSA-95] accepts an existing empty directory and a directory that has to be created deeply", () => {
    const root = temp();
    mkdirSync(join(root, "empty"));
    expect(
      writeProject(join(root, "empty"), new Map([["a.txt", "a\n"]]), { force: false }).files,
    ).toEqual(["a.txt"]);
    expect(
      writeProject(join(root, "x", "y", "z"), new Map([["a.txt", "a\n"]]), { force: false }).files,
    ).toEqual(["a.txt"]);
  });

  it("[CSA-97] scaffold() validates the name first and returns the written files", () => {
    const dir = join(temp(), "app");
    expect(() => scaffold(dir, { name: "Bad Name" })).toThrow(/valid npm package name/);
    expect(existsSync(dir)).toBe(false);
    const result = scaffold(dir, { name: "app", template: "dusk" });
    expect(result.files).toContain("vite.config.ts");
    expect(result.files).not.toContain("serve.mjs");
    expect(() => scaffold(dir, { name: "app" })).toThrow(/is not empty\.$/);
  });

  it("[CSA-97b] scaffold() says why a reserved name is refused, and writes nothing", () => {
    const dir = join(temp(), "app");
    expect(() => scaffold(dir, { name: "http" })).toThrow(/"http" cannot be a package name/);
    expect(() => scaffold(dir, { name: "node_modules" })).toThrow(/npm reserves/);
    expect(existsSync(dir)).toBe(false);
  });
});

describe("refusals and failures while writing", () => {
  const temp = (): string => mkdtempSync(join(tmpdir(), "csa-writer-"));

  it("[CSA-96] a map whose names differ only by case is refused before the first byte, because one would overwrite the other", () => {
    const dir = join(temp(), "app");
    const files = new Map([
      ["README.md", "upper"],
      ["readme.md", "lower"],
    ]);
    expect(() => writeProject(dir, files, { force: false })).toThrow(/differ only by case/);
    expect(existsSync(dir)).toBe(false);
  });

  it("[CSA-98] a write that fails part-way removes what this run created, names the file, and leaves what was there", () => {
    const cwd = temp();
    const dir = join(cwd, "app");
    mkdirSync(dir);
    // A file where the folder `lock` must go: the first file is written, then the write fails.
    writeFileSync(join(dir, "lock"), "theirs");
    const files = new Map([
      ["a.txt", "first"],
      ["deep/new/b.txt", "second"],
      ["lock/c.txt", "third"],
    ]);
    expect(() => writeProject(dir, files, { force: true })).toThrow(/Could not write lock\/c\.txt/);
    expect(readdirSync(dir)).toEqual(["lock"]);
    expect(readFileSync(join(dir, "lock"), "utf8")).toBe("theirs");
  });

  it("[CSA-98b] a failure in a new target removes the target folder the write created", () => {
    const cwd = temp();
    const dir = join(cwd, "app");
    // `x` is a file, then the map needs `x` as a folder: the second write cannot happen.
    const files = new Map([
      ["a.txt", "first"],
      ["x", "a file"],
      ["x/y.txt", "second"],
    ]);
    expect(() => writeProject(dir, files, { force: false })).toThrow(/Could not write x\/y\.txt/);
    expect(existsSync(dir)).toBe(false);
  });

  it("[CSA-99] a target below a file is refused with the reason, and nothing is created", () => {
    const cwd = temp();
    writeFileSync(join(cwd, "file"), "x");
    expect(() => inspectTarget(join(cwd, "file", "app"))).toThrow(/cannot be used/);
    expect(() =>
      writeProject(join(cwd, "file", "app"), new Map([["a", "b"]]), { force: false }),
    ).toThrow(/cannot be used/);
    expect(readdirSync(cwd)).toEqual(["file"]);
  });
});
