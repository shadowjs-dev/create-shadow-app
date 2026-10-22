import { CODEMOD_NAMES } from "./codemod-names";
import { ADAPTERS, ADDONS, PACKAGE_MANAGERS, TEMPLATES } from "./options";

/**
 * The shell completion scripts of `create-shadow-app completion <shell>`. The flags and their values come from the same
 * tables the parser reads (`TEMPLATES`, `ADAPTERS`, `PACKAGE_MANAGERS`, `ADDONS`), so a template or an add-on added there
 * is completed with no change here. The scripts are static: printing one runs nothing and reads no file.
 */

/** The shells `create-shadow-app completion` writes a script for. @since 1.0.0 */
export const COMPLETION_SHELLS = ["bash", "zsh", "fish"] as const;

/** One of the shells {@link COMPLETION_SHELLS} lists. @since 1.0.0 */
export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

/**
 * The words after `create-shadow-app` that are commands and not a project directory. A directory with one of these
 * names is written `./name`.
 * @since 1.0.0
 */
export const COMMAND_NAMES: readonly string[] = Object.freeze(["completion", "codemod"]);

/** The shells as a phrase for messages: `bash, zsh or fish`. @since 1.0.0 */
export const SHELL_CHOICES: string = `${COMPLETION_SHELLS.slice(0, -1).join(", ")} or ${COMPLETION_SHELLS[COMPLETION_SHELLS.length - 1]}`;

/**
 * Tells whether a word names one of the shells.
 * @param value The word from the command line, if any.
 * @returns True for `bash`, `zsh` or `fish`.
 * @since 1.0.0
 */
export function isCompletionShell(value: string | undefined): value is CompletionShell {
  return value !== undefined && (COMPLETION_SHELLS as readonly string[]).includes(value);
}

/** What a flag takes after it: nothing, a choice of words, a directory, or free text. @internal */
type Takes =
  | { readonly kind: "none" }
  | { readonly kind: "choice"; readonly words: readonly string[] }
  | { readonly kind: "directory" }
  | { readonly kind: "text" };

/** One flag of the command, as the scripts offer it. @internal */
interface FlagSpec {
  /** The long name without the dashes. */
  readonly long: string;
  /** The short letter, if there is one. */
  readonly short?: string;
  readonly takes: Takes;
  readonly text: string;
}

const NONE: Takes = { kind: "none" };

/** Every flag the parser accepts: the fixed ones, then `--x` and `--no-x` for each add-on and the router. @internal */
function flagSpecs(): readonly FlagSpec[] {
  const fixed: FlagSpec[] = [
    {
      long: "template",
      short: "t",
      takes: { kind: "choice", words: TEMPLATES },
      text: "The template.",
    },
    {
      long: "adapter",
      takes: { kind: "choice", words: ADAPTERS },
      text: "The deployment target of the dusk template.",
    },
    { long: "name", takes: { kind: "text" }, text: "The npm package name." },
    {
      long: "pm",
      takes: { kind: "choice", words: PACKAGE_MANAGERS },
      text: "The package manager.",
    },
    { long: "local", takes: { kind: "directory" }, text: "Use the tarballs in a pack directory." },
    {
      long: "pack-root",
      takes: { kind: "directory" },
      text: "Use the pack directory of a ShadowJS repository.",
    },
    { long: "yes", short: "y", takes: NONE, text: "Accept the defaults, ask nothing." },
    { long: "install", takes: NONE, text: "Install dependencies." },
    { long: "no-install", takes: NONE, text: "Do not install dependencies." },
    { long: "git", takes: NONE, text: "Run git init." },
    { long: "no-git", takes: NONE, text: "Do not run git init." },
    { long: "force", takes: NONE, text: "Write into a directory that is not empty." },
    { long: "dry-run", takes: NONE, text: "Show what would be written; write nothing." },
    { long: "allow-outside", takes: NONE, text: "Permit a directory outside the current one." },
    { long: "json", takes: NONE, text: "Print one JSON document on stdout instead of words." },
    { long: "help", short: "h", takes: NONE, text: "Show the help." },
    { long: "version", short: "v", takes: NONE, text: "Show the version." },
  ];
  const toggles: FlagSpec[] = [...ADDONS.map((addon) => addon.name as string), "router"].flatMap(
    (name) => [
      { long: name, takes: NONE, text: `Add ${name}.` },
      { long: `no-${name}`, takes: NONE, text: `Leave out ${name}.` },
    ],
  );
  return [...fixed, ...toggles];
}

/** The completion script of one shell: print it and load it as its header comment says. @since 1.0.0
 * @param shell The shell the script is for.
 * @returns The script, ending with a newline.
 * @example completionScript("fish").startsWith("# fish completion for create-shadow-app"); // true
 */
export function completionScript(shell: CompletionShell): string {
  switch (shell) {
    case "bash":
      return bashScript(flagSpecs());
    case "zsh":
      return zshScript(flagSpecs());
    case "fish":
      return fishScript(flagSpecs());
  }
}

/** `-t --template` style names of a flag. @internal */
function names(flag: FlagSpec): string[] {
  return [...(flag.short === undefined ? [] : [`-${flag.short}`]), `--${flag.long}`];
}

function choiceFlags(
  flags: readonly FlagSpec[],
): readonly (FlagSpec & { readonly words: readonly string[] })[] {
  const out: (FlagSpec & { readonly words: readonly string[] })[] = [];
  for (const flag of flags)
    if (flag.takes.kind === "choice") out.push({ ...flag, words: flag.takes.words });
  return out;
}

/** The bash script: a `complete -F` function with `-o default`, so a directory completes as a file does. @internal */
function bashScript(flags: readonly FlagSpec[]): string {
  const all = flags.flatMap(names).join(" ");
  const cases = choiceFlags(flags).map(
    (flag) =>
      `    ${names(flag).join("|")}) COMPREPLY=( $(compgen -W "${flag.words.join(" ")}" -- "$cur") ); return 0 ;;`,
  );
  return [
    "# bash completion for create-shadow-app. Save it in your bash-completion directory as create-shadow-app,",
    "# or run: source <(create-shadow-app completion bash)",
    "_create_shadow_app() {",
    "  local cur prev",
    "  COMPREPLY=()",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is bash parameter expansion, not JavaScript
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is bash parameter expansion, not JavaScript
    '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is bash parameter expansion, not JavaScript
    '  if [ "${COMP_WORDS[1]}" = "completion" ]; then',
    '    if [ "$COMP_CWORD" -eq 2 ]; then',
    `      COMPREPLY=( $(compgen -W "${COMPLETION_SHELLS.join(" ")}" -- "$cur") )`,
    '    elif [[ "$cur" == -* ]]; then',
    '      COMPREPLY=( $(compgen -W "--json --help" -- "$cur") )',
    "    fi",
    "    return 0",
    "  fi",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is bash parameter expansion, not JavaScript
    '  if [ "${COMP_WORDS[1]}" = "codemod" ]; then',
    '    if [ "$COMP_CWORD" -eq 2 ]; then',
    `      COMPREPLY=( $(compgen -W "${CODEMOD_NAMES.join(" ")}" -- "$cur") )`,
    '    elif [[ "$cur" == -* ]]; then',
    '      COMPREPLY=( $(compgen -W "--dry-run --write --json --help" -- "$cur") )',
    "    fi",
    "    return 0",
    "  fi",
    '  case "$prev" in',
    ...cases,
    "  esac",
    '  if [[ "$cur" == -* ]]; then',
    `    COMPREPLY=( $(compgen -W "${all}" -- "$cur") )`,
    '  elif [ "$COMP_CWORD" -eq 1 ]; then',
    `    COMPREPLY=( $(compgen -W "${COMMAND_NAMES.join(" ")}" -- "$cur") )`,
    "  fi",
    "  return 0",
    "}",
    "complete -o default -F _create_shadow_app create-shadow-app",
    "",
  ].join("\n");
}

/** A zsh single-quoted word. @internal */
function zshQuote(text: string): string {
  return `'${text.replace(/'/g, "'\\''")}'`;
}

/** The explanation of a zsh `_arguments` spec: brackets and backslashes escaped. @internal */
function zshExplain(text: string): string {
  return text.replace(/[\\[\]]/g, "\\$&");
}

/** The `_arguments` specs of the flags, one per name. @internal */
function zshSpecs(flags: readonly FlagSpec[]): string[] {
  return flags.flatMap((flag) =>
    names(flag).map((name) => {
      const takes = flag.takes;
      const argument =
        takes.kind === "choice"
          ? `:${flag.long}:(${takes.words.join(" ")})`
          : takes.kind === "directory"
            ? `:${flag.long}:_files -/`
            : takes.kind === "text"
              ? `:${flag.long}:`
              : "";
      return zshQuote(`${name}[${zshExplain(flag.text)}]${argument}`);
    }),
  );
}

/** The zsh script: a `#compdef` function with `_arguments` for the flags and the directory. @internal */
function zshScript(flags: readonly FlagSpec[]): string {
  return [
    "#compdef create-shadow-app",
    "# zsh completion for create-shadow-app. Save it as _create-shadow-app in a folder on $fpath, or load it with:",
    "# source <(create-shadow-app completion zsh)",
    "# It needs compinit to have run first.",
    "_create_shadow_app() {",
    "  if [[ $words[2] == completion ]]; then",
    "    if (( CURRENT == 3 )); then",
    `      compadd -- ${COMPLETION_SHELLS.join(" ")}`,
    "    else",
    `      _arguments ${zshQuote("--json[Print JSON on stdout instead of words.]")}`,
    "    fi",
    "    return",
    "  fi",
    "  if [[ $words[2] == codemod ]]; then",
    "    if (( CURRENT == 3 )); then",
    `      compadd -- ${CODEMOD_NAMES.join(" ")}`,
    "    else",
    `      _arguments ${["--dry-run[Print a diff and write nothing.]", "--write[Apply the changes.]", "--json[Print JSON on stdout instead of words.]", "*:path:_files"].map(zshQuote).join(" ")}`,
    "    fi",
    "    return",
    "  fi",
    "  if (( CURRENT == 2 )) && [[ $PREFIX != -* ]]; then",
    `    _alternative ${zshQuote(`commands:command:(${COMMAND_NAMES.join(" ")})`)} ${zshQuote("directories:directory:_files -/")}`,
    "    return",
    "  fi",
    "  _arguments -s \\",
    `    ${[...zshSpecs(flags), zshQuote("1:directory:_files -/")].join(" \\\n    ")}`,
    "}",
    "",
    'if [ "$funcstack[1]" = "_create_shadow_app" ]; then',
    '  _create_shadow_app "$@"',
    "else",
    "  compdef _create_shadow_app create-shadow-app",
    "fi",
    "",
  ].join("\n");
}

/** A fish single-quoted string. @internal */
function fishQuote(text: string): string {
  return `'${text.replace(/[\\']/g, "\\$&")}'`;
}

/** The fish script: `complete` lines; the directory completes as a file does, the values of a flag as words. @internal */
function fishScript(flags: readonly FlagSpec[]): string {
  const lines = [
    "# fish completion for create-shadow-app. Save it as ~/.config/fish/completions/create-shadow-app.fish,",
    "# or run: create-shadow-app completion fish | source",
  ];
  const commandText: Readonly<Record<string, string>> = {
    completion: "Print a shell completion script.",
    codemod: "Migrate React, Solid or Next.js code to ShadowJS.",
  };
  for (const command of COMMAND_NAMES) {
    lines.push(
      `complete -c create-shadow-app -n '__fish_use_subcommand' -f -a ${command} -d ${fishQuote(commandText[command] ?? command)}`,
    );
  }
  lines.push(
    `complete -c create-shadow-app -n '__fish_seen_subcommand_from completion' -f -a ${fishQuote(COMPLETION_SHELLS.join(" "))}`,
    `complete -c create-shadow-app -n '__fish_seen_subcommand_from codemod; and not __fish_seen_subcommand_from ${CODEMOD_NAMES.join(" ")}' -f -a ${fishQuote(CODEMOD_NAMES.join(" "))}`,
    `complete -c create-shadow-app -n '__fish_seen_subcommand_from codemod' -l write -d ${fishQuote("Apply the changes.")}`,
  );
  for (const flag of flags) {
    const parts = [`-l ${flag.long}`, ...(flag.short === undefined ? [] : [`-s ${flag.short}`])];
    const takes = flag.takes;
    if (takes.kind === "choice") parts.push("-r", "-f", `-a ${fishQuote(takes.words.join(" "))}`);
    else if (takes.kind === "text") parts.push("-r", "-f");
    else if (takes.kind === "directory") parts.push("-r", "-F");
    lines.push(`complete -c create-shadow-app ${parts.join(" ")} -d ${fishQuote(flag.text)}`);
  }
  return `${lines.join("\n")}\n`;
}
