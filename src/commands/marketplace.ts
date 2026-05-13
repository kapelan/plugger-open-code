import { sharedMarketplaceManager as manager } from '../marketplace/manager.js';
import { toPluginSource } from '../schemas/marketplace.js';
import { errMsg } from '../util/errors.js';

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * /marketplace add <source> [--name <name>] [--ref <ref>]
 *
 * `<source>` accepts either "owner/repo" GitHub shorthand or a full
 * https/git/ssh/file URL. Both are translated into the canonical Claude Code
 * marketplace source form (`{source: "url", url, ref?}`).
 */
export async function marketplaceAdd(args: string[]): Promise<CommandResult> {
  try {
    if (args.length === 0 || args[0].startsWith('--')) {
      return { success: false, message: 'Usage: /marketplace add <owner/repo | git-url> [--name <name>] [--ref <ref>]' };
    }
    const token = args[0];
    const nameIdx = args.indexOf('--name');
    const refIdx = args.indexOf('--ref');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
    const ref = refIdx >= 0 ? args[refIdx + 1] : undefined;

    const source = toPluginSource(token, ref ? { ref } : undefined);

    await manager.init();
    const mp = await manager.addMarketplace(source, name);
    return {
      success: true,
      message: `Marketplace "${mp.name}" added with ${mp.plugins.length} plugin(s).`,
      data: { name: mp.name, pluginCount: mp.plugins.length },
    };
  } catch (error) {
    return { success: false, message: `Failed to add marketplace: ${errMsg(error)}` };
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
    const items = list.map(m => {
      const s = m.source;
      const where = typeof s === 'string'
        ? s
        : s.source === 'github'
          ? `github:${s.repo}${s.commit || s.ref ? `@${s.commit ?? s.ref}` : ''}`
          : `${s.url}${s.ref ? `@${s.ref}` : ''}`;
      return `  ${m.name} (${where}) — updated ${m.lastUpdated}`;
    });
    return { success: true, message: `Marketplaces:\n${items.join('\n')}`, data: list };
  } catch (error) {
    return { success: false, message: `Error: ${errMsg(error)}` };
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
    return { success: false, message: `Failed to remove: ${errMsg(error)}` };
  }
}
