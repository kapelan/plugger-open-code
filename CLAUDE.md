# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@sulesky/claude-marketplace` — an **OpenCode plugin** that brings the **Claude Code plugin/marketplace ecosystem** into OpenCode. Mirrors Claude Code's `/plugin` UI as closely as the OpenCode plugin API allows.

**Critical conceptual distinction (do not confuse):**

- **Claude Code plugin** = a manifest (`.claude-plugin/plugin.json`) declaring slash commands, skills, hooks, MCP servers, agents. Artifacts, not JS modules. Installed into `~/.opencode/plugins/<name>@<marketplace>/`.
- **OpenCode plugin** = a JS module exporting `server` (tools/hooks for the AI) or `tui` (UI in TUI mode). Loaded via `plugin[]` in `opencode.json`/`tui.json`. **This** package is one.

Plugger is an OpenCode plugin that **manages Claude Code plugins**. The two are different ecosystems. `api.plugins.list()` returns OpenCode plugins (including plugger itself), not the CC plugins users install through our UI.

## Current state — what works, what doesn't

**Works (verified end-to-end):**
- `/plugin` slash command in OpenCode TUI (registered via `TuiPlugin.command.register` with `slash: { name: 'plugin', aliases: ['marketplace', 'plugger'] }`). Direct execution, no LLM round-trip.
- **Discover** tab: pulls plugins from `anthropics/claude-plugins-official` (auto-bootstrapped on first open). Sorted by real install counts from the public stats endpoint Claude Code uses.
- **Installed** tab: lists both global (`~/.opencode/plugins/`) and project (`<projectDir>/.plugger/plugins/`) clones, labelled per scope.
- **Marketplaces** tab: registered marketplaces with Browse / Refresh / Remove actions.
- **Add marketplace**: DialogPrompt accepting `owner/repo` shorthand or any https/git/ssh/file URL.
- Schema accepts all 4 real-world `source` variants in `claude-plugins-official` (172-plugin sample): `{source: "url"}`, `{source: "git-subdir"}`, `{source: "github"}`, bare-string inline. Installer handles each.
- Security: identifier regex blocks path traversal (`..`), git-flag injection (leading `-`), and `--` (which is our namespace separator inside MCP keys / shim filenames — collision would let one plugin's uninstall remove another's keys). `git clone` uses `--` positional separator.
- **Install scopes:** every install picks `global` (default) or `project`. `global` lands artifacts under `~/.opencode/...` and `~/.config/opencode/...`. `project` lands them under `<projectDir>/.plugger/plugins/`, `<projectDir>/.opencode/...`, `<projectDir>/opencode.json`. Same plugin can live in both scopes — each independent. Scope resolution centralized in `src/translator/scope.ts` (`resolveScope(scope) → ScopePaths`).
- **Translator activates each capability** at install time:
  - **Commands:** `<plugin>/commands/**/*.md` → `<commandsDir>/<pluginId>/<rel>`. Only `.md`. Symlinks + hidden dirs skipped. Wipes target subdir per run → idempotent.
  - **Skills:** `<plugin>/skills/<name>/...` → `<skillsDir>/<pluginId>/<name>/...`. Full tree (any file). Same skip rules + idempotency.
  - **MCP servers:** `<plugin>/.mcp.json` and `plugin.json.mcpServers` are translated to OpenCode shapes (stdio `command`+`args`+`env` → `{type:"local", command:[cmd,...args], environment}`; `type:"sse"|"http"`+`url` → `{type:"remote", url, headers}`). `.mcp.json` is accepted in both shapes seen in the wild: `{"mcpServers":{...}}` and bare `{"name":{...}}` (context7 uses the bare form). Optional fields `enabled`/`disabled`/`timeout` are forwarded (CC `disabled:true` maps to OpenCode `enabled:false`). Merged into the scope's `opencode.json mcp:` under namespaced keys `<pluginId>--<server>`. Atomic write (tmp file + rename).
  - **Hooks (PreToolUse / PostToolUse only):** generates an ESM shim at `<hookShimsDir>/<pluginId>.js` that wraps each CC bash command via `child_process.spawn` and routes them through `tool.execute.before` / `tool.execute.after`. Matcher length capped at 200 chars (ReDoS guard — pathological patterns coerced to `'*'`). Other CC events (`SessionStart`, `UserPromptSubmit`, `Stop`, `Notification`) get a warning and are skipped. Shim is registered as `file://<absolute>` in the scope's `opencode.json plugin[]`. Sibling `package.json` with `{"type":"module"}` is written once next to shims so Node loads `.js` as ESM.
  - Translation failure rolls back the install (`rm -rf installPath`) so we don't leave half-translated state.
  - `installPlugin` records every artifact path/key plus the chosen `scope` in `.opencode-plugin-meta.json`. CC-only manifest fields (`agents`, `outputStyles`, `lspServers`) emit `console.warn` and are skipped.
- **Symmetric uninstall** (`uninstallPlugin(pluginId, {scope?})`): meta is NOT consulted — every cleanup decision is reconstructed from the validated `pluginId` and the scope paths:
  - `rm -rf <commandsDir>/<id>/`
  - `rm -rf <skillsDir>/<id>/`
  - `rm <hookShimsDir>/<id>.js`
  - In `opencode.json`: delete `mcp:` keys with prefix `<id>--`, filter `plugin[]` against `file://<expected-shim-path>`, drop empty `mcp:{}` / `plugin:[]` containers.
  - Wipe `<hookShimsDir>/` if only `package.json` remains.
  - `rm -rf <installRoot>/<id>/`.
  - Idempotent (second run = no-op). Tamper-proof (meta JSON injection can't trick us).
- 74 tests pass, build clean, typecheck clean. Generated hook shim ESM-imports cleanly and runs the before/after hooks (smoke-checked).

## Architecture

Two independent modules because OpenCode rejects a single module exporting both `server()` and `tui()`:

```
src/index.ts          → dist/index.js        — server plugin (tools for AI)
src-tui/index.tsx     → dist-tui/index.js    — TUI plugin (Solid JSX, bundled with bun build)
```

**Server module** (`dist/index.js`) — registered in `opencode.json` `plugin[]`. Exposes 6 tools: `marketplace_add`, `marketplace_list`, `marketplace_remove`, `plugin_marketplace_search`, `plugin_marketplace_install`, `plugin_marketplace_list`. Each is a thin wrapper around the same handlers in `src/commands/*.ts`.

**TUI module** (`dist-tui/index.js`) — registered in `tui.json` `plugin[]` (NOT opencode.json; OpenCode keeps TUI plugin specs separate). Solid JSX bundled with `bun build`, ~0.84MB. Exports `{ id, tui }` where `id` is required for `file://` plugin specs (runtime requirement not in the type definition). Calls our server-side handlers via `await import('../dist/...')` for actual work.

**User-facing config:**

```jsonc
// ~/.config/opencode/opencode.json
{
  "plugin": [
    "@ex-machina/opencode-anthropic-auth@latest",
    "file:///path/to/plugger-open-code/dist/index.js"
  ]
}

// ~/.config/opencode/tui.json  (separate file!)
{
  "plugin": [
    "file:///path/to/plugger-open-code/dist-tui/index.js"
  ]
}
```

## Domain layers (server)

- **`src/schemas/marketplace.ts`** — Zod schemas. `PluginSourceSchema` is a `z.union` of four variants (see "Current state" above). `IDENTIFIER_REGEX` and `GIT_URL_REGEX` are the security boundary — every name and URL that becomes a filesystem path or git arg passes through one of them. Don't bypass. `toPluginSource(token)` normalizes CLI-boundary input (owner/repo shorthand or URL) into the canonical `{source: "url", url}` form.
- **`src/marketplace/sources.ts`** — Resolves a `PluginSource` to `{gitUrl, ref, manifestPath, subPath, inline, inlinePath}`. SHA refs are detected by regex and use `git clone` + `git checkout <sha>` (because `--single-branch --branch <sha>` doesn't work for commit hashes). `deriveNameFromUrl(url)` extracts the last path segment for default naming.
- **`src/marketplace/manager.ts`** — `MarketplaceManager({ baseDir? })`. Constructor takes optional `baseDir` (default `~/.opencode/marketplaces/`). Clones marketplaces into `<baseDir>/<name>/`, persists registry at `<baseDir>/known_marketplaces.json`. Rollback on parse failure. `removeMarketplace` deletes the on-disk clone. Exports `sharedMarketplaceManager` singleton (uses default baseDir) — command handlers and TUI both import that. Tests pass a tmpdir baseDir for isolation.
- **`src/installer/install.ts`** — `installPlugin(entry, marketplace, opts?)`. Per source variant: inline (from `~/.opencode/marketplaces/<name>/`), git-subdir, github+commit, url. Clone target derived from `resolveScope(opts?.scope ?? global).installRoot`. `opts.refresh: true` wipes the existing clone before re-fetching. After clone + `loadPlugin`: runs `translatePlugin` with the same scope, writes `.opencode-plugin-meta.json` with `scope`, `source`, `installedArtifacts`. Translation failure rolls back the install. `loadPlugin` warnings surfaced via `console.warn`. `updatePlugin(pluginId, opts?)` reads `source`+`scope` from meta and calls `installPlugin` with `refresh: true` — bombs out loudly if meta is from a pre-source-field install. `getInstalledPlugins(scope?)` and `isPluginInstalled(id, scope?)` are scope-aware listers.
- **`src/installer/uninstall.ts`** — `uninstallPlugin(pluginId, opts?)`. Validates id via `assertValidPluginId`, then deterministic cleanup (does NOT read meta — see top of file). Empty `mcp:{}` / `plugin:[]` containers are dropped. `<hookShimsDir>/package.json` is left alone unless the dir is otherwise empty, in which case the whole dir gets wiped.
- **`src/translator/`** — `translatePlugin(installPath, pluginId, opts?)` returns `InstalledArtifacts` and dispatches to four sub-translators. Single regex constants (`PLUGIN_ID_REGEX`, `assertValidPluginId`) live in `scope.ts` and are reused everywhere.
  - `scope.ts` — `InstallScope` union, `ScopePaths`, `resolveScope` (single source of truth for global-vs-project paths). Also home to `PLUGIN_ID_REGEX` / `assertValidPluginId`.
  - `commands.ts` / `skills.ts` — directory tree copy with skip rules.
  - `mcp.ts` — accepts both `.mcp.json` shapes, forwards `enabled`/`disabled`/`timeout`, namespaces keys.
  - `hooks.ts` — generates ESM shim wrapping CC bash hooks. Matcher length capped (ReDoS guard).
  - `opencode-config.ts` — atomic read/write/mutate for opencode.json via tmp+rename.
- **`src/loader/plugin.ts`** — `loadPlugin(installPath)`: validates `.claude-plugin/plugin.json`, returns warnings for CC-only fields (`agents`, `outputStyles`, `lspServers`). Warnings consumed by `installPlugin`. `getPluginCapabilities` reports `hasCommands`/`hasHooks`/`hasSkills`/`hasMcpServers`; the translator scans the filesystem rather than trusting these flags, so the report is mostly informational.
- **`src/commands/*.ts`** — Six command handlers (`marketplaceAdd/List/Remove`, `pluginMarketplaceSearch/Install/List`) returning `{success, message, data?}`. Used by both server tools and TUI dialogs. `pluginMarketplaceInstall` reports activation summary from `result.artifacts` (the translator's actual output) rather than from manifest fields.
- **`src/util/errors.ts`** — `errMsg(e: unknown): string`. Single helper for "extract human-readable message from caught value". Replaces ad-hoc `(e as Error).message` casts that silently returned `undefined` for non-Error throws. Inlined as a small mirror in `src-tui/index.tsx` (TUI bundle doesn't cross-import).
- **`src/util/git.ts`** — `gitClone(url, ref, target)`. Shared between `installPlugin` and `MarketplaceManager.addMarketplace`. Handles SHA refs (full clone + checkout) vs branches (shallow `--single-branch`); `HEAD` coerced to `main`.

## TUI structure

`src-tui/index.tsx` is one file (~570 lines). Dialog-driven flow, not a custom Solid route. Every screen is a `DialogSelect` / `DialogPrompt` / `DialogConfirm` shown via `api.ui.dialog.replace()`.

Entry: `command.register({ slash: { name: 'plugin' }, onSelect: openMainView })`.

```
openMainView      — 4-option DialogSelect (Discover / Installed / Marketplaces / Add)
  openDiscoverOfficial            — ensureOfficialMarketplace → openDiscoverInMarketplace('claude-plugins-official')
  openDiscoverInMarketplace(name) — DialogSelect of plugins, sorted by install count
    confirmInstall                — DialogSelect for scope (Global / This project — project only offered if api.state.path.directory is set)
      confirmInstallWithScope     — DialogConfirm; calls installPlugin({scope})
  openInstalledView               — listing of ~/.opencode/plugins/ AND <projectDir>/.plugger/plugins/, each row labelled by scope
    openInstalledPluginActions    — DialogSelect: Update / Uninstall / Back (carries entry.scope)
      confirmUpdate               — DialogConfirm → updatePlugin(id, {scope}) (re-clones from source, re-translates)
      confirmUninstall            — DialogConfirm → uninstallPlugin(id, {scope})
  openMarketplacesView            — DialogSelect of registered marketplaces (marketplaces are always global)
    openMarketplaceActions        — DialogSelect: Browse / Refresh / Remove / Back
      refreshMarketplace          — removeMarketplace + addMarketplace
      confirmRemoveMarketplace    — DialogConfirm
  openAddMarketplaceDialog        — DialogPrompt
```

Project root for the scope picker comes from `api.state.path.directory`. If empty, only Global is offered.

Install count cache (`installsCache`) is per-process Map, populated by `fetchInstallCounts()` from the public endpoint at plugin load (prefetch) and on every Discover open. The Map keys match the format in the JSON: `"name@marketplace"`.

## Build, test, typecheck

```bash
npm run build       # tsc → dist/ + bun build → dist-tui/
npm run build:tui   # only the TUI bundle
npm test            # bun test (74 tests across 10 files)
npm run typecheck   # tsc --noEmit
```

Tests use isolated tmpdir `baseDir` for `MarketplaceManager` and `projectScope` for `installPlugin`/`uninstallPlugin` — `bun test` no longer pollutes real `~/.opencode/` or `~/.config/opencode/`. The DI refactor on `MarketplaceManager` ([`opts.baseDir`](src/marketplace/manager.ts)) closed the last leak. `__tests__/commands/marketplace.test.ts` still uses `sharedMarketplaceManager` (default baseDir) but only asserts shape, not content.

## Module conventions

- ESM only, NodeNext, `.js` extension on internal imports (even from `.ts`).
- Heavy/optional deps (`execa`) loaded via `await import('execa')` inside methods.
- TUI bundle uses Solid JSX with `@opentui/solid`. JSX components from `api.ui.*` are called as plain functions (`api.ui.DialogSelect({...})`) — this works because they return `JSX.Element` and the dialog stack accepts a render function.

## Filesystem state owned by this plugin

**Always global** (marketplace registry — never duplicated per project):

```
~/.opencode/marketplaces/known_marketplaces.json
~/.opencode/marketplaces/<name>/
```

**Global scope** (default at install):

```
~/.opencode/plugins/<plugin>@<marketplace>/                       — cloned CC plugin
~/.opencode/plugins/<...>/.opencode-plugin-meta.json              — install record (incl. `scope` and `installedArtifacts`)
~/.config/opencode/commands/<plugin>@<marketplace>/<...>.md       — translated slash commands
~/.config/opencode/skills/<plugin>@<marketplace>/<name>/...       — translated skills
~/.config/opencode/hook-shims/<plugin>@<marketplace>.js           — generated ESM hook shim
~/.config/opencode/hook-shims/package.json                        — written once, shared across plugins (auto-removed when dir empties)
~/.config/opencode/opencode.json                                  — scoped `mcp:` keys + `plugin[]` shim entries
```

**Project scope** (`<projectDir>` from `api.state.path.directory`):

```
<projectDir>/.plugger/plugins/<plugin>@<marketplace>/             — cloned CC plugin (off OpenCode auto-scan path)
<projectDir>/.opencode/commands/<plugin>@<marketplace>/<...>.md
<projectDir>/.opencode/skills/<plugin>@<marketplace>/<name>/...
<projectDir>/.opencode/hook-shims/<plugin>@<marketplace>.js
<projectDir>/.opencode/hook-shims/package.json
<projectDir>/opencode.json                                        — scoped `mcp:` + shim `plugin[]`
```

The translator only touches `mcp:` and shim `plugin[]` entries inside `opencode.json`; other top-level keys (model, theme, user plugins) survive untouched via read-modify-rename.

Install of the plugger plugin itself is manual (user edits `opencode.json` and `tui.json` once).

## Real-world data references

- Official CC marketplace manifest: `https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json` (172 plugins as of 2026-05-12).
- Install count endpoint: `https://raw.githubusercontent.com/anthropics/claude-plugins-official/refs/heads/stats/stats/plugin-installs.json` (421 plugins, sorted desc by `unique_installs`). Found by inspecting the Claude Code binary at `~/.local/share/claude/versions/<v>`.
- Community marketplace used for testing: `obra/superpowers-marketplace` — manifest uses the simpler `{source: "url", url}` variant for all entries.

## Next-session work

Plugger does end-to-end install with activation; uninstall is deterministic and symmetric. Remaining surface:

- **Honor CC hook `decision:"block"` protocol.** The generated shim ignores stdout from the bash hook. CC hooks can emit `{decision:"block", reason}` to block tool execution; OpenCode's `tool.execute.before` doesn't have a direct "block" channel. Worth investigating whether throwing from `before` aborts the call and whether that's the right semantics.
- **Map remaining CC hook events.** `SessionStart` / `UserPromptSubmit` / `Stop` / `Notification` get a warning today. Candidates: `chat.message` for prompt submit, `event` for session lifecycle. Verify in the live runtime.
- ~~Plugin update/upgrade~~ — done. `updatePlugin(pluginId, opts?)` in `src/installer/install.ts` + Update action in TUI `openInstalledPluginActions`. Implementation: rm install dir, re-fetch from `meta.source`, re-run translator. Fails loudly for legacy installs whose meta predates the `source` field.
- **Concurrent-write safety for `opencode.json`.** `mutateOpencodeConfig` is atomic per-process but two plugger sessions racing still last-writer-wins. Fix: lockfile.
- **Distribute as an npm package.** Today the user has to clone the repo and put `file://...` in opencode.json + tui.json. Subpath exports (`.` for server, `./tui` for TUI) would let them just write `@scope/claude-marketplace@latest` once the package is published.

Still Claude-Code-only and warned by `loadPlugin`: `agents`, `outputStyles`, `lspServers`.

## Known weak spots (deferred)

- **No file lock** on `known_marketplaces.json` — parallel marketplace operations can race.
- **No SHA pinning for marketplace** — the marketplace clone is at branch HEAD; a malicious push to the marketplace repo poisons the index. Plugin SHA pinning (the `sha` field) is supported per-plugin.
- **`oh-my-openagent` interaction**: that plugin defines agents with a tool whitelist. Plugger's server tools (`marketplace_add` etc.) won't be visible to those agents (only to `build` default agent). TUI plugin (`/plugin`) works regardless because it's not gated by agent tool lists.
- **Schema dead fields** (`plugin.json.commands` / `plugin.json.skills`): defined in `PluginManifestSchema` and commented as dead — translator scans the filesystem regardless. No real CC plugin uses these. Could be removed once we're sure no community plugin starts using them.
- **Concurrent-install race**: two `installPlugin` calls on the same id can both see `!existsSync(installPath)` and try to clone in parallel. Cheap fix would be `mkdir(installPath)` (no recursive) as a lock primitive — not yet done.
