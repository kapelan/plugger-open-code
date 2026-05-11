import { PluginSourceSchema } from '../schemas/marketplace.js';
import type { PluginSource } from '../types/index.js';

export interface ResolvedSource {
  gitUrl: string;
  ref: string;
  manifestPath: string;
}

/**
 * Resolve a PluginSource into a concrete git URL, ref, and manifest path.
 * This is used by the marketplace manager to clone marketplace repositories.
 */
export function resolveMarketplaceSource(source: PluginSource): ResolvedSource {
  PluginSourceSchema.parse(source);

  let gitUrl: string;
  const ref = source.ref || 'HEAD';
  const manifestPath = source.path || '.claude-plugin/marketplace.json';

  switch (source.source) {
    case 'github':
      gitUrl = `https://github.com/${source.repo}.git`;
      break;
    case 'git':
      gitUrl = source.url;
      break;
    default:
      throw new Error(`Unsupported source type: ${(source as any).source}`);
  }

  return { gitUrl, ref, manifestPath };
}

/**
 * Resolve a PluginSource for a plugin (uses .claude-plugin/plugin.json)
 */
export function resolvePluginSource(source: PluginSource): ResolvedSource {
  const resolved = resolveMarketplaceSource(source);
  return {
    ...resolved,
    manifestPath: source.path
      ? `${source.path}/.claude-plugin/plugin.json`
      : '.claude-plugin/plugin.json',
  };
}
