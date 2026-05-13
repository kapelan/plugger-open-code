/**
 * @sulesky/claude-marketplace
 *
 * OpenCode plugin entry point. Exposes marketplace command handlers as
 * OpenCode tools so they're invokable from the assistant.
 */

import { tool, type Plugin } from '@opencode-ai/plugin';
import {
  marketplaceAdd,
  marketplaceList,
  marketplaceRemove,
} from './commands/marketplace.js';
import {
  pluginMarketplaceSearch,
  pluginMarketplaceInstall,
  pluginMarketplaceList,
} from './commands/plugin-market.js';

const z = tool.schema;

const tokenize = (s: string): string[] =>
  s.trim().length === 0 ? [] : s.trim().split(/\s+/);

const render = (r: { success: boolean; message: string }): string =>
  r.success ? r.message : `error: ${r.message}`;

export const ClaudeMarketplacePlugin: Plugin = async () => {
  return {
  tool: {
    marketplace_add: tool({
      description:
        'Register a Claude Code marketplace. Pass a GitHub shorthand "owner/repo" or a git URL.',
      args: {
        source: z
          .string()
          .describe('GitHub shorthand "owner/repo" or a full https/git/ssh/file URL.'),
        name: z
          .string()
          .optional()
          .describe('Optional name override. Defaults to the repo name.'),
        ref: z
          .string()
          .optional()
          .describe('Optional branch or tag to clone. Defaults to the remote HEAD.'),
      },
      async execute({ source, name, ref }) {
        const args: string[] = [source];
        if (name) args.push('--name', name);
        if (ref) args.push('--ref', ref);
        return render(await marketplaceAdd(args));
      },
    }),

    marketplace_list: tool({
      description: 'List all registered Claude Code marketplaces.',
      args: {},
      async execute() {
        return render(await marketplaceList());
      },
    }),

    marketplace_remove: tool({
      description: 'Remove a registered marketplace by name. Also deletes its on-disk clone.',
      args: {
        name: z.string().describe('The marketplace name to remove.'),
      },
      async execute({ name }) {
        return render(await marketplaceRemove([name]));
      },
    }),

    plugin_marketplace_search: tool({
      description:
        'Search for plugins across all registered marketplaces. Matches name, description, and tags.',
      args: {
        query: z.string().describe('Search term.'),
      },
      async execute({ query }) {
        return render(await pluginMarketplaceSearch(tokenize(query)));
      },
    }),

    plugin_marketplace_install: tool({
      description:
        'Install a plugin from a registered marketplace. Use "name@marketplace" or a bare name if unambiguous.',
      args: {
        plugin: z.string().describe('Plugin identifier: "name" or "name@marketplace".'),
      },
      async execute({ plugin }) {
        return render(await pluginMarketplaceInstall([plugin]));
      },
    }),

    plugin_marketplace_list: tool({
      description:
        'List plugins in a marketplace, or in all marketplaces if no name is given.',
      args: {
        marketplace: z
          .string()
          .optional()
          .describe('Optional marketplace name. Lists all marketplaces if omitted.'),
      },
      async execute({ marketplace }) {
        return render(await pluginMarketplaceList(marketplace ? [marketplace] : []));
      },
    }),
  },
  };
};

export default ClaudeMarketplacePlugin;
