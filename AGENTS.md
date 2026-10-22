# AGENTS.md: working on create-shadow-app

This file is for anyone who changes this repository, people and coding agents alike. It says how the repository is laid out, how to implement
and test a change, and how a pull request is reviewed. To **use** the released package, read [README.md](README.md) and [SKILL.md](SKILL.md)
instead; to take part in the project, read [CONTRIBUTING.md](CONTRIBUTING.md).

Project scaffolding: npm create shadow-app.

## What is in this repository

| Package | Folder | What it is | Documentation |
| --- | --- | --- | --- |
| `create-shadow-app` | `.` | Create a new app from a starter template, with optional Tailwind, Biome, Vitest, Convex and Clerk | https://create.shadowjs.net |

The repository is the package: `create-shadow-app`. Source and issues:
https://github.com/shadowjs-dev/create-shadow-app. Every package of the project has the same version number.

## Set up

You need Node.js 22.12 or newer and npm (pnpm and Yarn are not used).

The tests also need:

- `chromium`: the tests run against it.

A test whose tool or account is missing **fails** with instructions; it is never skipped.

```sh
npm install
npm run check   # lint, build, type check and every test
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run lint` | Biome: lint and format check (`npx biome check --write <path>` fixes what it can) |
| `npm run build` | builds the package with tsdown |
| `npm run typecheck` | TypeScript 7 in strict mode, tests included |
| `npm test` | unit, DOM and server tests (Vitest) |
| `npx vitest run <path>` | one test file |
| `npm run test:gc` | memory and leak tests |
| `npm run test:perf` | wall-clock budgets; run alone, never in parallel with other work |
| `npm run check` | all of the above; a change is ready when it passes |

## Layout

- `.github/`: workflows, issue and pull request templates, code owners.
- `build/`: the shared tsdown preset every package build uses.
- `scripts/`: build and release scripts; `release.mjs` is run by the workflows.
- `src/`: the source of the package; one folder per concern, `index.ts` re-exports the public API. Folders: `addons/`, `codemods/`, `templates/`.
- `test/`: the tests; one file per behavior, each test named by an invariant id such as `[ROUTER-12]`.
- `types/`: ambient declarations shared with the build.
- `CHANGELOG.md`: what each release changed.
- `biome.json`: lint and format rules.
- `package.json`: the manifest; `version` is changed only by a release.
- `tsconfig.json`: type check of the source.
- `tsdown.config.mjs`: the build.
- `vitest.config.ts`: the test projects (unit, DOM, server, gc, perf).
- `vitest.setup.ts`: test setup: an unasserted `console.warn` or `console.error` fails a test.

## How to implement a change

1. **Find where the behavior lives.** Search `test/` and `src/` for the name of the behavior or its invariant id, then read the source the tests exercise. The invariants below say what must stay true.
2. **Write the failing test first.** A bug fix reproduces the bug; a feature states the behavior it promises. Name the test with an invariant id in square brackets, the way the neighboring tests do, then the behavior in words. The test asserts what the code does and is never skipped, marked as todo or marked as an expected failure.
3. **Make it pass with the smallest change** that keeps the invariants. Match the code around it.
4. **Keep the surface honest.** A public symbol has TSDoc (summary, parameters, return value, an example and `@since`). An error says what happened and how to fix it. User-visible behavior gets a documentation update and a line under `## Unreleased` in CHANGELOG.md.
5. **Run `npm run check`** and read its output; do not report a change as done without it passing.

### Rules every change keeps

- No `any`, `@ts-ignore` or non-null assertion. Use `unknown` and narrow.
- Compare indices, lengths and counts explicitly (`=== undefined`, `=== -1`, `> 0`), never by truthiness.
- No empty `catch`: every catch rethrows, passes the error to the owner's handler, or reports it. Every "set the current X" register is restored in `finally`.
- User callbacks run untracked unless the API says otherwise. No stack parsing, no `fn.name` sniffing, no flags stamped on user functions.
- Traversals whose depth the user controls are iterative. Caches, queues and recursion are bounded, and a test hits the bound.
- Code meant for development only sits behind `__DEV__`. No import-time side effects and no module-level mutable state beyond the registers the core owns (bounded caches and `WeakMap`s excepted).
- No sleeps in tests (flush the scheduler); a `console.warn` or `console.error` that a test does not assert fails the test. Property tests use `fast-check` with a fixed seed.
- Files are kebab-case, tests are `*.test.ts`, internals live in `src/internal/`. American English in code, comments and documentation. Comments explain why, not what.
- The reactive core and the DOM renderer have no runtime dependencies.

## Pull requests

1. **Open an issue first** for anything that adds or changes public API, behavior, supported platforms or dependencies. A small fix needs no issue.
2. **Fork, then branch from `main`** (`fix/<topic>`, `feat/<topic>`, `docs/<topic>`). One concern per pull request.
3. **Commit in small steps** with a message that says what changed and why: a short type prefix (`fix:`, `feat:`, `docs:`, `test:`, `chore:`), then the subject. Commit under your own identity; do not add trailers or notes about tools.
4. **Open the pull request against `main`** and fill in the template: what changes, why, and the checks you ran. The CI workflow (`.github/workflows/ci.yml`) runs lint, build, type check and all tests; it must be green.
5. **Review.** A maintainer (see `.github/CODEOWNERS`) reviews every pull request. Expect questions about the test, the public surface and the error messages. Push fixes to the same branch; the pull request is squash-merged.
6. **Releases are not part of a pull request.** Do not change `version`, `.github/workflows/release.yml` or `scripts/release.mjs`, and do not create tags or publish. A maintainer releases by renaming `## Unreleased` in the changelog to the version and pushing a version that is not yet on npm to `main`; the workflow publishes it with provenance.

Security problems never go in a public issue or pull request: follow [SECURITY.md](SECURITY.md).

## Architecture and invariants

What each package keeps true. A change that breaks one of these is a bug in the change.

Rules specific to this package:

- **Generators are pure.** `projectFiles` / `buildProject` return data (a `Map` of relative POSIX path to
  text); only `writer.ts` touches the disk and only `run.ts` starts processes (through the injected
  `Runner`). Every test of the output runs without a disk, a network or a child process, except the Biome
  test (a local binary) and `test/matrix.e2e.test.ts` (the network).
- **One version table.** Every dependency range comes from `src/versions.ts`. A third-party pin must equal
  what the repository declares and has installed (`test/versions.test.ts`); change both together.
- **Generated code is Biome-clean.** `test/biome.test.ts` runs `biome check` on generated projects. Keep
  JSX lines within 100 columns by building them with `jsx()` (it prints like Biome), CSS with `css()`, JSON
  with `json()`.
- **Every combination builds.** `test/templates.test.ts` generates all add-on subsets for both templates:
  imports must be declared dependencies, relative imports must exist, environment variables must be in
  `.env.example`. A new add-on needs an entry in the marker table of `[CSA-36]`.
- **Write nothing on a bad request.** Arguments, name, target path, pack manifest and every file path are
  checked before the first byte is written. Paths from the file map go through `safeJoin`.
- **One runtime dependency, loaded lazily.** The binary is a single file plus `oxc-parser`, which only
  `codemod` uses and `src/codemods/ast.ts` imports on first use (`import("oxc-parser")`, never a static
  import), so scaffolding loads nothing but Node. The version equals the one `packages/compiler` pins.
  Prompts are written in `src/prompts.ts`.
- **Codemods edit by range.** `src/codemods/` parses, resolves scopes and returns source-range edits;
  nothing rewrites code with a text pattern. A binding is migrated completely or not at all: any use the
  codemod cannot translate blocks the whole binding and is reported as `file:line`, and the old import stays.
- **`--local` mirrors `tools/local/lib.mjs`.** `test/local.test.ts` compares the two. Do not import from
  `tools/` in `src/`.
- **Output is LF only; colors obey `NO_COLOR`.** No `\r` in generated files or command output (prompts
  use it only to redraw a line on a terminal).
- **One `package.json`, one install.** The ESLint add-on is an ordinary dev dependency: the plugin ships its
  own parser that runs on TypeScript 7, so no add-on installs a second TypeScript or a package in a sub-folder.

## Where to look next

- [README.md](README.md): what the package does and every option.
- [SKILL.md](SKILL.md): how to use the released package (install, import paths, a quick start).
- [CONTRIBUTING.md](CONTRIBUTING.md): the short guide to taking part.
- [CHANGELOG.md](CHANGELOG.md): what each release changed.
- [ShadowJS hub](https://github.com/shadowjs-dev/shadow): every repository of the project.
