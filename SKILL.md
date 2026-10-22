---
name: create-shadow-app
description: "Work with create-shadow-app. Create a new app from a starter template, with optional Tailwind, Biome, Vitest, Convex and Clerk. Use when a project imports it, or when asked to add, configure or debug it."
---

# create-shadow-app

Version 1.0.0. Create a new app from a starter template, with optional Tailwind, Biome, Vitest, Convex and Clerk.

## Where to read more

- create-shadow-app: https://create.shadowjs.net
- Source and issues: https://github.com/shadowjs-dev/create-shadow-app
- The package README is the full reference for options and behavior; read it before changing a configuration.

## Install

```sh
npm install create-shadow-app
```

## Import paths

Import only from these paths. Never from `dist` or `src`: files that are not listed here are private and change without notice.

- `create-shadow-app`

## Quick start

```text
create-shadow-app - scaffold a ShadowJS app

Usage
  npm create shadow-app@latest [directory] [options]
  create-shadow-app [directory] [options]
  create-shadow-app completion <shell>   print a bash, zsh or fish completion script
  create-shadow-app codemod <name> [paths]   migrate React, Solid or Next.js code to ShadowJS

Template
  -t, --template <name>      spa (Vite SPA), dusk (full stack), content, dashboard or api  [default: spa]
      --adapter <name>       dusk only: node, bun, deno, cloudflare, vercel, netlify, tarout or static
                             (the deployment target; default: the Node server, run by dusk start)
      --name <package>       npm package name  [default: derived from the directory]

Add-ons (each: --x to add, --no-x to leave out)
  --tailwind                 Tailwind CSS 4 (@tailwindcss/vite)
  --biome                    Biome lint and format  [default: on]
  --vitest                   Vitest, happy-dom, @shadow-js/testing, an example test
  --convex                   Convex: provider, schema, sample functions
  --clerk                    Clerk: provider, sign-in/up, a protected page
  --ui                       shadow-ui scaffolding (components.json, cn(), theme); adds Tailwind
  --eslint                   @shadow-js/eslint-plugin flat config (dusk config for Dusk apps)
  --devtools                 the reactive-graph inspector, in development only
  --router                   spa only: client-side routing (Clerk and Convex imply it)

Behavior
  -y, --yes                  accept the defaults, ask nothing
      --no-install           do not install dependencies
      --no-git               do not run git init
      --pm <name>            npm, pnpm, yarn or bun  [default: the one that ran this, else npm]
      --force                write into a directory that is not empty (overwrites files of the same name)
      --dry-run              show what would be written; write nothing
      --allow-outside        permit a directory outside the current one
      --json                 print one JSON document on stdout instead of words; nothing is asked
  -h, --help                 show this help
  -v, --version              show the version

Before ShadowJS is published
      --local <packDir>      use the tarballs in <packDir> (written by `npm run pack:local`)
      --pack-root <repo>     same, with <repo>/.pack

Exit codes  0 done, 1 failed, 2 wrong arguments, 130 canceled (Ctrl-C), 143 terminated (SIGTERM)

Examples
  npm create shadow-app@latest my-app
  npm create shadow-app@latest my-app -- --template dusk --tailwind --vitest
  node dist/cli.js my-app --template dusk --local /path/to/shadowjs/.pack
```

## Working rules

- Run `npm run check` before proposing a change; it lints, builds, type-checks and tests.
- Keep a public change documented: TSDoc on every exported symbol, and a CHANGELOG entry.
- To change this repository rather than use the package, read AGENTS.md: the layout, the commands, the rules and how a pull request is reviewed.
