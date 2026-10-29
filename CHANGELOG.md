# Changelog

## 1.0.2

### Fixed

- A project named like one of its own dependencies (`vite`, `vitest`, `@shadow-js/core`) is refused with the usage exit code before anything is written, instead of producing a project no package manager can install.
- An add-on a starter template cannot take (`--template content --convex`) exits with the usage code and the `CREATE_SHADOW_APP_INVALID_OPTION` code instead of the unexpected-error code.
- The codemod's folder walk keeps its own stack instead of recursing and no longer spreads a folder's files into `push`, so a very deep or very wide tree is read without a stack overflow.

## 1.0.1

### Changed

- Released at 1.0.1 with the other packages, which share one version. No change to this package.

## 1.0.0

### Added

- `--json`: one document on stdout in the contract shared with `dusk` and `shadow-ui` (schema 1: `schema`, `command`, `ok`, `data`, `warnings` and, on failure, `error: { code, message }` with a stable `CREATE_SHADOW_APP_` code). `data` lists the created files, the choices, the install and git results and the next steps; nothing is asked, the install's output goes to stderr, and the exit codes are unchanged.
- `create-shadow-app codemod react-router-to-shadow`: `Link` and `NavLink` to `A`, `Outlet`, `Navigate`, `useNavigate`, `useLocation` and `useParams` to `@shadow-js/router` for `react-router`, `react-router-dom` and `@remix-run/react`; refuses what `A` cannot express and reports the route table.
- `create-shadow-app codemod preact-to-shadow`: the React rules for `preact/hooks` and `preact/compat`, `createContext` and `Fragment` from `preact`, and reports for `render`, `Component`, `h` and `@preact/signals`.
- `create-shadow-app completion <bash|zsh|fish>` prints a completion script for the flags, their values and the directory.
- `create-shadow-app codemod <react-to-shadow|solid-to-shadow|next-router-to-shadow> [paths...]`: AST-based migration codemods (`oxc-parser`, edits by source range, scope-aware, idempotent). `--dry-run` (the default) prints a unified diff, `--write` applies it, a path outside the working directory is refused (exit code 1) before anything is written, `node_modules`, `dist` and files over 1 MiB are skipped, and what cannot be translated is reported as `file:line` warnings. Supports `--json`; adds the codes `UNKNOWN_CODEMOD`, `CODEMOD_REFUSED` and the warning codes `CODEMOD_UNSUPPORTED`, `CODEMOD_NOTE`, `CODEMOD_SKIPPED`. The parser is the package's only runtime dependency and is loaded only by this command.
- SPA and Dusk project templates with deployment-adapter selection.
- Starters on Dusk: `content` (Markdown posts, prerendered pages, RSS, sitemap, `robots.txt`), `dashboard` (sidebar shell, server-side table, queries, forms, typed server functions, `shadow-ui` theme) and `api` (API routes, validation, rate limits, CORS, OpenAPI). Each builds Vitest and ESLint in and is proven end to end by the install matrix (`npm run verify:matrix`).
- Additive UI, Tailwind, test and lint setup with package-manager selection.
