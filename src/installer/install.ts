import { readFile, mkdir, writeFile, cp, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { IDENTIFIER_REGEX, type PluginMarketplaceEntry, type PluginSource } from '../schemas/marketplace.js';
import type { InstalledPlugin } from '../types/index.js';
import { resolvePluginSource } from '../marketplace/sources.js';
import { loadPlugin } from '../loader/plugin.js';
import { translatePlugin, type InstalledArtifacts } from '../translator/index.js';
import { resolveScope, defaultScope, assertValidPluginId, makePluginId, type InstallScope } from '../translator/scope.js';
import { gitClone } from '../util/git.js';
import { errMsg } from '../util/errors.js';

export interface InstallOptions {
  /** Install target — defaults to global (`~/.opencode/plugins/`). */
  scope?: InstallScope;
  /**
   * If true and the plugin is already installed, wipe the existing clone
   * and re-fetch from the source. Without this flag, an existing install
   * is left in place (only the translator is re-run on current content).
   */
  refresh?: boolean;
}

export async function installPlugin(
  entry: PluginMarketplaceEntry,
  marketplace: string,
  opts?: InstallOptions,
): Promise<InstalledPlugin> {
  if (!IDENTIFIER_REGEX.test(marketplace)) {
    throw new Error(`Invalid marketplace name "${marketplace}": must match ${IDENTIFIER_REGEX}`);
  }
  // entry.name is validated by PluginMarketplaceEntrySchema upstream.

  const scope = opts?.scope ?? defaultScope();
  const paths = resolveScope(scope);
  await mkdir(paths.installRoot, { recursive: true });

  const pluginId = makePluginId(entry.name, marketplace);
  const installPath = join(paths.installRoot, pluginId);
  const resolved = resolvePluginSource(entry.source);

  // Refresh flag = "redo from scratch": nuke the previous clone so the next
  // block re-fetches it. Without this we'd silently keep stale content.
  if (opts?.refresh) {
    await rm(installPath, { recursive: true, force: true });
  }

  if (!existsSync(installPath)) {
    await fetchInto(installPath, resolved, marketplace);
  }

  const loaded = await loadPlugin(installPath, { id: pluginId, source: marketplace });
  for (const w of loaded.warnings) {
    console.warn(`[plugger ${pluginId}] ${w}`);
  }

  let installedArtifacts: InstalledArtifacts;
  try {
    installedArtifacts = await translatePlugin(installPath, pluginId, { scope });
  } catch (translationError) {
    // Roll back to a clean state so the user can retry without debugging.
    await rm(installPath, { recursive: true, force: true });
    throw new Error(`Translation failed for ${pluginId}: ${errMsg(translationError)}`);
  }

  const metaPath = join(installPath, '.opencode-plugin-meta.json');
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        id: pluginId,
        name: entry.name,
        marketplace,
        installedAt: new Date().toISOString(),
        manifestVersion: loaded.manifest.version,
        scope,
        source: entry.source,
        installedArtifacts,
      },
      null,
      2,
    ),
  );

  return {
    id: pluginId,
    name: entry.name,
    marketplace,
    manifest: loaded.manifest,
    installPath,
    artifacts: installedArtifacts,
  };
}

/**
 * Materialize the plugin contents at `installPath`. Three branches:
 *
 *   - inline:     plugin lives inside the marketplace clone — just copy.
 *   - git-subdir: clone the full repo to a sibling `<installPath>.tmp`,
 *                 copy the requested subdir, then drop the tmp clone.
 *   - url/github: clone directly into `installPath`.
 *
 * Caller has already verified `installPath` doesn't exist (or has just
 * removed it for `refresh: true`).
 */
async function fetchInto(
  installPath: string,
  resolved: ReturnType<typeof resolvePluginSource>,
  marketplace: string,
): Promise<void> {
  if (resolved.inline) {
    // Marketplace clones are always global, regardless of install scope.
    const marketplaceCloneDir = join(homedir(), '.opencode', 'marketplaces', marketplace);
    const src = join(marketplaceCloneDir, resolved.inlinePath);
    if (!existsSync(src)) {
      throw new Error(`Inline plugin path not found in marketplace: ${src}`);
    }
    await cp(src, installPath, { recursive: true });
    return;
  }

  if (resolved.subPath) {
    const tmp = `${installPath}.tmp`;
    try {
      await gitClone(resolved.gitUrl, resolved.ref, tmp);
      const subdirSrc = join(tmp, resolved.subPath);
      if (!existsSync(subdirSrc)) {
        throw new Error(`Subdir "${resolved.subPath}" not found in cloned repo`);
      }
      await cp(subdirSrc, installPath, { recursive: true });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    return;
  }

  await gitClone(resolved.gitUrl, resolved.ref, installPath);
}

/**
 * Re-fetch a plugin and re-run the translator. Reads `source` and `scope`
 * from the existing meta — fails loudly if either is missing, because we
 * can't tell where to pull from. Equivalent to `installPlugin(..., {refresh: true})`
 * but addressable purely by `pluginId` (no need to look up the marketplace
 * entry again at the TUI layer).
 */
export async function updatePlugin(pluginId: string, opts?: { scope?: InstallScope }): Promise<InstalledPlugin> {
  assertValidPluginId(pluginId);

  const scope = opts?.scope ?? defaultScope();
  const paths = resolveScope(scope);
  const installPath = join(paths.installRoot, pluginId);
  const metaPath = join(installPath, '.opencode-plugin-meta.json');
  if (!existsSync(metaPath)) {
    throw new Error(`Cannot update ${pluginId}: meta file missing at ${metaPath}`);
  }

  const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as {
    name?: string;
    marketplace?: string;
    source?: PluginSource;
  };
  if (!meta.name || !meta.marketplace || meta.source === undefined) {
    throw new Error(
      `Cannot update ${pluginId}: meta is missing name/marketplace/source. ` +
      `Likely installed by an older plugger build. Uninstall and reinstall instead.`,
    );
  }

  const entry: PluginMarketplaceEntry = { name: meta.name, source: meta.source };
  return installPlugin(entry, meta.marketplace, { scope, refresh: true });
}

export async function isPluginInstalled(pluginId: string, scope?: InstallScope): Promise<boolean> {
  const paths = resolveScope(scope ?? defaultScope());
  return existsSync(join(paths.installRoot, pluginId, '.claude-plugin', 'plugin.json'));
}

export async function getInstalledPlugins(scope?: InstallScope): Promise<string[]> {
  try {
    const paths = resolveScope(scope ?? defaultScope());
    const { readdir } = await import('fs/promises');
    const entries = await readdir(paths.installRoot, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}
