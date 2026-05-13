# @plugger-open-code/claude-marketplace

An OpenCode plugin that brings the Claude Code plugin ecosystem into OpenCode:
discover and install plugins from any Claude Code marketplace, with automatic
translation of slash commands, skills, MCP servers, and hooks into the formats
OpenCode loads.

## Install

The package ships two entries — a server module (commands/tools, registered in
`opencode.json`) and a TUI module (the `/plugin` dialog flow, registered in
`tui.json`). Add both:

**`~/.config/opencode/opencode.json`**

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "@plugger-open-code/claude-marketplace@latest"
  ]
}
```

**`~/.config/opencode/tui.json`**

```jsonc
{
  "plugin": [
    "@plugger-open-code/claude-marketplace/tui@latest"
  ]
}
```

OpenCode resolves these via Bun on first launch (downloads under
`~/.cache/opencode/packages/`). Restart OpenCode after editing.

Project-local config works too — drop the same `opencode.json` / `tui.json` at
the project root and the spec applies only inside that project.

## Use

In OpenCode TUI, run `/plugin`:

- **Discover** — browse Claude Code's official marketplace, sorted by real install counts.
- **Installed** — list cloned plugins (global + project), Update or Uninstall.
- **Marketplaces** — register additional marketplaces by `owner/repo` shorthand or git URL.

Each install asks for a scope (Global or This project) and re-fetches on
Update.

The assistant can also drive everything via tools: `marketplace_add`,
`marketplace_list`, `marketplace_remove`, `plugin_marketplace_search`,
`plugin_marketplace_install`, `plugin_marketplace_list`.

## What activates

On install the translator writes plugin artifacts into the scope's OpenCode
directories so they actually take effect:

| CC capability   | Lands at                                                    |
| --------------- | ----------------------------------------------------------- |
| `commands/*.md` | `<configDir>/commands/<plugin@marketplace>/...`             |
| `skills/<name>/`| `<configDir>/skills/<plugin@marketplace>/<name>/...`        |
| MCP servers     | `<configDir>/opencode.json` `mcp:` (key: `<plugin@marketplace>--<server>`) |
| Hooks (Pre/PostToolUse) | `<configDir>/hook-shims/<plugin@marketplace>.js` (registered in `plugin[]`) |

Uninstall reverts each artifact deterministically from the validated plugin id
— meta tampering can't poison cleanup.

CC `agents`, `outputStyles`, `lspServers` and hook events outside
PreToolUse/PostToolUse are warned and skipped (no OpenCode equivalent yet).

## Develop

```bash
bun install            # install deps
npm run build          # tsc → dist/  + bun build → dist-tui/
npm test               # bun test (75 tests)
npm run typecheck
```

While developing locally, point OpenCode at the working copy:

```jsonc
// opencode.json
{ "plugin": ["file:///abs/path/to/repo/dist/index.js"] }
// tui.json
{ "plugin": ["file:///abs/path/to/repo/dist-tui/index.js"] }
```

Tests use tmpdir for scope and a `baseDir` option on `MarketplaceManager`, so
`bun test` doesn't pollute `~/.opencode/` or `~/.config/opencode/`.

## Publishing (maintainers)

```bash
# 1. Bump version (creates git tag).
npm version patch        # or minor / major

# 2. Publish to npm. `prepublishOnly` runs typecheck + build + tests.
npm publish

# 3. Push the version commit and the tag.
git push --follow-tags
```

The package is `publishConfig.access: "public"`, so scoped publishes go
straight to the public registry.

To smoke-test the tarball locally before publishing:

```bash
npm pack
cd /tmp && mkdir smoke && cd smoke
bun add "file:/absolute/path/to/plugger-open-code-claude-marketplace-*.tgz"
node -e "import('@plugger-open-code/claude-marketplace').then(m => console.log(typeof m.default))"
node -e "import('@plugger-open-code/claude-marketplace/tui').then(m => console.log(m.id))"
```

Both imports must resolve and return real values.

## License

MIT
