# plugger

**Use Claude Code plugins inside [OpenCode](https://opencode.ai/).**

[![CI](https://github.com/kapelan/plugger-open-code/actions/workflows/ci.yml/badge.svg)](https://github.com/kapelan/plugger-open-code/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@sulesky/opencode-plugger.svg)](https://www.npmjs.com/package/@sulesky/opencode-plugger)
[![license](https://img.shields.io/npm/l/@sulesky/opencode-plugger.svg)](./LICENSE)

Claude Code has a thriving plugin ecosystem (172+ plugins in the official
marketplace alone — skills, MCP servers, slash commands, hooks). OpenCode
doesn't natively read that format. **plugger** is the bridge: register Claude
Code marketplaces, browse plugins, install them, and have everything actually
activate inside OpenCode.

```
/plugin
┌──── Plugger · Claude Code plugins for OpenCode ────────┐
│ ▸ Discover         Browse the official CC marketplace  │
│   Installed        Plugins cloned here, Update / Remove│
│   Marketplaces     Add / Refresh / Remove marketplaces │
│   + Add marketplace                                    │
└────────────────────────────────────────────────────────┘
```

## Why

Without plugger, using a Claude Code plugin in OpenCode means: clone the
repo by hand, figure out where each piece goes (`commands/*.md` here,
`skills/<name>/SKILL.md` there, `.mcp.json` merged into `opencode.json`,
hooks rewritten as JS plugins), and redo it every project. plugger does all
of that on `Install`, and undoes it on `Uninstall`.

It works with:

- **Slash commands** — `<plugin>/commands/*.md` activate as OpenCode commands.
- **Skills** — full skill trees (markdown + supporting scripts/files) land in OpenCode's skill loader.
- **MCP servers** — both stdio (`{command, args, env}`) and remote (`{type, url, headers}`) shapes; merged into `opencode.json` under namespaced keys.
- **Hooks** (`PreToolUse` / `PostToolUse`) — translated into a generated ESM shim that runs the bash command via `child_process` from OpenCode's `tool.execute.before`/`after`.

## Install

Add **both** entries to your OpenCode config (server module to `opencode.json`,
TUI module to `tui.json`):

```jsonc
// ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@sulesky/opencode-plugger@latest"]
}
```

```jsonc
// ~/.config/opencode/tui.json
{
  "plugin": ["@sulesky/opencode-plugger/tui@latest"]
}
```

Restart OpenCode. Bun fetches the package into `~/.cache/opencode/packages/` on
first launch.

Project-scoped install works the same — drop the same files at the project
root and the spec only applies inside that project.

## Use

Open the TUI and run `/plugin`:

### Discover
The official Claude Code marketplace, sorted by real install counts. Pick a
plugin → choose scope (Global or This project) → confirm. Already-installed
plugins are shown with `✓` and can't be selected again.

### Installed
Lists both global (`~/.opencode/plugins/`) and project
(`<projectDir>/.plugger/plugins/`) installations, labelled by scope. Per row:
- **Update** — re-fetch from the original source and re-run the translator.
- **Uninstall** — wipes the clone *and* every translated artifact in that scope.

### Marketplaces
Register more marketplaces by `owner/repo` shorthand or any git URL.
Browse / Refresh / Remove. The official `anthropics/claude-plugins-official`
is auto-registered on first open.

### From the assistant
The server module also exposes everything as tools the agent can call:
`marketplace_add`, `marketplace_list`, `marketplace_remove`,
`plugin_marketplace_search`, `plugin_marketplace_install`,
`plugin_marketplace_list`.

## Scopes

| | Clone goes to | Artifacts go to |
|---|---|---|
| **global** (default) | `~/.opencode/plugins/<id>/` | `~/.config/opencode/{commands,skills,hook-shims}/<id>/` + `~/.config/opencode/opencode.json` |
| **project** | `<projectDir>/.plugger/plugins/<id>/` | `<projectDir>/.opencode/{commands,skills,hook-shims}/<id>/` + `<projectDir>/opencode.json` |

The same plugin can live in both at once — each install is independent, and
uninstalling one scope doesn't touch the other.

## Uninstall behaviour

Uninstall is **deterministic** — every cleanup decision is rebuilt from the
plugin id and the scope, not from the install record on disk. A corrupted or
hand-edited meta file can't make uninstall skip artifacts, and it can't trick
uninstall into removing someone else's MCP keys or plugin entries.

Specifically:

- `<configDir>/commands/<id>/` and `<configDir>/skills/<id>/` — wiped wholesale.
- `<configDir>/hook-shims/<id>.js` — removed; the shared `package.json` next to it stays unless that was the last shim.
- `opencode.json` — MCP keys with the `<id>--` prefix and the plugin's shim entry in `plugin[]` are filtered out; empty `mcp:{}` / `plugin:[]` containers are dropped.
- The plugin clone itself.

## Not supported (yet)

- CC `agents`, `outputStyles`, `lspServers` — no OpenCode equivalent, warned and skipped.
- CC hook events outside `PreToolUse` / `PostToolUse` (`SessionStart`, `UserPromptSubmit`, `Stop`, `Notification`) — same.
- CC hook `decision:"block"` protocol — the generated shim ignores hook stdout. Hooks run for their side effects only.

## Develop

```bash
bun install
npm run build          # tsc → dist/  + bun build → dist-tui/
npm test               # 75 tests
npm run typecheck
```

Run against your working copy by pointing OpenCode at the dist paths instead of
the npm spec:

```jsonc
// opencode.json
{ "plugin": ["file:///abs/path/to/repo/dist/index.js"] }
// tui.json
{ "plugin": ["file:///abs/path/to/repo/dist-tui/index.js"] }
```

Tests use tmpdir for scope and inject a `baseDir` into `MarketplaceManager`,
so `bun test` doesn't touch your real `~/.opencode/` or `~/.config/opencode/`.

## Releasing (maintainers)

```bash
npm version patch          # bump + git tag
git push --follow-tags     # tag push triggers .github/workflows/release.yml
```

Watch [Actions](https://github.com/kapelan/plugger-open-code/actions). The
release job checks the tag matches `package.json` version, runs typecheck +
build + tests, then `npm publish --provenance --access public`.

**One-time setup**: `npm token create --type=automation`, add as repo secret
`NPM_TOKEN` (Settings → Secrets and variables → Actions).

## License

[MIT](./LICENSE)
