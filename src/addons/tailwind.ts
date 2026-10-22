import { addDevDependency, type Draft } from "../templates/shared";

/**
 * Tailwind CSS 4 through its Vite plugin: no `tailwind.config`, no PostCSS file. The stylesheet
 * (`@import "tailwindcss";`) and the plugin entry are written by the template, which knows where
 * its CSS and Vite config live.
 *
 * @since 1.0.0
 */
export function applyTailwind(draft: Draft): void {
  addDevDependency(draft, "tailwindcss");
  addDevDependency(draft, "@tailwindcss/vite");
}
