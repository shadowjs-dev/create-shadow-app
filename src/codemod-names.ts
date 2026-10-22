/**
 * The names `create-shadow-app codemod` accepts. Kept apart from the codemods themselves so the shell completion
 * scripts can list them without loading the parser code.
 */

/**
 * The names `create-shadow-app codemod` accepts.
 * @since 1.0.0
 */
export const CODEMOD_NAMES: readonly [
  "react-to-shadow",
  "preact-to-shadow",
  "solid-to-shadow",
  "next-router-to-shadow",
  "react-router-to-shadow",
] = [
  "react-to-shadow",
  "preact-to-shadow",
  "solid-to-shadow",
  "next-router-to-shadow",
  "react-router-to-shadow",
];

/** One of the {@link CODEMOD_NAMES}. @since 1.0.0 */
export type CodemodName = (typeof CODEMOD_NAMES)[number];

/**
 * Tells whether a word names a codemod.
 * @param value The word from the command line.
 * @returns True for a name in {@link CODEMOD_NAMES}.
 * @since 1.0.0
 */
export function isCodemodName(value: string): value is CodemodName {
  return (CODEMOD_NAMES as readonly string[]).includes(value);
}
