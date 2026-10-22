import { packageNameProblem } from "./names";
import type { ScaffoldOptions } from "./options";
import { buildProject } from "./project";
import { writeProject } from "./writer";

export { isValidPackageName, toPackageName } from "./names";

/** What {@link scaffold} wrote. @since 1.0.0 */
export interface ScaffoldResult {
  directory: string;
  files: string[];
}

/**
 * Writes a new project into `directory`. Refuses to touch an existing non-empty directory.
 *
 * @param directory Where to write; created when missing.
 * @param options What to generate.
 * @returns The absolute directory and the relative paths written.
 * @throws Error when the directory is not empty or the name is invalid (the message says why).
 * @example
 * scaffold("my-app", { name: "my-app", template: "dusk", tailwind: true });
 * @since 1.0.0
 */
export function scaffold(directory: string, options: ScaffoldOptions): ScaffoldResult {
  const problem = packageNameProblem(options.name);
  if (problem !== undefined) throw new Error(problem);
  const project = buildProject(options);
  return writeProject(directory, project.files, { force: false });
}
