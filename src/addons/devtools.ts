import { addDevDependency, type Draft } from "../templates/shared";

/**
 * The reactive-graph inspector. It is a development dependency: the call that mounts it sits in
 * the entry file behind `import.meta.env.DEV`, so a production build contains none of it.
 *
 * @since 1.0.0
 */
export function applyDevtools(draft: Draft): void {
  addDevDependency(draft, "@shadow-js/devtools");
  draft.sections.push({
    heading: "Devtools",
    body: "In development a launcher button opens the inspector; `Alt+Shift+D` toggles it. It is imported only when `import.meta.env.DEV` is true, so the production build does not contain it.",
  });
}
