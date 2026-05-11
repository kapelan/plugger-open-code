import { MarketplaceManager } from '../marketplace/manager.js';
import type { PluginSource } from '../schemas/marketplace.js';

const manager = new MarketplaceManager();

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * /marketplace add <source> [--name <name>]
 * Add a marketplace from a GitHub repo or Git URL.
 * 
 * Examples:
 *   /marketplace add anthropics/claude-plugins-official
 *   /marketplace add https://gitlab.com/user/repo.git --name my-mp
 *   /marketplace add --source git --url https://example.com/repo.git
 */
export async function marketplaceAdd(args: string[]): Promise<CommandResult> {
  try {
    let source: PluginSource;
    
    // Parse: /marketplace add owner/repo (github shorthand)
    //   or: /marketplace add --source github --repo owner/repo
    //   or: /marketplace add --source git --url https://...
    const sourceFlagIdx = args.indexOf('--source');
    
    if (sourceFlagIdx >= 0) {
      const type = args[sourceFlagIdx + 1];
      if (type === 'github') {
        const repoIdx = args.indexOf('--repo');
        const repo = repoIdx >= 0 ? args[repoIdx + 1] : undefined;
        if (!repo) return { success: false, message: 'Usage: /marketplace add --source github --repo owner/repo [--ref branch]' };
        source = { source: 'github', repo };
      } else if (type === 'git') {
        const urlIdx = args.indexOf('--url');
        const url = urlIdx >= 0 ? args[urlIdx + 1] : undefined;
        if (!url) return { success: false, message: 'Usage: /marketplace add --source git --url https://... [--ref branch]' };
        source = { source: 'git', url };
      } else {
        return { success: false, message: `Unknown source type: ${type}. Use "github" or "git".` };
      }
    } else if (args.length >= 1 && args[0].includes('/')) {
      // GitHub shorthand: owner/repo
      source = { source: 'github', repo: args[0] };
    } else if (args.length >= 1 && args[0].startsWith('http')) {
      // Git URL shorthand
      source = { source: 'git', url: args[0] };
    } else {
      return { success: false, message: 'Usage: /marketplace add <owner/repo | git-url> or /marketplace add --source github --repo owner/repo' };
    }
    
    await manager.init();
    const mp = await manager.addMarketplace(source);
    return {
      success: true,
      message: `Marketplace "${mp.name}" added with ${mp.plugins.length} plugin(s).`,
      data: { name: mp.name, pluginCount: mp.plugins.length },
    };
  } catch (error) {
    return { success: false, message: `Failed to add marketplace: ${(error as Error).message}` };
  }
}

/**
 * /marketplace list
 * List all added marketplaces.
 */
export async function marketplaceList(): Promise<CommandResult> {
  try {
    const list = await manager.listMarketplaces();
    if (list.length === 0) {
      return { success: true, message: 'No marketplaces added. Use /marketplace add <source> to add one.' };
    }
    const items = list.map(m => `  ${m.name} (${m.source.source === 'github' ? 'github:' + (m.source as any).repo : (m.source as any).url}) — updated ${m.lastUpdated}`);
    return { success: true, message: `Marketplaces:\n${items.join('\n')}`, data: list };
  } catch (error) {
    return { success: false, message: `Error: ${(error as Error).message}` };
  }
}

/**
 * /marketplace remove <name>
 * Remove a marketplace.
 */
export async function marketplaceRemove(args: string[]): Promise<CommandResult> {
  try {
    if (args.length === 0) {
      return { success: false, message: 'Usage: /marketplace remove <name>' };
    }
    await manager.removeMarketplace(args[0]);
    return { success: true, message: `Marketplace "${args[0]}" removed.` };
  } catch (error) {
    return { success: false, message: `Failed to remove: ${(error as Error).message}` };
  }
}
