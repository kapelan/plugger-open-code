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

## Releasing (maintainers)

Publish is automated via GitHub Actions. Pushing a `v*` tag triggers
`.github/workflows/release.yml`, which runs typecheck + build + tests and
then `npm publish --provenance --access public`.

```bash
# Bump version + create the tag + commit it, all in one step.
npm version patch        # or minor / major / 0.1.0 / etc.

# Push the version commit AND the tag. The tag push fires the release job.
git push --follow-tags
```

Watch progress at `https://github.com/<owner>/<repo>/actions`. The workflow
fails fast if the tag's version doesn't match `package.json`, so a hand-rolled
`git tag v1.2.3` without bumping the manifest is caught before anything ships.

**One-time setup**

1. Get an npm automation token: `npm token create --type=automation`.
2. Add it to the GitHub repo as a secret named `NPM_TOKEN`
   (Settings → Secrets and variables → Actions → New repository secret).
3. The npm scope (`@plugger-open-code` by default) must be one your token
   can publish to. Change `name` in `package.json` if not.

**Smoke-test a tarball locally before tagging**

```bash
npm pack
cd /tmp && mkdir smoke && cd smoke && echo '{"type":"module"}' > package.json
bun add "file:$(realpath ../path/to/plugger-open-code-claude-marketplace-*.tgz)"
bun -e "console.log(typeof (await import('@plugger-open-code/claude-marketplace')).default)"
bun -e "console.log((await import('@plugger-open-code/claude-marketplace/tui')).id)"
```

Both imports must resolve and return real values.

## License

MIT
