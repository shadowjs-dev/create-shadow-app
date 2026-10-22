/** The files of the `content` template that do not depend on the chosen options. @since 1.0.0 */
export const CONTENT_FILES: Readonly<Record<string, string>> = Object.freeze({
  "content/hello-shadowjs.md": `---
title: Hello, ShadowJS
date: 2026-10-01
summary: How this site is built, and where to change it.
tags: [welcome, dusk]
---

# Start here

This post is a Markdown file in \`content/\`. The build reads every file in that folder, turns each
one into a page, and adds it to the feed and the sitemap.

## What the front matter does

The block between the two \`---\` lines at the top holds the data of the post:

- \`title\` and \`date\` are required, and the date is written as \`YYYY-MM-DD\`.
- \`summary\` is the line shown in lists and in the feed.
- \`tags\` is a list, and \`lang\` sets the language of one post.
- \`draft: true\` keeps a post out of the site while you write it.

> A page is a file, a post is a file, and the site is a folder of both.

Read the [Dusk guide](https://shadowjs.net) for routing, or open \`src/routes\` and change a page.
`,
  "content/marhaba.md": `---
title: مرحبا بالعالم
date: 2026-09-05
lang: ar
summary: مقال بالعربية يظهر من اليمين إلى اليسار.
tags: [rtl]
---

# أهلا بك

هذا المقال مكتوب بالعربية. يضبط الحقل \`lang\` لغة المقال، فتأخذ الصفحة الاتجاه من اليمين إلى اليسار.

- القوائم تبدأ من اليمين.
- الاقتباس يضع خطه على الجانب الصحيح.

> الاتجاه يأتي من اللغة، لا من النص.
`,
  "content/writing-in-markdown.md": `---
title: "Writing in Markdown"
date: 2026-09-20
summary: The Markdown this site understands.
tags: [markdown]
---

The renderer is small on purpose. It reads **bold**, *emphasis*, \`code\`, [links](/about) and
the blocks below. Raw HTML is not Markdown here: it shows up as text, so a post can never add markup.

1. Headings start with \`#\`.
2. Lists start with \`-\` or a number.
3. Code goes in a fence.

\`\`\`ts
export function greet(name: string): string {
  return \`Hello, \${name}\`;
}
\`\`\`

---

A link to \`javascript:\` is not a link: the label stays and the address is dropped.
`,
  "dusk.config.ts": `import { defineConfig } from "@shadow-js/dusk/vite";

export default defineConfig({
  // The build renders \`/\`, \`/posts\` and \`/about\` (they export \`prerender\`), then follows their links, so
  // every post in \`content/\` becomes a static page too. Add a page to the list and it is built as well.
  prerender: { crawlLinks: true },
});
`,
  "src/components/Markdown.test.tsx": `import { accessibleMatchers, render } from "@shadow-js/testing/dom";
import { expect, it } from "vitest";
import { parseMarkdown } from "../lib/markdown";
import { Markdown } from "./Markdown";

expect.extend(accessibleMatchers);

const draw = (source: string) => render(() => <Markdown blocks={parseMarkdown(source)} />);

it("draws headings one level down, so the page keeps its single h1", () => {
  const view = draw("# One\\n\\n## Two");
  expect(view.container.querySelectorAll("h1")).toHaveLength(0);
  expect(view.getByRole("heading", { name: "One", level: 2 })).toBeTruthy();
  expect(view.getByRole("heading", { name: "Two", level: 3 })).toBeTruthy();
});

it("draws links, lists and code as elements", () => {
  const view = draw("A [link](/about) and \`code\`.\\n\\n- one\\n- two");
  expect(view.getByRole("link", { name: "link" })).toHaveAccessibleName("link");
  expect(view.container.querySelectorAll("li")).toHaveLength(2);
  expect(view.container.querySelector("code")?.textContent).toBe("code");
});

it("never turns text into markup", () => {
  const view = draw("<img src=x onerror=alert(1)> and [x](javascript:alert(1))");
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.querySelector("a")).toBeNull();
  expect(view.container.textContent).toContain("<img src=x onerror=alert(1)>");
});
`,
  "src/components/Markdown.tsx": `import { For, type JSX } from "@shadow-js/web";
import type { Block, Inline } from "../lib/markdown";

function Inlines(props: { nodes: readonly Inline[] }): JSX.Element {
  return (
    <For each={props.nodes}>
      {(node) => {
        switch (node.type) {
          case "text":
            return node.value;
          case "code":
            return <code>{node.value}</code>;
          case "strong":
            return (
              <strong>
                <Inlines nodes={node.children} />
              </strong>
            );
          case "em":
            return (
              <em>
                <Inlines nodes={node.children} />
              </em>
            );
          case "link":
            return (
              <a href={node.href}>
                <Inlines nodes={node.children} />
              </a>
            );
        }
      }}
    </For>
  );
}

function Heading(props: { level: number; children: readonly Inline[] }): JSX.Element {
  const content = <Inlines nodes={props.children} />;
  switch (props.level) {
    case 2:
      return <h2>{content}</h2>;
    case 3:
      return <h3>{content}</h3>;
    case 4:
      return <h4>{content}</h4>;
    case 5:
      return <h5>{content}</h5>;
    default:
      return <h6>{content}</h6>;
  }
}

function Blocks(props: { blocks: readonly Block[]; offset: number }): JSX.Element {
  return (
    <For each={props.blocks}>
      {(block) => {
        switch (block.type) {
          case "heading":
            return (
              <Heading level={Math.min(6, block.level + props.offset)}>{block.children}</Heading>
            );
          case "paragraph":
            return (
              <p>
                <Inlines nodes={block.children} />
              </p>
            );
          case "code":
            return (
              <pre dir="ltr">
                <code>{block.value}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote>
                <Blocks blocks={block.children} offset={props.offset} />
              </blockquote>
            );
          case "list": {
            const items = (
              <For each={block.items}>
                {(item) => (
                  <li>
                    <Inlines nodes={item} />
                  </li>
                )}
              </For>
            );
            return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
          }
          case "rule":
            return <hr />;
        }
      }}
    </For>
  );
}

/**
 * Draws parsed Markdown. It builds elements, never HTML text, so a document cannot inject markup.
 * \`offset\` moves every heading down: the page title is the level-1 heading, so a \`#\` in the body
 * becomes an \`h2\` by default.
 */
export function Markdown(props: { blocks: readonly Block[]; offset?: number }): JSX.Element {
  return (
    <div class="prose">
      <Blocks blocks={props.blocks} offset={props.offset ?? 1} />
    </div>
  );
}
`,
  "src/components/NotFound.tsx": `import { A } from "@shadow-js/router";

export function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>There is nothing at this address.</p>
      <A to="/">Back to the start</A>
    </section>
  );
}
`,
  "src/components/PostList.tsx": `import { A } from "@shadow-js/router";
import { For } from "@shadow-js/web";
import type { PostSummary } from "../server/posts.server";

/** The posts as a list: title, day, reading time and summary. */
export function PostList(props: { posts: readonly PostSummary[] }) {
  return (
    <ul class="post-list">
      <For each={props.posts} key={(post) => post.slug}>
        {(item) => (
          <li lang={item().lang}>
            <h2>
              <A to="/posts/:slug" params={{ slug: item().slug }}>
                {item().title}
              </A>
            </h2>
            <p class="post-meta">
              <time datetime={item().date}>{item().date}</time> · {item().minutes} min read
            </p>
            <p>{item().summary}</p>
          </li>
        )}
      </For>
    </ul>
  );
}
`,
  "src/entry-server.ts": `import type { HandlerOptions, Middleware } from "@shadow-js/dusk/server";
import { directionOf } from "./lib/direction";

const appUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");
const locale = process.env.SITE_LOCALE ?? "en";

/** Writes \`lang\` and \`dir\` on <html> from SITE_LOCALE, so a right-to-left site is right-to-left from the first byte. */
const documentLocale: Middleware = (event, next) => {
  event.document.lang = locale;
  event.document.dir = directionOf(locale);
  return next();
};

/** Options of the request handler. Everything here has a safe default; see the Dusk docs. */
export const options = {
  middleware: [documentLocale],
  security: {
    // The Host header is attacker input: production answers only for the hosts of APP_URL.
    ...(import.meta.env.PROD ? { allowedHosts: [appUrl.hostname] } : {}),
    // Sent on https responses only. CSRF checks, secure headers and body limits are on by default.
    headers: { hsts: { maxAge: 63_072_000, includeSubDomains: true } },
    // A strict Content-Security-Policy with a fresh nonce per request. Production only: the dev server
    // injects inline scripts. Add sources by directive when you load something from another origin.
    ...(import.meta.env.PROD ? { csp: {} } : {}),
  },
} satisfies Omit<HandlerOptions, "manifest">;

export default options;
`,
  "src/index.css": `:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  line-height: 1.6;
  --measure: 42rem;
  --line: color-mix(in srgb, currentColor 18%, transparent);
  --muted: color-mix(in srgb, currentColor 65%, transparent);
}

body {
  margin: 0;
}

a {
  color: inherit;
  text-underline-offset: 0.2em;
}

.site-header,
.site-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  padding-block: 1rem;
  padding-inline: 1.5rem;
}

.site-header {
  border-block-end: 1px solid var(--line);
}

.site-footer {
  border-block-start: 1px solid var(--line);
  color: var(--muted);
}

.site-name {
  font-weight: 700;
  text-decoration: none;
}

.site-nav {
  display: flex;
  gap: 1.25rem;
}

.site-main {
  box-sizing: border-box;
  max-inline-size: var(--measure);
  margin-inline: auto;
  padding-block: 2rem;
  padding-inline: 1.5rem;
}

.post-list {
  display: grid;
  gap: 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.post-list h2 {
  margin-block: 0 0.25rem;
  font-size: 1.25rem;
}

.post-meta {
  color: var(--muted);
  font-size: 0.875rem;
}

.tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.prose pre {
  overflow-x: auto;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  text-align: left;
}

.prose blockquote {
  margin-inline: 0;
  padding-inline-start: 1rem;
  border-inline-start: 4px solid var(--line);
  color: var(--muted);
}

.prose ul,
.prose ol {
  padding-inline-start: 1.5rem;
}

.prose :not(pre) > code {
  padding-inline: 0.25em;
  border-radius: 0.25rem;
  background: var(--line);
}
`,
  "src/lib/direction.test.ts": `import { describe, expect, it } from "vitest";
import { directionOf } from "./direction";

describe("directionOf", () => {
  it("is right to left for the right-to-left languages, with or without a region", () => {
    for (const locale of ["ar", "ar-EG", "he", "fa-IR", "ur", "ps"])
      expect(directionOf(locale), locale).toBe("rtl");
  });

  it("is left to right for the others", () => {
    for (const locale of ["en", "en-US", "fr", "de-CH", "ja", ""])
      expect(directionOf(locale), locale).toBe("ltr");
  });

  it("follows the script when the tag names one", () => {
    expect(directionOf("az-Arab")).toBe("rtl");
    expect(directionOf("ar-Latn")).toBe("ltr");
    expect(directionOf("pa_Arab_PK")).toBe("rtl");
  });
});
`,
  "src/lib/direction.ts": `const RTL_LANGUAGES = new Set([
  "ar",
  "arc",
  "ckb",
  "dv",
  "fa",
  "he",
  "ks",
  "ps",
  "sd",
  "ug",
  "ur",
  "yi",
]);
const RTL_SCRIPTS = new Set(["arab", "hebr", "thaa", "syrc", "nkoo", "adlm", "rohg"]);

/**
 * The writing direction of a locale: \`"rtl"\` for Arabic, Hebrew, Persian, Urdu and the other
 * right-to-left languages, or for any language written in a right-to-left script (\`az-Arab\`);
 * \`"ltr"\` for everything else. It reads the language and script subtags only, so it gives the same
 * answer in every runtime.
 *
 * @param locale A BCP 47 tag such as \`en\`, \`ar-EG\` or \`sr-Latn\`.
 * @returns The value for the \`dir\` attribute.
 */
export function directionOf(locale: string): "ltr" | "rtl" {
  const parts = locale.trim().toLowerCase().split(/[-_]/);
  const script = parts.slice(1).find((part) => part.length === 4);
  if (script !== undefined) return RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
  return RTL_LANGUAGES.has(parts[0] ?? "") ? "rtl" : "ltr";
}
`,
  "src/lib/front-matter.test.ts": `import { describe, expect, it } from "vitest";
import { FrontMatterError, parseFrontMatter, readFlag, readList, readString } from "./front-matter";

describe("parseFrontMatter", () => {
  it("reads text, numbers, booleans and lists, and returns the body", () => {
    const { data, body } = parseFrontMatter(
      [
        "---",
        'title: "A: B"',
        "date: 2026-10-01",
        "order: 3",
        "draft: true",
        "tags: [one, 'two words', \\"three\\"]",
        "---",
        "",
        "Body",
      ].join("\\n"),
    );
    expect(data).toEqual({
      title: "A: B",
      date: "2026-10-01",
      order: 3,
      draft: true,
      tags: ["one", "two words", "three"],
    });
    expect(body).toBe("\\nBody");
  });

  it("keeps a file without front matter whole", () => {
    expect(parseFrontMatter("# Title\\n")).toEqual({ data: {}, body: "# Title\\n" });
  });

  it("accepts CRLF line endings, a byte order mark and comments", () => {
    const { data, body } = parseFrontMatter("﻿---\\r\\n# a comment\\r\\ntitle: Hi\\r\\n---\\r\\nText");
    expect(data).toEqual({ title: "Hi" });
    expect(body).toBe("Text");
  });

  it("reports the line of a mistake", () => {
    const unclosed = () => parseFrontMatter("---\\ntitle: A\\n");
    expect(unclosed).toThrow(FrontMatterError);
    expect(unclosed).toThrow(/not closed/);
    expect(() => parseFrontMatter("---\\ntitle: A\\nnot a pair\\n---\\n")).toThrow(
      /line 3: expected key: value/,
    );
    expect(() => parseFrontMatter("---\\ntitle: A\\ntitle: B\\n---\\n")).toThrow(/line 3: .*twice/);
    expect(() => parseFrontMatter('---\\ntitle: "open\\n---\\n')).toThrow(
      /line 2: unterminated quote/,
    );
    expect(() => parseFrontMatter("---\\ntags: [a, b\\n---\\n")).toThrow(/must end with \\]/);
  });

  it("does not let a key named __proto__ change the data's prototype", () => {
    const { data } = parseFrontMatter("---\\n__proto__: x\\n---\\n".replace("__proto__", "a-b"));
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
    expect(Object.hasOwn(data, "a-b")).toBe(true);
  });
});

describe("readers", () => {
  const { data } = parseFrontMatter("---\\ntitle: T\\ntags: x\\nflag: true\\nlist: [a, b]\\n---\\n");

  it("read only the type they name", () => {
    expect(readString(data, "title")).toBe("T");
    expect(readString(data, "flag")).toBeUndefined();
    expect(readList(data, "list")).toEqual(["a", "b"]);
    expect(readList(data, "tags")).toEqual(["x"]);
    expect(readList(data, "missing")).toEqual([]);
    expect(readFlag(data, "flag")).toBe(true);
    expect(readFlag(data, "title")).toBe(false);
  });
});
`,
  "src/lib/front-matter.ts": `/** A value in front matter: text, a number, a boolean, or a list of text. */
export type FrontMatterValue = string | number | boolean | string[];

/** A Markdown file split into its front matter and its body. */
export interface FrontMatter {
  readonly data: Readonly<Record<string, FrontMatterValue>>;
  readonly body: string;
}

/** A problem in a front matter block, with the line it was found on (the first line of the file is 1). */
export class FrontMatterError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(\`Front matter, line \${line}: \${message}\`);
    this.name = "FrontMatterError";
    this.line = line;
  }
}

const KEY = /^[A-Za-z][A-Za-z0-9_-]*$/;
const NUMBER = /^-?\\d+(?:\\.\\d+)?$/;

function unquote(raw: string, line: number): string {
  const quote = raw[0];
  if (raw.length < 2 || raw[raw.length - 1] !== quote)
    throw new FrontMatterError("unterminated quote", line);
  const inner = raw.slice(1, -1);
  if (quote === "'") return inner.replaceAll("''", "'");
  try {
    return JSON.parse(raw) as string;
  } catch {
    throw new FrontMatterError("invalid escape in a double-quoted string", line);
  }
}

function scalar(raw: string, line: number): string | number | boolean {
  if (raw.startsWith('"') || raw.startsWith("'")) return unquote(raw, line);
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (NUMBER.test(raw)) return Number(raw);
  return raw;
}

function splitList(inner: string, line: number): string[] {
  const items: string[] = [];
  let current = "";
  let quote = "";
  for (const char of inner) {
    if (quote !== "") {
      current += char;
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ",") {
      items.push(current);
      current = "";
    } else current += char;
  }
  if (quote !== "") throw new FrontMatterError("unterminated quote", line);
  items.push(current);
  return items.map((item) => item.trim()).filter((item) => item !== "");
}

function value(raw: string, line: number): FrontMatterValue {
  if (raw.startsWith("[")) {
    if (!raw.endsWith("]")) throw new FrontMatterError("a list must end with ]", line);
    return splitList(raw.slice(1, -1), line).map((item) => String(scalar(item, line)));
  }
  return scalar(raw, line);
}

/**
 * Splits a Markdown file into front matter and body. Front matter is the block between two \`---\`
 * lines at the very start of the file. It holds one \`key: value\` per line; a value is text (bare or
 * in quotes), a number, \`true\` or \`false\`, or an inline list such as \`[news, "release notes"]\`. A
 * line that starts with \`#\` is a comment. A file without the block has no data and keeps its whole text.
 *
 * @param source The text of the file.
 * @returns The data and the body (the text after the closing line).
 * @throws FrontMatterError for an unclosed block, a line that is not \`key: value\`, a repeated key or a bad quote.
 */
export function parseFrontMatter(source: string): FrontMatter {
  const text = source.replace(/^﻿/, "").replaceAll("\\r\\n", "\\n");
  const lines = text.split("\\n");
  if (lines[0]?.trimEnd() !== "---") return { data: {}, body: text };
  const entries = new Map<string, FrontMatterValue>();
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const number = index + 1;
    if (line.trimEnd() === "---") {
      return { data: Object.fromEntries(entries), body: lines.slice(index + 1).join("\\n") };
    }
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const colon = line.indexOf(":");
    const key = colon === -1 ? "" : line.slice(0, colon).trim();
    if (!KEY.test(key)) throw new FrontMatterError("expected key: value", number);
    if (entries.has(key)) throw new FrontMatterError(\`the key "\${key}" appears twice\`, number);
    entries.set(key, value(line.slice(colon + 1).trim(), number));
  }
  throw new FrontMatterError("the block is not closed by a --- line", lines.length);
}

/** Reads a text value, or \`undefined\` when the key is missing or holds something else. */
export function readString(data: FrontMatter["data"], key: string): string | undefined {
  const found = data[key];
  return typeof found === "string" ? found : undefined;
}

/** Reads a list of text: a list value, or a single text value as a list of one. */
export function readList(data: FrontMatter["data"], key: string): string[] {
  const found = data[key];
  if (Array.isArray(found)) return found;
  return typeof found === "string" ? [found] : [];
}

/** Reads a boolean, \`false\` when the key is missing or holds something else. */
export function readFlag(data: FrontMatter["data"], key: string): boolean {
  return data[key] === true;
}
`,
  "src/lib/markdown.test.ts": `import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, plainText, safeHref } from "./markdown";

describe("parseInline", () => {
  it("reads code, strong, emphasis and links, nested", () => {
    expect(parseInline("a \`b\` **c *d*** [e](/f)")).toEqual([
      { type: "text", value: "a " },
      { type: "code", value: "b" },
      { type: "text", value: " " },
      {
        type: "strong",
        children: [
          { type: "text", value: "c " },
          { type: "em", children: [{ type: "text", value: "d" }] },
        ],
      },
      { type: "text", value: " " },
      { type: "link", href: "/f", children: [{ type: "text", value: "e" }] },
    ]);
  });

  it("keeps raw HTML, escapes and snake_case as text", () => {
    expect(parseInline("<b>x</b> \\\\*y\\\\* snake_case_word")).toEqual([
      { type: "text", value: "<b>x</b> *y* snake_case_word" },
    ]);
  });

  it("drops the address of an unsafe link and keeps its label", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ type: "text", value: "x" }]);
  });
});

describe("safeHref", () => {
  it("allows http, https, mailto and relative targets only", () => {
    for (const ok of [
      "https://a.example/b",
      "http://a.example",
      "mailto:a@b.example",
      "/a",
      "#top",
      "../b",
      "c",
    ]) {
      expect(safeHref(ok), ok).toBe(ok);
    }
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:1",
      "data:text/html,x",
      "//evil.example",
      "java\\tscript:1",
      "vbscript:x",
      "a b",
    ]) {
      expect(safeHref(bad), bad).toBeUndefined();
    }
  });
});

describe("parseMarkdown", () => {
  it("reads headings, paragraphs, lists, quotes, fences and rules", () => {
    const blocks = parseMarkdown(
      [
        "# Title",
        "",
        "one",
        "two",
        "",
        "- a",
        "- b",
        "  more",
        "",
        "1. x",
        "2. y",
        "",
        "> quoted",
        "",
        "\`\`\`ts",
        "const a = 1;",
        "\`\`\`",
        "",
        "---",
      ].join("\\n"),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "quote",
      "code",
      "rule",
    ]);
    expect(blocks[1]).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: "one two" }],
    });
    expect(blocks[2]).toMatchObject({
      ordered: false,
      items: [[{ value: "a" }], [{ value: "b more" }]],
    });
    expect(blocks[3]).toMatchObject({ ordered: true });
    expect(blocks[5]).toEqual({ type: "code", lang: "ts", value: "const a = 1;" });
  });

  it("closes an unterminated fence at the end of the text", () => {
    expect(parseMarkdown("\`\`\`\\nabc")).toEqual([{ type: "code", lang: "", value: "abc" }]);
  });

  it("gives the plain text of a document", () => {
    expect(plainText(parseMarkdown("# A\\n\\nb **c**\\n\\n- d"))).toBe("A b c d");
  });
});
`,
  "src/lib/markdown.ts": `/** Inline content: the parts of a line of text. */
export type Inline =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "code"; readonly value: string }
  | { readonly type: "strong"; readonly children: readonly Inline[] }
  | { readonly type: "em"; readonly children: readonly Inline[] }
  | { readonly type: "link"; readonly href: string; readonly children: readonly Inline[] };

/** A block of a document. */
export type Block =
  | {
      readonly type: "heading";
      readonly level: 1 | 2 | 3 | 4 | 5 | 6;
      readonly children: readonly Inline[];
    }
  | { readonly type: "paragraph"; readonly children: readonly Inline[] }
  | { readonly type: "code"; readonly lang: string; readonly value: string }
  | { readonly type: "quote"; readonly children: readonly Block[] }
  | {
      readonly type: "list";
      readonly ordered: boolean;
      readonly items: readonly (readonly Inline[])[];
    }
  | { readonly type: "rule" };

const SAFE_SCHEME = /^(?:https?|mailto):/i;
const ANY_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Checks the target of a link. A link may go to \`http:\`, \`https:\` or \`mailto:\`, or be relative (a
 * path, \`#section\`, \`?query\`). Everything else (\`javascript:\`, \`data:\`, ...) is refused, so a link in
 * a Markdown file can never run code.
 *
 * @param href The target as written.
 * @returns The target, or \`undefined\` when it is not allowed.
 */
export function safeHref(href: string): string | undefined {
  const target = href.trim();
  // Control characters and spaces can hide a scheme from a quick check (\`java\\tscript:\`).
  if (Array.from(target).some((char) => (char.codePointAt(0) ?? 0) <= 0x20 || char === "\\u007f")) {
    return undefined;
  }
  if (SAFE_SCHEME.test(target)) return target;
  return ANY_SCHEME.test(target) || target.startsWith("//") ? undefined : target;
}

const SPECIAL = /[\\\\\`*_[]/;

/** The index of the \`)\` that closes the \`(\` before \`from\`, counting nested pairs, or -1. */
function closingParen(text: string, from: number): number {
  let depth = 1;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function closing(text: string, marker: string, from: number): number {
  let at = text.indexOf(marker, from);
  while (at > 0 && text[at - 1] === "\\\\") at = text.indexOf(marker, at + 1);
  // A run of three closes the strong part with its last two characters (\`**a *b***\`).
  if (at !== -1 && marker.length === 2) while (text[at + 2] === marker[0]) at += 1;
  return at;
}

/**
 * Parses one run of text into inline nodes: \`code\`, \`**strong**\`, \`*emphasis*\` (or \`_emphasis_\`),
 * \`[text](target)\` and backslash escapes. Raw HTML is not recognized: it stays text.
 *
 * @param text A paragraph, heading or list item.
 * @returns The nodes, in order.
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  const flush = (): void => {
    if (plain !== "") out.push({ type: "text", value: plain });
    plain = "";
  };
  let index = 0;
  while (index < text.length) {
    const char = text[index] ?? "";
    if (!SPECIAL.test(char)) {
      plain += char;
      index += 1;
      continue;
    }
    if (char === "\\\\" && index + 1 < text.length) {
      plain += text[index + 1] ?? "";
      index += 2;
      continue;
    }
    if (char === "\`") {
      const end = text.indexOf("\`", index + 1);
      if (end > index + 1) {
        flush();
        out.push({ type: "code", value: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    } else if (char === "[") {
      const close = text.indexOf("](", index + 1);
      const end = close === -1 ? -1 : closingParen(text, close + 2);
      const href = end === -1 ? undefined : safeHref(text.slice(close + 2, end));
      if (close !== -1 && end !== -1) {
        flush();
        const label = parseInline(text.slice(index + 1, close));
        // A refused target keeps its label as plain text.
        if (href === undefined) out.push(...label);
        else out.push({ type: "link", href, children: label });
        index = end + 1;
        continue;
      }
    } else if (char !== "_" || !/\\w/.test(text[index - 1] ?? "")) {
      // An underscore inside a word (snake_case) is not emphasis.
      const strong = text.startsWith(char + char, index) && char !== "_";
      const marker = strong ? char + char : char;
      const end = closing(text, marker, index + marker.length);
      if (end > index + marker.length) {
        flush();
        const children = parseInline(text.slice(index + marker.length, end));
        out.push({ type: strong ? "strong" : "em", children });
        index = end + marker.length;
        continue;
      }
    }
    plain += char;
    index += 1;
  }
  flush();
  return out;
}

const HEADING = /^(#{1,6})\\s+(.*?)\\s*#*\\s*$/;
const RULE = /^(?:-{3,}|\\*{3,}|_{3,})\\s*$/;
const BULLET = /^\\s{0,3}[-*+]\\s+(.*)$/;
const NUMBERED = /^\\s{0,3}\\d{1,9}[.)]\\s+(.*)$/;
const FENCE = /^\\s{0,3}(\`{3,})\\s*([^\`\\s]*)\\s*$/;

function startsBlock(line: string): boolean {
  return (
    HEADING.test(line) ||
    RULE.test(line) ||
    FENCE.test(line) ||
    line.startsWith(">") ||
    BULLET.test(line) ||
    NUMBERED.test(line)
  );
}

/**
 * Parses a Markdown document into blocks: headings (\`#\`), paragraphs, fenced code, block quotes
 * (\`>\`), bullet and numbered lists, and rules (\`---\`). Raw HTML is not Markdown here: it is text.
 * A list item is one line, and a line that is indented further continues the item before it.
 *
 * @param source The Markdown text (the body of a file, front matter removed).
 * @returns The blocks, in order.
 */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replaceAll("\\r\\n", "\\n").split("\\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence !== null) {
      const ticks = fence[1] ?? "\`\`\`";
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith(ticks)) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", lang: fence[2] ?? "", value: body.join("\\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? "#").length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: "heading", level, children: parseInline(heading[2] ?? "") });
      index += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }
    if (line.startsWith(">")) {
      const quoted: string[] = [];
      while (index < lines.length && (lines[index] ?? "").startsWith(">")) {
        quoted.push((lines[index] ?? "").replace(/^>\\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", children: parseMarkdown(quoted.join("\\n")) });
      continue;
    }
    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      const items: Inline[][] = [];
      const pattern = ordered ? NUMBERED : BULLET;
      let item: string | undefined;
      while (index < lines.length) {
        const current = lines[index] ?? "";
        const match = pattern.exec(current);
        if (match !== null) {
          if (item !== undefined) items.push(parseInline(item));
          item = match[1] ?? "";
        } else if (item !== undefined && /^\\s{2,}\\S/.test(current)) item += \` \${current.trim()}\`;
        else break;
        index += 1;
      }
      if (item !== undefined) items.push(parseInline(item));
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      (paragraph.length === 0 || !startsBlock(lines[index] ?? ""))
    ) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}

function inlineText(nodes: readonly Inline[]): string {
  return nodes
    .map((node) =>
      node.type === "text" || node.type === "code" ? node.value : inlineText(node.children),
    )
    .join("");
}

/**
 * The text of a document without markup, for a word count or a summary.
 *
 * @param blocks The blocks from {@link parseMarkdown}.
 * @returns The text, blocks separated by a space.
 */
export function plainText(blocks: readonly Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "heading" || block.type === "paragraph")
      parts.push(inlineText(block.children));
    else if (block.type === "code") parts.push(block.value);
    else if (block.type === "quote") parts.push(plainText(block.children));
    else if (block.type === "list") parts.push(...block.items.map(inlineText));
  }
  return parts.join(" ");
}
`,
  "src/lib/rss.test.ts": `import { describe, expect, it } from "vitest";
import { escapeXml, rssXml } from "./rss";

describe("rssXml", () => {
  const feed = {
    title: "Notes & more",
    description: "A <test>",
    link: "https://example.com/",
    language: "en",
    items: [
      {
        title: "One",
        link: "https://example.com/posts/one?a=1&b=2",
        date: "2026-10-01",
        summary: 'It\\'s "fine"',
      },
    ],
  };

  it("writes an RSS 2.0 document with escaped values", () => {
    const xml = rssXml(feed);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\\n<rss version="2.0">')).toBe(
      true,
    );
    expect(xml).toContain("<title>Notes &amp; more</title>");
    expect(xml).toContain("<description>A &lt;test&gt;</description>");
    expect(xml).toContain(
      '<guid isPermaLink="true">https://example.com/posts/one?a=1&amp;b=2</guid>',
    );
    expect(xml).toContain("<pubDate>Thu, 01 Oct 2026 00:00:00 GMT</pubDate>");
    expect(xml).toContain("It&apos;s &quot;fine&quot;");
  });

  it("drops characters XML cannot hold", () => {
    expect(escapeXml("a\\u0000b\\u000Bc\\td")).toBe("abc\\td");
  });
});
`,
  "src/lib/rss.ts": `/** One entry of a feed. */
export interface FeedItem {
  title: string;
  /** The absolute address of the entry. */
  link: string;
  /** Publication day, \`YYYY-MM-DD\`. */
  date: string;
  summary: string;
}

/** The channel of a feed and its entries. */
export interface Feed {
  title: string;
  description: string;
  /** The absolute address of the site. */
  link: string;
  /** The language of the site (a BCP 47 tag). */
  language: string;
  items: readonly FeedItem[];
}

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/** True for a character XML 1.0 can hold: tab, line feed, carriage return, or anything from the space up. */
function isXmlCharacter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20;
}

/** Escapes the five characters XML reserves, and drops the control characters it cannot hold, so one stray byte cannot make the whole feed invalid. */
export function escapeXml(text: string): string {
  return Array.from(text)
    .filter(isXmlCharacter)
    .map((char) => ESCAPES[char] ?? char)
    .join("");
}

/**
 * Writes an RSS 2.0 document. Every value is escaped, and each entry's address doubles as its
 * permanent id.
 *
 * @param feed The channel and its entries.
 * @returns The XML text.
 */
export function rssXml(feed: Feed): string {
  const items = feed.items.map((item) =>
    [
      "    <item>",
      \`      <title>\${escapeXml(item.title)}</title>\`,
      \`      <link>\${escapeXml(item.link)}</link>\`,
      \`      <guid isPermaLink="true">\${escapeXml(item.link)}</guid>\`,
      \`      <pubDate>\${new Date(item.date).toUTCString()}</pubDate>\`,
      \`      <description>\${escapeXml(item.summary)}</description>\`,
      "    </item>",
    ].join("\\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    \`    <title>\${escapeXml(feed.title)}</title>\`,
    \`    <link>\${escapeXml(feed.link)}</link>\`,
    \`    <description>\${escapeXml(feed.description)}</description>\`,
    \`    <language>\${escapeXml(feed.language)}</language>\`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\\n");
}
`,
  "src/routes/[...rest].tsx": `import { notFound as raiseNotFound } from "@shadow-js/router";
import { NotFound } from "../components/NotFound";

/** Matches every URL no other route matches and answers it with a 404 and the not-found page. */
export const beforeLoad = () => {
  throw raiseNotFound();
};

export function notFound() {
  return <NotFound />;
}

export default function Missing() {
  return null;
}
`,
  "src/routes/_layout.tsx": `import type { Metadata, Viewport } from "@shadow-js/dusk";
import { A, Outlet, type RouteErrorProps } from "@shadow-js/router";
import { NotFound } from "../components/NotFound";
import { site } from "../site";

/** The document head of every page: the title template and the description; pages set their own title. */
export const metadata: Metadata = {
  title: { default: site.name, template: \`%s · \${site.name}\` },
  description: site.description,
  alternates: { types: { "application/rss+xml": "/rss.xml" } },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function Layout() {
  return (
    <>
      <header class="site-header">
        <A to="/" class="site-name">
          {site.name}
        </A>
        <nav class="site-nav" aria-label="Main">
          <A to="/posts">Posts</A>
          <A to="/about">About</A>
          <a href="/rss.xml">RSS</a>
        </nav>
      </header>
      <main class="site-main">
        <Outlet />
      </main>
      <footer class="site-footer">
        <span>{site.description}</span>
      </footer>
    </>
  );
}

/** Shown in place of a page whose loader or component threw. "Try again" renders it again. */
export function error(props: RouteErrorProps) {
  return (
    <section>
      <h1>Something went wrong</h1>
      <p>{props.error instanceof Error ? props.error.message : "Unexpected error"}</p>
      <button type="button" onClick={props.reset}>
        Try again
      </button>
    </section>
  );
}

/** The fallback when notFound() is called where no closer route shows its own page. */
export function notFound() {
  return <NotFound />;
}
`,
  "src/routes/about.tsx": `import type { Metadata } from "@shadow-js/dusk";

export const metadata: Metadata = { title: "About" };

export const prerender = true;

export default function About() {
  return (
    <section>
      <h1>About</h1>
      <p>
        Every post is a Markdown file in <code>content/</code>. The build reads the files, and the
        pages, the feed and the sitemap are made from them.
      </p>
    </section>
  );
}
`,
  "src/routes/index.tsx": `import type { Metadata } from "@shadow-js/dusk";
import { A, useLoaderData } from "@shadow-js/router";
import { PostList } from "../components/PostList";
import { listPosts } from "../server/posts";
import { site } from "../site";

export const metadata: Metadata = { title: { absolute: site.name } };

/** Built into a static page when you run the build. */
export const prerender = true;

export const loader = () => listPosts(undefined);

export default function Home() {
  const posts = useLoaderData<Awaited<ReturnType<typeof listPosts>>>();
  return (
    <section>
      <h1>{site.name}</h1>
      <p>{site.description}</p>
      <h2>Latest posts</h2>
      <PostList posts={(posts() ?? []).slice(0, 3)} />
      <p>
        <A to="/posts">All posts</A>
      </p>
    </section>
  );
}
`,
  "src/routes/posts/[slug].tsx": `import type { MetadataArgs } from "@shadow-js/dusk";
import { useLoaderData } from "@shadow-js/router";
import { Markdown } from "../../components/Markdown";
import { NotFound } from "../../components/NotFound";
import { directionOf } from "../../lib/direction";
import { getPost } from "../../server/posts";

export const loader = ({ params }: { params: { slug: string } }) => getPost({ slug: params.slug });

type PostArgs = MetadataArgs<{ slug: string }, { title: string; summary: string }>;

export const generateMetadata = ({ loaderData }: PostArgs) => ({
  title: loaderData?.title ?? "Post",
  description: loaderData?.summary,
});

/** Shown, with a 404, when getPost() calls notFound() for an unknown slug. */
export function notFound() {
  return <NotFound />;
}

export default function Post() {
  const post = useLoaderData<Awaited<ReturnType<typeof getPost>>>();
  return (
    <article lang={post()?.lang} dir={directionOf(post()?.lang ?? "en")}>
      <h1>{post()?.title}</h1>
      <p class="post-meta">
        <time datetime={post()?.date}>{post()?.date}</time> · {post()?.minutes} min read
      </p>
      <Markdown blocks={post()?.blocks ?? []} />
    </article>
  );
}
`,
  "src/routes/posts/index.tsx": `import type { Metadata } from "@shadow-js/dusk";
import { useLoaderData } from "@shadow-js/router";
import { PostList } from "../../components/PostList";
import { listPosts } from "../../server/posts";

export const metadata: Metadata = { title: "Posts" };

export const prerender = true;

export const loader = () => listPosts(undefined);

export default function Posts() {
  const posts = useLoaderData<Awaited<ReturnType<typeof listPosts>>>();
  return (
    <section>
      <h1>Posts</h1>
      <PostList posts={posts() ?? []} />
    </section>
  );
}
`,
  "src/routes/robots.txt.ts": `import { robotsRoute } from "@shadow-js/dusk/server";

/** GET /robots.txt: every crawler may read everything; the sitemap is named. */
export const GET = robotsRoute((event) => ({
  rules: { userAgent: "*", allow: "/" },
  sitemap: \`\${event.url.origin}/sitemap.xml\`,
}));
`,
  "src/routes/rss.xml.ts": `import { type RequestEvent, text } from "@shadow-js/dusk/server";
import { rssXml } from "../lib/rss";
import { allPosts } from "../server/posts.server";
import { site } from "../site";

/** GET /rss.xml: the feed of the posts, newest first. */
export const GET = (event: RequestEvent) => {
  const { origin } = event.url;
  const xml = rssXml({
    title: site.name,
    description: site.description,
    link: \`\${origin}/\`,
    language: process.env.SITE_LOCALE ?? "en",
    items: allPosts().map((post) => ({
      title: post.title,
      link: \`\${origin}/posts/\${post.slug}\`,
      date: post.date,
      summary: post.summary,
    })),
  });
  return text(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
};
`,
  "src/routes/sitemap.xml.ts": `import { sitemapRoute } from "@shadow-js/dusk/server";
import { allPosts } from "../server/posts.server";

/** GET /sitemap.xml: the pages and every post, with the day each post was published. */
export const GET = sitemapRoute((event) => [
  { url: \`\${event.url.origin}/\`, changeFrequency: "weekly", priority: 1 },
  { url: \`\${event.url.origin}/posts\`, changeFrequency: "weekly" },
  { url: \`\${event.url.origin}/about\` },
  ...allPosts().map((post) => ({
    url: \`\${event.url.origin}/posts/\${post.slug}\`,
    lastModified: post.date,
  })),
]);
`,
  "src/server/metadata-routes.test.ts": `// @vitest-environment node
import { createTestEvent } from "@shadow-js/dusk/testing";
import { describe, expect, it } from "vitest";
import { GET as robots } from "../routes/robots.txt";
import { GET as feed } from "../routes/rss.xml";
import { GET as sitemap } from "../routes/sitemap.xml";
import { allPosts } from "./posts.server";

const event = () => createTestEvent({ url: "https://example.com/" });

/** The route helpers answer a Response; narrow the handler's wider return type. */
async function responseOf(answer: unknown): Promise<Response> {
  const value = await answer;
  if (!(value instanceof Response)) throw new Error("The route did not answer with a Response.");
  return value;
}

describe("metadata routes", () => {
  it("answers the feed with one item per post", async () => {
    const response = await responseOf(feed(event()));
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    expect((await response.text()).match(/<item>/g)?.length).toBe(allPosts().length);
  });

  it("lists every page and post in the sitemap, on the host of the request", async () => {
    const xml = await (await responseOf(sitemap(event()))).text();
    expect(xml).toContain("<loc>https://example.com/</loc>");
    for (const post of allPosts())
      expect(xml).toContain(\`<loc>https://example.com/posts/\${post.slug}</loc>\`);
  });

  it("allows crawlers and names the sitemap", async () => {
    const text = await (await responseOf(robots(event()))).text();
    expect(text).toContain("User-Agent: *");
    expect(text).toContain("Sitemap: https://example.com/sitemap.xml");
  });
});
`,
  "src/server/posts.server.ts": `import { parseFrontMatter, readFlag, readList, readString } from "../lib/front-matter";
import { type Block, parseMarkdown, plainText } from "../lib/markdown";

/** A post summary: everything but the body. */
export interface PostSummary {
  slug: string;
  title: string;
  /** Publication day, \`YYYY-MM-DD\`. */
  date: string;
  summary: string;
  /** The language of the post (a BCP 47 tag). */
  lang: string;
  tags: string[];
  /** Whole minutes to read, at 200 words a minute. */
  minutes: number;
}

/** A post: its summary and its body as Markdown blocks. */
export interface Post extends PostSummary {
  blocks: Block[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY = /^\\d{4}-\\d{2}-\\d{2}$/;

/** Every file in \`content/\`, read at build time: the text goes into the server bundle, nothing is read at run time. */
const files = import.meta.glob<string>("../../content/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function load(path: string, source: string): Post | undefined {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const slug = file.replace(/\\.md$/, "");
  if (!SLUG.test(slug))
    throw new Error(\`content/\${file}: the file name must be lowercase words joined by hyphens.\`);
  const { data, body } = parseFrontMatter(source);
  if (readFlag(data, "draft")) return undefined;
  const title = readString(data, "title");
  const date = readString(data, "date");
  if (title === undefined || title === "")
    throw new Error(\`content/\${file}: front matter needs a title.\`);
  if (date === undefined || !DAY.test(date) || Number.isNaN(Date.parse(date))) {
    throw new Error(\`content/\${file}: front matter needs a date written as YYYY-MM-DD.\`);
  }
  const blocks = parseMarkdown(body);
  const words = plainText(blocks).split(/\\s+/).filter(Boolean).length;
  return {
    slug,
    title,
    date,
    summary: readString(data, "summary") ?? "",
    lang: readString(data, "lang") ?? process.env.SITE_LOCALE ?? "en",
    tags: readList(data, "tags"),
    minutes: Math.max(1, Math.round(words / 200)),
    blocks,
  };
}

const posts: Post[] = Object.entries(files)
  .map(([path, source]) => load(path, source))
  .filter((post): post is Post => post !== undefined)
  .sort((a, b) =>
    a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date),
  );

/** Every published post, newest first. A file with \`draft: true\` is left out. */
export function allPosts(): Post[] {
  return posts;
}

/** One post by the name of its file, or \`undefined\`. */
export function findPost(slug: string): Post | undefined {
  return posts.find((post) => post.slug === slug);
}

/** A post without its body. */
export function summaryOf(post: Post): PostSummary {
  const { blocks: _blocks, ...summary } = post;
  return summary;
}
`,
  "src/server/posts.test.ts": `// @vitest-environment node
import { isNotFound } from "@shadow-js/dusk/server";
import { createTestEvent } from "@shadow-js/dusk/testing";
import { describe, expect, it } from "vitest";
import { getPost, listPosts } from "./posts";
import { allPosts } from "./posts.server";

describe("posts", () => {
  it("loads every file in content/, newest first, and leaves drafts out", () => {
    const dates = allPosts().map((post) => post.date);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(allPosts().every((post) => post.title !== "" && post.blocks.length > 0)).toBe(true);
  });

  it("lists summaries without bodies through the server function", async () => {
    const list = await listPosts.invoke(undefined, createTestEvent());
    expect(list.length).toBe(allPosts().length);
    expect(list[0]).not.toHaveProperty("blocks");
  });

  it("reads one post and answers an unknown slug with notFound()", async () => {
    const slug = allPosts()[0]?.slug ?? "";
    const post = await getPost.invoke({ slug }, createTestEvent());
    expect(post.blocks.length).toBeGreaterThan(0);
    await expect(getPost.invoke({ slug: "no-such-post" }, createTestEvent())).rejects.toSatisfy(
      isNotFound,
    );
    await expect(getPost.invoke({ slug: "" }, createTestEvent())).rejects.toMatchObject({
      status: 400,
    });
  });

  it("gives the Arabic sample its language, so the page can take its direction from it", () => {
    expect(allPosts().find((post) => post.slug === "marhaba")?.lang).toBe("ar");
  });
});
`,
  "src/server/posts.ts": `import { notFound, serverFn } from "@shadow-js/dusk/server";
import { allPosts, findPost, summaryOf } from "./posts.server";
import { defineSchema, type Issue, stringField } from "./schema";

const postSlug = defineSchema<{ slug: string }>((input) => {
  const issues: Issue[] = [];
  const slug = stringField(input, "slug", 80, issues);
  return issues.length > 0 ? { issues } : { value: { slug } };
});

/** Lists the posts, newest first, without their bodies. GET: safe to call from a loader or to cache. */
export const listPosts = serverFn({ method: "GET" }, () => allPosts().map(summaryOf));

/** Reads one post with its body; an unknown slug renders the not-found page with status 404. */
export const getPost = serverFn({ method: "GET", input: postSlug }, ({ slug }) => {
  const post = findPost(slug);
  if (post === undefined) throw notFound();
  return post;
});
`,
  "src/server/schema.ts": `import type { StandardSchemaV1 } from "@shadow-js/dusk/server";

/** One problem found while validating input. */
export interface Issue {
  message: string;
  path?: string[];
}

/**
 * Builds a Standard Schema, the interface Zod, Valibot and ArkType also implement, so a server
 * function can take any of them as its \`input\`. This one has no dependency; swap it for a library
 * when your inputs grow.
 */
export function defineSchema<Output>(
  check: (input: unknown) => { value: Output } | { issues: Issue[] },
): StandardSchemaV1<unknown, Output> {
  return { "~standard": { version: 1, vendor: "app", validate: check } };
}

/** Reads a string field of an unknown value, trimmed, or reports why it is not usable. */
export function stringField(input: unknown, name: string, max: number, issues: Issue[]): string {
  const value: unknown =
    typeof input === "object" && input !== null ? Reflect.get(input, name) : undefined;
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ message: "Required", path: [name] });
    return "";
  }
  if (value.length > max) issues.push({ message: \`At most \${max} characters\`, path: [name] });
  return value.trim();
}
`,
});
