# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@plugger-open-code/claude-marketplace` — an OpenCode plugin that bridges the **Claude Code** marketplace ecosystem to **OpenCode**. It lets a user add Claude Code marketplaces (git repos containing `.claude-plugin/marketplace.json`) and install plugins listed in them (git repos containing `.claude-plugin/plugin.json`) into `~/.opencode/plugins/`.

## Current state — read before changing anything

- `src/index.ts` is intentionally a stub (`export {};`). **The OpenCode plugin entry point is not wired up yet.** OpenCode plugins must export an async function `({ project, client, $, directory, worktree }) => ({ ...hooks })`. Until that exists in `src/index.ts`, installing this package in OpenCode loads a no-op module.
- `opencode.plugin.json` declares slash commands (`/marketplace-add`, `/plugin-marketplace-install`, etc.) in a Claude-Code-style format. **OpenCode does not natively read that format.** The command handlers in `src/commands/*.ts` are usable as plain functions, but they are not yet surfaced to OpenCode as slash commands.
- No translator yet. The README / package description mentions "automatic manifest translation," but translation never landed — the loader reads `.claude-plugin/plugin.json` directly via the Zod schema and merely emits warnings for Claude-Code-only fields (`agents`, `outputStyles`, `lspServers`).
- `.sisyphus/` and `.opencode/` in the repo are dev scaffolding (a planning tool and a local OpenCode workspace for in-repo testing). The `.opencode/opencode.json` `plugin` array contains placeholder values — ignore it.

## Build, test, typecheck

```bash
npm run build       # tsc → dist/ (required before publish or local install)
npm test            # bun test (all suites in __tests__/)
npm run typecheck   # tsc --noEmit
```

Run a single test file or test name:

```bash
bun test __tests__/integration.test.ts
bun test -t "installPlugin clones and installs a plugin"
```

`dist/` is gitignored — there is no `prepare` script, so `npm install` from this git URL will not produce a usable package. Either publish to npm, add a `prepare: "tsc"` script, or install locally via `file:` reference.

## Module conventions

- ESM only (`"type": "module"`), `tsconfig` uses `module: "NodeNext"`.
- **Internal imports must include the `.js` extension even from `.ts` files** (e.g. `import { ... } from '../schemas/plugin.js'`). Imports without the extension will break the build.
- Heavy / optional deps (`execa`) are imported via dynamic `await import('execa')` inside async methods — keep that pattern when adding similar tooling.

## Architecture

Three layers, all built around two manifest files in cloned repos: `.claude-plugin/marketplace.json` (a marketplace) and `.claude-plugin/plugin.json` (a single plugin).

**Schemas (`src/schemas/`)** — Zod is the source of truth.
- `marketplace.ts` defines `PluginSource` (discriminated union: `github` shorthand `owner/repo` or `git`/ssh/file URL), `PluginMarketplaceEntry`, and `Marketplace`. It also exports `IDENTIFIER_REGEX`, the shared name-safety pattern used as a defensive boundary everywhere a string becomes a filesystem path. **Do not bypass this** — `name` (plugin/marketplace) and `repo`/`url` are intentionally regex-constrained to block path traversal and git argument-injection (CVE-2017-1000117 class). The tests in `__tests__/installer/install.test.ts` lock these invariants.
- `plugin.ts` defines `PluginManifest` with `.passthrough()` so unknown CC fields survive parsing for later warnings.
- `src/types/index.ts` re-exports the inferred types plus runtime structures (`InstalledPlugin`, `LoadedPlugin`).

**Marketplace layer (`src/marketplace/`)**
- `sources.ts` — pure: resolves a `PluginSource` to `{ gitUrl, ref, manifestPath }`. `resolveMarketplaceSource` points at `marketplace.json`; `resolvePluginSource` points at `plugin.json`.
- `manager.ts` — `MarketplaceManager` clones marketplaces into `~/.opencode/marketplaces/<name>/` (shallow, single-branch, with `--` separator before positional args to block git flag-injection), parses the manifest, and persists a registry to `~/.opencode/marketplaces/known_marketplaces.json`. In-memory `Map` cache is keyed by marketplace name. Search is a substring match across `name`, `description`, and `tags`. Failures after a fresh clone roll back the cache directory so retries aren't stuck on broken state; `removeMarketplace` deletes the on-disk clone as well as the registry entry. Exports a `sharedMarketplaceManager` singleton — command handlers should import that rather than constructing their own.

**Install / load (`src/installer/`, `src/loader/`)**
- `install.ts` — clones a plugin from a marketplace entry into `~/.opencode/plugins/<plugin>@<marketplace>/`, runs the loader for validation, and writes `.opencode-plugin-meta.json` registration metadata.
- `loader/plugin.ts` — validates `.claude-plugin/plugin.json` and returns a `PluginLoadResult` whose `warnings[]` list flags Claude-Code-only fields. **The loader does not transform the manifest** — anything OpenCode can't run will just appear as a warning.

**Command handlers (`src/commands/`)**
- `marketplace.ts` — `marketplaceAdd`, `marketplaceList`, `marketplaceRemove`. Each takes `args: string[]` and returns `CommandResult { success, message, data? }`.
- `plugin-market.ts` — `pluginMarketplaceSearch`, `pluginMarketplaceInstall`, `pluginMarketplaceList`. Install resolves `name@marketplace` or bare `name` (errors with the candidate list if a bare name is ambiguous).

Both command modules import the shared `sharedMarketplaceManager` instance from `src/marketplace/manager.ts`. If you add new command files that hit the registry, do the same — multiple `MarketplaceManager` instances split the in-memory cache and would race on `known_marketplaces.json` (the registry write is not yet file-locked).

## Filesystem state owned by this plugin

Hard-coded against `process.env.HOME`:

- `~/.opencode/marketplaces/` — cloned marketplace repos
- `~/.opencode/marketplaces/known_marketplaces.json` — registry written by `MarketplaceManager`
- `~/.opencode/plugins/<plugin>@<marketplace>/` — installed plugin repos
- `~/.opencode/plugins/<...>/.opencode-plugin-meta.json` — install record

Tests that touch the registry (`__tests__/integration.test.ts`, `__tests__/marketplace/manager.test.ts`) write into `~/.opencode/marketplaces/` of the host machine — they don't sandbox the HOME path. Use unique names (`Date.now()`) and clean up in `afterAll`, as the existing tests do.
