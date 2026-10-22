/** A unified diff of two texts, with the hunks and context `diff -u` and `git diff` print. */

type Op = { readonly kind: "eq" | "del" | "ins"; readonly line: string };

/** Past this many changed lines the middle of the file is shown as one replaced block. */
const MAX_EDIT_DISTANCE = 2000;
const CONTEXT = 3;

/** Splits a text into lines that keep their terminator, so a missing final newline is a difference. */
function splitLines(value: string): string[] {
  return value.length === 0 ? [] : value.split(/(?<=\n)/);
}

/** The shortest edit script between two line lists, or null when it is longer than the limit. */
function myers(a: readonly string[], b: readonly string[]): Op[] | null {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  const max = Math.min(n + m, MAX_EDIT_DISTANCE);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0))) {
        x = v[offset + k + 1] ?? 0;
      } else {
        x = (v[offset + k - 1] ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;

  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d--) {
    const previous = trace[d];
    if (previous === undefined) return null;
    const at = (k: number): number => previous[k + d + 1] ?? 0;
    const k = x - y;
    const previousK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const previousX = d === 0 ? 0 : at(previousK);
    const previousY = d === 0 ? 0 : previousX - previousK;
    while (x > previousX && y > previousY) {
      ops.push({ kind: "eq", line: a[x - 1] ?? "" });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === previousX) ops.push({ kind: "ins", line: b[y - 1] ?? "" });
      else ops.push({ kind: "del", line: a[x - 1] ?? "" });
    }
    x = previousX;
    y = previousY;
  }
  return ops.reverse();
}

/** The edit script of two line lists: common head and tail are trimmed, the middle is diffed. */
function script(a: readonly string[], b: readonly string[]): Op[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }
  const middleA = a.slice(head, a.length - tail);
  const middleB = b.slice(head, b.length - tail);
  const middle: Op[] = myers(middleA, middleB) ?? [
    ...middleA.map((line): Op => ({ kind: "del", line })),
    ...middleB.map((line): Op => ({ kind: "ins", line })),
  ];
  return [
    ...a.slice(0, head).map((line): Op => ({ kind: "eq", line })),
    ...middle,
    ...a.slice(a.length - tail).map((line): Op => ({ kind: "eq", line })),
  ];
}

/** A line without its terminator, followed by the marker `diff` prints when the file ends there. */
function printed(prefix: string, line: string): string {
  const body = line.endsWith("\n") ? line.slice(0, -1) : line;
  const marker = line.endsWith("\n") ? "" : "\n\\ No newline at end of file";
  return `${prefix}${body}${marker}`;
}

/**
 * A unified diff of two texts.
 *
 * @param file The path printed in the headers, with forward slashes.
 * @param before The original text.
 * @param after The new text.
 * @returns The diff, ending in a newline, or an empty string when the texts are equal.
 * @example
 * unifiedDiff("a.ts", "a\n", "b\n"); // "--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n"
 * @internal
 */
export function unifiedDiff(file: string, before: string, after: string): string {
  if (before === after) return "";
  const ops = script(splitLines(before), splitLines(after));
  const changed: number[] = [];
  ops.forEach((op, index) => {
    if (op.kind !== "eq") changed.push(index);
  });

  // Group changes whose context windows touch or overlap into one hunk.
  const groups: Array<[number, number]> = [];
  for (const index of changed) {
    const last = groups[groups.length - 1];
    if (last !== undefined && index - last[1] <= 2 * CONTEXT + 1) last[1] = index;
    else groups.push([index, index]);
  }

  const out = [`--- a/${file}`, `+++ b/${file}`];
  for (const [first, last] of groups) {
    const from = Math.max(0, first - CONTEXT);
    const to = Math.min(ops.length - 1, last + CONTEXT);
    let oldStart = 1;
    let newStart = 1;
    for (let index = 0; index < from; index++) {
      const kind = ops[index]?.kind;
      if (kind !== "ins") oldStart++;
      if (kind !== "del") newStart++;
    }
    let oldCount = 0;
    let newCount = 0;
    const body: string[] = [];
    for (let index = from; index <= to; index++) {
      const op = ops[index];
      if (op === undefined) continue;
      if (op.kind !== "ins") oldCount++;
      if (op.kind !== "del") newCount++;
      body.push(printed(op.kind === "eq" ? " " : op.kind === "del" ? "-" : "+", op.line));
    }
    const range = (start: number, count: number): string =>
      count === 1 ? String(start) : `${count === 0 ? start - 1 : start},${count}`;
    out.push(`@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@`, ...body);
  }
  return `${out.join("\n")}\n`;
}
