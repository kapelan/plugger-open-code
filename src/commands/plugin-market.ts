import { sharedMarketplaceManager as manager } from '../marketplace/manager.js';
import { installPlugin } from '../installer/install.js';
import type { InstalledPlugin } from '../types/index.js';
import { errMsg } from '../util/errors.js';

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * /plugin marketplace-search <query>
 * Search for plugins across all marketplaces.
 */
export async function pluginMarketplaceSearch(args: string[]): Promise<CommandResult> {
  try {
    if (args.length === 0) {
      return { success: false, message: 'Usage: /plugin marketplace-search <query>' };
    }
    const query = args.join(' ');
    const results = await manager.searchPlugins(query);
    if (results.length === 0) {
      return { success: true, message: `No plugins found matching "${query}".`, data: [] };
    }
    const items = results.map(r => `  ${r.plugin.name}@${r.marketplace} — ${r.plugin.description || 'no description'}`);
    return { success: true, message: `Found ${results.length} plugin(s):\n${items.join('\n')}`, data: results };
  } catch (error) {
    return { success: false, message: `Search failed: ${errMsg(error)}` };
  }
}

/**
 * /plugin marketplace-install <plugin-id>
 * Install a plugin by ID (name@marketplace or bare name).
 * If bare name and ambiguous, lists matches.
 */
export async function pluginMarketplaceInstall(args: string[]): Promise<CommandResult> {
  try {
    if (args.length === 0) {
      return { success: false, message: 'Usage: /plugin marketplace-install <plugin-id> (e.g. "my-plugin@marketplace")' };
    }
    const identifier = args[0];

    // Parse: name@marketplace or bare name
    let pluginName: string;
    let marketplaceName: string | undefined;

    const atIndex = identifier.lastIndexOf('@');
    if (atIndex > 0) {
      pluginName = identifier.slice(0, atIndex);
      marketplaceName = identifier.slice(atIndex + 1);
    } else {
      pluginName = identifier;
    }

    // Search for the plugin
    const results = await manager.searchPlugins(pluginName);

    // Filter exact name match, optionally by marketplace
    const matches = results.filter(r => {
      if (r.plugin.name !== pluginName) return false;
      if (marketplaceName && r.marketplace !== marketplaceName) return false;
      return true;
    });

    if (matches.length === 0) {
      return { success: false, message: `Plugin "${identifier}" not found in any marketplace. Try /plugin marketplace-search ${pluginName}` };
    }

    if (matches.length > 1 && !marketplaceName) {
      const options = matches.map(m => `  ${m.plugin.name}@${m.marketplace}`);
      return { success: false, message: `Multiple plugins found. Specify the full ID:\n${options.join('\n')}` };
    }

    const match = matches[0];
    const installed = await installPlugin(match.plugin, match.marketplace);
    const caps = describeActivation(installed);

    return {
      success: true,
      message: `Plugin "${installed.id}" installed${caps ? ` (${caps})` : ''}.`,
      data: installed,
    };
  } catch (error) {
    return { success: false, message: `Install failed: ${errMsg(error)}` };
  }
}

/**
 * Summarize what was activated based on the actual translator output —
 * not the plugin.json `commands`/`skills` fields (which the translator
 * ignores). Returns empty string for plugins that activated nothing,
 * which callers can treat as "no decoration".
 */
function describeActivation(installed: InstalledPlugin): string {
  const a = installed.artifacts;
  const parts: string[] = [];
  if (a.commands.length) parts.push(`${a.commands.length} command${a.commands.length === 1 ? '' : 's'}`);
  if (a.skills.length) parts.push(`${a.skills.length} skill file${a.skills.length === 1 ? '' : 's'}`);
  if (a.mcpServers.length) parts.push(`${a.mcpServers.length} MCP server${a.mcpServers.length === 1 ? '' : 's'}`);
  if (a.hooks.length) parts.push('hooks');
  return parts.join(', ');
}

/**
 * /plugin marketplace-list [marketplace]
 * List plugins in a marketplace or all marketplaces.
 */
export async function pluginMarketplaceList(args: string[]): Promise<CommandResult> {
  try {
    if (args.length > 0) {
      const mp = await manager.getMarketplace(args[0]);
      const items = mp.plugins.map(p => `  ${p.name} — ${p.description || 'no description'}`);
      return { success: true, message: `Plugins in "${args[0]}" (${mp.plugins.length}):\n${items.join('\n')}`, data: mp.plugins };
    }

    const known = await manager.listMarketplaces();
    if (known.length === 0) {
      return { success: true, message: 'No marketplaces added. Use /marketplace add to add one.', data: [] };
    }

    const lines: string[] = [];
    for (const km of known) {
      try {
        const mp = await manager.getMarketplace(km.name);
        lines.push(`${km.name} (${mp.plugins.length} plugins):`);
        for (const p of mp.plugins) {
          lines.push(`  ${p.name} — ${p.description || 'no description'}`);
        }
      } catch { lines.push(`${km.name}: (failed to load)`); }
    }
    return { success: true, message: lines.join('\n'), data: known };
  } catch (error) {
    return { success: false, message: `Error: ${errMsg(error)}` };
  }
}
