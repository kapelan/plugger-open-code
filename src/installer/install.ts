import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { PluginMarketplaceEntry } from '../schemas/marketplace.js';
import type { InstalledPlugin } from '../types/index.js';
import { resolvePluginSource } from '../marketplace/sources.js';
import { loadPlugin } from '../loader/plugin.js';

const HOME = process.env.HOME || '~';
const INSTALL_DIR = join(HOME, '.opencode', 'plugins');

export async function installPlugin(entry: PluginMarketplaceEntry, marketplace: string): Promise<InstalledPlugin> {
  await mkdir(INSTALL_DIR, { recursive: true });

  const pluginId = `${entry.name}@${marketplace}`;
  const installPath = join(INSTALL_DIR, pluginId);

  // Clone plugin repository if not already present
  if (!existsSync(installPath)) {
    const { gitUrl, ref } = resolvePluginSource(entry.source);
    const { execa } = await import('execa');
    const branch = ref === 'HEAD' ? 'main' : ref;
    await execa('git', ['clone', '--depth', '1', '--single-branch', '--branch', branch, gitUrl, installPath]);
  }

  // Load plugin manifest directly (no translation)
  const loaded = await loadPlugin(installPath, { id: pluginId, source: marketplace });

  // Save registration metadata
  const metaPath = join(installPath, '.opencode-plugin-meta.json');
  await writeFile(metaPath, JSON.stringify({ id: pluginId, name: entry.name, marketplace, installedAt: new Date().toISOString(), manifestVersion: loaded.manifest.version }, null, 2));

  return {
    id: pluginId,
    name: entry.name,
    marketplace,
    manifest: loaded.manifest,
    installPath,
  };
}

export async function isPluginInstalled(pluginId: string): Promise<boolean> {
  return existsSync(join(INSTALL_DIR, pluginId, '.claude-plugin', 'plugin.json'));
}

export async function getInstalledPlugins(): Promise<string[]> {
  try {
    const { readdir } = await import('fs/promises');
    const entries = await readdir(INSTALL_DIR, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}
