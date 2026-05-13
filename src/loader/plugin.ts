import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { PluginManifestSchema, type PluginManifest } from '../schemas/plugin.js';
import { errMsg } from '../util/errors.js';

export interface PluginLoadResult {
  id: string;
  name: string;
  manifest: PluginManifest;
  path: string;
  source: string;
  warnings: string[];
}

export async function loadPlugin(pluginDir: string, options?: { id?: string; source?: string }): Promise<PluginLoadResult> {
  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) throw new Error(`plugin.json not found at ${manifestPath}`);
  const content = await readFile(manifestPath, 'utf-8');
  let raw: unknown;
  try { raw = JSON.parse(content); } catch (e) { throw new Error(`Invalid JSON: ${errMsg(e)}`); }
  const manifest = PluginManifestSchema.parse(raw);
  const warnings: string[] = [];
  if (manifest.agents) warnings.push('agents field present — Claude Code agents are not supported in OpenCode');
  if (manifest.outputStyles) warnings.push('outputStyles field present — Claude Code output styles are not supported');
  if (manifest.lspServers) warnings.push('lspServers field present — LSP servers are not supported in OpenCode');
  return { id: options?.id || manifest.name, name: manifest.name, manifest, path: pluginDir, source: options?.source || 'local', warnings };
}

export function getPluginCapabilities(plugin: PluginLoadResult) {
  return {
    hasCommands: !!plugin.manifest.commands && plugin.manifest.commands.length > 0,
    hasHooks: !!plugin.manifest.hooks && Object.keys(plugin.manifest.hooks).length > 0,
    hasSkills: !!plugin.manifest.skills && plugin.manifest.skills.length > 0,
    hasMcpServers: !!plugin.manifest.mcpServers && Object.keys(plugin.manifest.mcpServers).length > 0,
  };
}
