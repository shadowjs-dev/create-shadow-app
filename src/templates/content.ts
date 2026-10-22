import { CONTENT_FILES } from "./content-files";
import { applyDuskBase } from "./dusk";
import type { Draft } from "./shared";
import { addFiles, appSource, siteName } from "./starters";

/** The description under the site name, in the header data and in the feed. */
const DESCRIPTION = "Notes written in Markdown, built into static pages.";

const README = `Every post is a Markdown file in \`content/\`. The build reads the folder, and the pages, the RSS feed (\`/rss.xml\`), the sitemap (\`/sitemap.xml\`) and \`robots.txt\` are made from it. There is no database and nothing is read from disk at run time.

- A file starts with front matter between two \`---\` lines: \`title\` and \`date\` (\`YYYY-MM-DD\`) are required; \`summary\`, \`tags\` (a list), \`lang\` and \`draft: true\` are optional. The parser is \`src/lib/front-matter.ts\` and the Markdown reader is \`src/lib/markdown.ts\`: both are small, tested and yours to change. Raw HTML in a post is shown as text, and a link to \`javascript:\` is dropped.
- \`dusk build\` prerenders \`/\`, \`/posts\` and \`/about\`, follows their links and writes a static page for every post. The Node server (\`dist/node/server.mjs\`) serves those files and the three feeds.
- The page direction comes from the locale: set \`SITE_LOCALE\` (for example \`ar\`) before you build and \`<html lang dir>\` follows it; a post with \`lang: ar\` is drawn right to left inside any page. The stylesheet uses logical properties (\`margin-inline\`, \`padding-inline-start\`) so both directions look right.
- To add a page, add a file to \`src/routes\`. To change the site name, edit \`src/site.ts\`.`;

/** Applies the `content` template to a draft. @since 1.0.0 */
export function applyContent(draft: Draft): void {
  const { files, options } = draft;
  applyDuskBase(draft);
  addFiles(draft, CONTENT_FILES);
  files.set(
    "src/site.ts",
    [
      "/** The name and the description of the site: the header, the feed and the page titles use them. */",
      "export const site = {",
      `  name: ${JSON.stringify(siteName(options.name))},`,
      `  description: ${JSON.stringify(DESCRIPTION)},`,
      "} as const;",
      "",
    ].join("\n"),
  );
  files.set("src/app.tsx", appSource(draft, ["./index.css"]));
  if (options.tailwind) {
    files.set("src/index.css", `@import "tailwindcss";\n\n${files.get("src/index.css") ?? ""}`);
  }
  draft.env.push({
    name: "SITE_LOCALE",
    comment:
      "The language of the site (a BCP 47 tag such as en or ar). It sets <html lang> and the page direction.",
    example: "en",
  });
  draft.sections.push({ heading: "Content", body: README });
}
