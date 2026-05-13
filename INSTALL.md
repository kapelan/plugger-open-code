---
name: install-plugger
description: Install @sulesky/opencode-plugger into OpenCode (server + TUI). Paste this file at an AI assistant and it will register both npm packages in `~/.config/opencode/opencode.json` and `~/.config/opencode/tui.json` idempotently.
---

# Install plugger into OpenCode

Plugger ships as **two npm packages** published from the same git tag:

- `@sulesky/opencode-plugger` — server module (tools/commands the assistant calls).
- `@sulesky/opencode-plugger-tui` — TUI module (the `/plugin` dialog flow).

Both must be registered, in different files. The TUI package depends on the
server package transitively — Bun pulls it in during the first OpenCode
launch.

## What the assistant should do

> The steps below are intended for an AI assistant (Claude Code, OpenCode,
> Cursor, …) running these commands. Every block is idempotent: if the plugin
> entry is already there, leave the file alone. Do not blow away the user's
> other plugins, MCP servers, or model setting.

### 1. Verify OpenCode is installed and recent enough

```bash
opencode --version
```

Required: `1.14` or newer (plugger's `peerDependencies.@opencode-ai/plugin`).
If older or missing, stop and tell the user to upgrade OpenCode first
(`brew upgrade opencode` on macOS).

### 2. Add the server package to `opencode.json`

Edit `~/.config/opencode/opencode.json` (or the project-local `opencode.json`
if the user wants project scope only). If the file doesn't exist, create it.
**Only add the entry if not already present** — preserve every other key.

```bash
node -e "
const fs = require('fs');
const path = require('os').homedir() + '/.config/opencode/opencode.json';
const cfg = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf-8')) : {};
cfg['\$schema'] ??= 'https://opencode.ai/config.json';
cfg.plugin ??= [];
const spec = '@sulesky/opencode-plugger@latest';
if (!cfg.plugin.some(p => (typeof p === 'string' ? p : p[0]) === spec)) {
  cfg.plugin.push(spec);
}
require('fs').mkdirSync(require('path').dirname(path), { recursive: true });
fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
console.log('opencode.json updated:');
console.log(fs.readFileSync(path, 'utf-8'));
"
```

### 3. Add the TUI package to `tui.json`

Same pattern, different file (`tui.json` is separate from `opencode.json`
— OpenCode rejects TUI plugins in `opencode.json`).

```bash
node -e "
const fs = require('fs');
const path = require('os').homedir() + '/.config/opencode/tui.json';
const cfg = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf-8')) : {};
cfg.plugin ??= [];
const spec = '@sulesky/opencode-plugger-tui@latest';
if (!cfg.plugin.some(p => (typeof p === 'string' ? p : p[0]) === spec)) {
  cfg.plugin.push(spec);
}
require('fs').mkdirSync(require('path').dirname(path), { recursive: true });
fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
console.log('tui.json updated:');
console.log(fs.readFileSync(path, 'utf-8'));
"
```

### 4. Tell the user to restart OpenCode

Plugin discovery happens once at OpenCode startup. Any running OpenCode
instance must be **fully quit** (not just the TUI closed) and reopened.

### 5. After restart — quick verification

Ask the user to run `/plugin` in the TUI. They should see a dialog with
four entries: **Discover**, **Installed**, **Marketplaces**, **+ Add
marketplace**.

If `/plugin` doesn't exist, check the latest log:

```bash
tail -200 ~/.local/share/opencode/log/$(ls -t ~/.local/share/opencode/log/ | head -1) \
  | grep -E "plugin|tui|sulesky|error"
```

Common failure signatures and fixes:

| Symptom in log | Cause | Fix |
| --- | --- | --- |
| `failed to resolve tui plugin: NpmInstallFailedError` | Stale cache from a pre-split version | `rm -rf ~/.cache/opencode/packages/@sulesky` then restart |
| `does not expose a tui entrypoint` | Cached old TUI bundle with mismatched id | same — clear cache |
| `peer dep ... not satisfied` | OpenCode older than 1.14 | upgrade OpenCode |
| No `sulesky` lines at all | Spec not in `tui.json` plugin[] | re-run step 3 |

## Project scope (optional)

For a single-project install, write the same two files at the project root
instead of `~/.config/opencode/`:

- `<projectDir>/opencode.json` — server entry
- `<projectDir>/tui.json` — TUI entry

Both layouts can coexist. OpenCode merges project on top of global.

## Uninstall

Reverse of install — strip the two entries and clear cache:

```bash
node -e "
const fs = require('fs');
const os = require('os');
for (const [p, spec] of [
  [os.homedir() + '/.config/opencode/opencode.json', '@sulesky/opencode-plugger@latest'],
  [os.homedir() + '/.config/opencode/tui.json', '@sulesky/opencode-plugger-tui@latest'],
]) {
  if (!fs.existsSync(p)) continue;
  const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
  if (!Array.isArray(cfg.plugin)) continue;
  cfg.plugin = cfg.plugin.filter(x => (typeof x === 'string' ? x : x[0]) !== spec);
  if (cfg.plugin.length === 0) delete cfg.plugin;
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
}
"
rm -rf ~/.cache/opencode/packages/@sulesky
```

Then restart OpenCode. Marketplaces and cloned plugins under
`~/.opencode/{marketplaces,plugins}/` survive — delete them by hand if you
also want to scrub that state.
