import { readFileSync } from "node:fs";
import { defineConfig } from "tsdown";

const pkg = JSON.parse(readFileSync(`${import.meta.dirname}/package.json`, "utf8"));

// One flat build: `dist/cli.js` is what `bin` points at and starts fast because it has no
// dependency to load. The library entry (`dist/index.js`) shares its code with the command.
export default defineConfig({
  entry: { index: "src/index.ts", cli: "src/cli.ts" },
  outDir: "dist",
  format: "esm",
  platform: "node",
  target: "node22",
  dts: true,
  clean: true,
  fixedExtension: false,
  sourcemap: false,
  define: { __VERSION__: JSON.stringify(pkg.version) },
});
