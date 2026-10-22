import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { PACKAGE_MANAGERS, type PackageManager } from "./options";

/** Which package manager runs the install, and how. */

/**
 * Reads the package manager from `npm_config_user_agent`, which `npm create`, `pnpm create`,
 * `yarn create` and `bun create` set (`pnpm/9.1.0 npm/? node/v22 darwin arm64`).
 *
 * @param userAgent The variable's value.
 * @returns The manager, or `undefined` when it is not one of the supported ones.
 * @example
 * managerFromUserAgent("pnpm/9.1.0 npm/? node/v22.12.0 linux x64"); // "pnpm"
 * @since 1.0.0
 */
export function managerFromUserAgent(userAgent: string | undefined): PackageManager | undefined {
  if (userAgent === undefined) return undefined;
  const name = userAgent.split(" ")[0]?.split("/")[0];
  return PACKAGE_MANAGERS.find((manager) => manager === name);
}

const LOCKFILES: readonly (readonly [string, PackageManager])[] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

/**
 * Looks for a lockfile in a directory and its parents, nearest first.
 *
 * @param start Directory to start from.
 * @returns The manager that owns the nearest lockfile, or `undefined`.
 * @since 1.0.0
 */
export function managerFromLockfile(start: string): PackageManager | undefined {
  let dir = start;
  for (;;) {
    for (const [file, manager] of LOCKFILES) {
      if (existsSync(join(dir, file))) return manager;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Chooses the package manager: the `--pm` flag, then the one that launched the command, then the
 * lockfile around the working directory, then npm.
 *
 * @param flag Value of `--pm`, already validated.
 * @param env The environment variables.
 * @param cwd The working directory.
 * @returns The manager to use.
 * @since 1.0.0
 */
export function detectPackageManager(
  flag: PackageManager | undefined,
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
): PackageManager {
  return (
    flag ?? managerFromUserAgent(env["npm_config_user_agent"]) ?? managerFromLockfile(cwd) ?? "npm"
  );
}

/** The program and arguments that install dependencies. @since 1.0.0 */
export function installInvocation(packageManager: PackageManager): {
  command: string;
  args: string[];
} {
  return { command: packageManager, args: ["install"] };
}
