import { translateCommands } from './commands.js';
import { translateSkills } from './skills.js';
import { translateMcpServers } from './mcp.js';
import { translateHooks } from './hooks.js';
import { emptyArtifacts, type InstalledArtifacts } from './types.js';
import type { InstallScope } from './scope.js';

export type { InstalledArtifacts, InstallScope };
export { emptyArtifacts };
export { resolveScope, defaultScope, type ScopePaths } from './scope.js';

export interface TranslateOptions {
  scope?: InstallScope;
}

export async function translatePlugin(
  installPath: string,
  pluginId: string,
  opts?: TranslateOptions,
): Promise<InstalledArtifacts> {
  const artifacts = emptyArtifacts();
  artifacts.commands = await translateCommands(installPath, pluginId, opts);
  artifacts.skills = await translateSkills(installPath, pluginId, opts);
  artifacts.mcpServers = await translateMcpServers(installPath, pluginId, opts);
  artifacts.hooks = await translateHooks(installPath, pluginId, opts);
  return artifacts;
}
