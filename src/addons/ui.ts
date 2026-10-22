import {
  addDependency,
  addDevDependency,
  type Draft,
  execCommand,
  json,
  lines,
  needNodeTypes,
} from "../templates/shared";
import { UI_UTILS_SOURCE } from "./ui-utils";

/**
 * Scaffolding for `shadow-ui`, the copy-paste component kit: `components.json` (where the CLI puts
 * components and which stylesheet holds the theme), the `cn()` helper every component imports
 * (the registry's own `utils` file), the `@/` import alias and the theme stylesheets. No component is written here and nothing is
 * imported from `@shadow-js/ui`; components arrive with `shadow-ui add <name>`.
 *
 * @since 1.0.0
 */
export function applyUi(draft: Draft): void {
  const { options, files } = draft;
  addDependency(draft, "clsx");
  addDependency(draft, "tailwind-merge");
  addDependency(draft, "class-variance-authority");
  addDependency(draft, "@shadow-js/primitives");
  addDevDependency(draft, "@shadow-js/ui");
  needNodeTypes(draft);
  const existing = draft.tsconfig.compilerOptions["paths"];
  draft.tsconfig.compilerOptions["paths"] = {
    ...(typeof existing === "object" && existing !== null ? existing : {}),
    "@/*": ["./src/*"],
  };
  files.set(
    "components.json",
    json({
      style: "default",
      tsx: true,
      tailwind: { css: "src/index.css", baseColor: "neutral", cssVariables: true },
      aliases: {
        components: "@/components",
        ui: "@/components/ui",
        lib: "@/lib",
        utils: "@/lib/utils",
        hooks: "@/hooks",
      },
    }),
  );
  // The registry's own file, byte for byte: `shadow-ui add` compares against it, so anything else
  // makes the first `add` report a difference and exit 1.
  files.set("src/lib/utils.ts", UI_UTILS_SOURCE);
  files.set(
    "src/index.css",
    lines([
      '@import "tailwindcss";',
      '@import "@shadow-js/ui/theme.css";',
      '@import "@shadow-js/ui/animations.css";',
    ]),
  );
  const run = execCommand(options.packageManager);
  draft.sections.push({
    heading: "UI components",
    body: `Components are copied into \`src/components/ui\` so you own them: \`${run} shadow-ui add button\`. The theme (colors, radius, dark mode) is imported in \`src/index.css\`; \`@/\` points at \`src/\`. \`cn()\` in \`src/lib/utils.ts\` merges class names.`,
  });
}
