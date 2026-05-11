import { sharedMarketplaceManager as manager } from '../marketplace/manager.js';
import { installPlugin } from '../installer/install.js';
import type { PluginMarketplaceEntry } from '../schemas/marketplace.js';

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
    return { success: false, message: `Search failed: ${(error as Error).message}` };
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

    // Install
    const match = matches[0];
    const installed = await installPlugin(match.plugin, match.marketplace);
    const caps = [];
    if (installed.manifest.commands) caps.push('commands');
    if (installed.manifest.hooks) caps.push('hooks');
    if (installed.manifest.skills) caps.push('skills');
    if (installed.manifest.mcpServers) caps.push('MCP servers');

    return {
      success: true,
      message: `Plugin "${installed.id}" installed successfully!${caps.length ? ` Provides: ${caps.join(', ')}` : ''}`,
      data: installed,
    };
  } catch (error) {
    return { success: false, message: `Install failed: ${(error as Error).message}` };
  }
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
    return { success: false, message: `Error: ${(error as Error).message}` };
  }
}
