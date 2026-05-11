import { z } from 'zod';
import type { PluginSource } from '../types/index.js';

// Validation schema for source input
const SourceInputSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('github'),
    repo: z.string().min(1, 'repo is required for github source'),
    ref: z.string().optional(),
    path: z.string().optional(),
  }),
  z.object({
    source: z.literal('git'),
    url: z.string().min(1, 'url is required for git source'),
    ref: z.string().optional(),
    path: z.string().optional(),
  }),
]);

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
  // Validate input
  SourceInputSchema.parse(source);

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
