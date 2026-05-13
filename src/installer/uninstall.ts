import { rm, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { mutateOpencodeConfig } from '../translator/opencode-config.js';
import { resolveScope, defaultScope, assertValidPluginId, type InstallScope } from '../translator/scope.js';

export interface UninstallOptions {
  scope?: InstallScope;
}

/**
 * Symmetric counterpart to `installPlugin`. Every cleanup decision is
 * reconstructed from the validated `pluginId` (and resolved scope paths) —
 * we deliberately do NOT consult `.opencode-plugin-meta.json`. Reasons:
 *   - Meta can be stale (e.g. plugin installed before translator existed,
 *     or hand-edited).
 *   - Meta can be tampered with.
 *   - The naming conventions are deterministic: we own `<id>` subdirs in
 *     commands/skills/hook-shims and the `<id>--*` namespace in `mcp:`,
 *     and the `file://<hookShimsDir>/<id>.js` entry in `plugin[]`.
 *
 * So uninstall just removes whatever currently matches those patterns.
 * Bonus: if you re-run an uninstall, the second run is a clean no-op.
 */
export async function uninstallPlugin(pluginId: string, opts?: UninstallOptions): Promise<void> {
  assertValidPluginId(pluginId);
  const scope = opts?.scope ?? defaultScope();
  const paths = resolveScope(scope);
  const installPath = join(paths.installRoot, pluginId);
  const namespacePrefix = `${pluginId}--`;
  const shimPath = join(paths.hookShimsDir, `${pluginId}.js`);
  const shimPluginEntry = `file://${shimPath}`;

  // Directory-scoped artifacts — wipe whole subdirs we own.
  await rm(join(paths.commandsDir, pluginId), { recursive: true, force: true });
  await rm(join(paths.skillsDir, pluginId), { recursive: true, force: true });

  // Hook shim file (may or may not exist).
  await rm(shimPath, { force: true });

  // opencode.json edits: strip MCP keys with our prefix + the shim plugin
  // entry. Also drop the keys entirely when they become empty containers,
  // so we don't leave `mcp: {}` cruft behind. mutateOpencodeConfig is a
  // no-op when the file doesn't exist.
  await mutateOpencodeConfig((cfg) => {
    if (cfg.mcp) {
      for (const k of Object.keys(cfg.mcp)) {
        if (k.startsWith(namespacePrefix)) delete cfg.mcp[k];
      }
      if (Object.keys(cfg.mcp).length === 0) delete cfg.mcp;
    }
    if (Array.isArray(cfg.plugin)) {
      cfg.plugin = cfg.plugin.filter((p) => {
        const name = typeof p === 'string' ? p : p[0];
        return name !== shimPluginEntry;
      });
      if (cfg.plugin.length === 0) delete cfg.plugin;
    }
  }, paths.opencodeConfigPath);

  // If hook-shims dir is empty except for the once-written package.json,
  // wipe the whole dir. Avoids leaving an orphan after the last hook plugin.
  await pruneEmptyHookShimsDir(paths.hookShimsDir);

  await rm(installPath, { recursive: true, force: true });
}

async function pruneEmptyHookShimsDir(hookShimsDir: string): Promise<void> {
  if (!existsSync(hookShimsDir)) return;
  let entries: string[];
  try {
    entries = await readdir(hookShimsDir);
  } catch {
    return;
  }
  const leftover = entries.filter((n) => n !== 'package.json');
  if (leftover.length === 0) {
    await rm(hookShimsDir, { recursive: true, force: true });
  }
}
