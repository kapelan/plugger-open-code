import { PluginSourceSchema } from '../schemas/marketplace.js';
import type { PluginSource } from '../types/index.js';

export interface ResolvedSource {
  /** Git URL to clone. For inline (string) sources this is empty — caller
   *  should resolve the path against the marketplace's local checkout. */
  gitUrl: string;
  /** Branch/tag/sha to checkout. 'HEAD' = default branch. */
  ref: string;
  /** Manifest path relative to the cloned root. */
  manifestPath: string;
  /** Subdirectory inside the cloned repo (for git-subdir). Empty if none. */
  subPath: string;
  /** True when the source is inline (string) and lives inside the
   *  marketplace clone — no separate clone needed. */
  inline: boolean;
  /** The relative path inside the marketplace (only set when inline). */
  inlinePath: string;
}

function pickRef(s: { ref?: string; sha?: string; commit?: string }): string {
  return s.sha || s.commit || s.ref || 'HEAD';
}

/**
 * Resolve a `PluginSource` to the concrete fields needed to fetch the
 * marketplace manifest from it.
 */
export function resolveMarketplaceSource(source: PluginSource): ResolvedSource {
  PluginSourceSchema.parse(source);

  if (typeof source === 'string') {
    return {
      gitUrl: '',
      ref: 'HEAD',
      manifestPath: `${source.replace(/\/+$/, '')}/.claude-plugin/marketplace.json`,
      subPath: source,
      inline: true,
      inlinePath: source,
    };
  }

  if (source.source === 'github') {
    return {
      gitUrl: `https://github.com/${source.repo}.git`,
      ref: pickRef(source),
      manifestPath: source.path
        ? `${source.path}/.claude-plugin/marketplace.json`
        : '.claude-plugin/marketplace.json',
      subPath: source.path || '',
      inline: false,
      inlinePath: '',
    };
  }

  // 'url' and 'git-subdir' share the URL field.
  const subPath = 'path' in source && source.path ? source.path : '';
  return {
    gitUrl: source.url,
    ref: pickRef(source),
    manifestPath: subPath
      ? `${subPath}/.claude-plugin/marketplace.json`
      : '.claude-plugin/marketplace.json',
    subPath,
    inline: false,
    inlinePath: '',
  };
}

/**
 * Same as `resolveMarketplaceSource` but with `manifestPath` pointing at
 * the plugin manifest (.claude-plugin/plugin.json).
 */
export function resolvePluginSource(source: PluginSource): ResolvedSource {
  const r = resolveMarketplaceSource(source);
  const dir = r.subPath || (r.inline ? r.inlinePath : '');
  return {
    ...r,
    manifestPath: dir
      ? `${dir}/.claude-plugin/plugin.json`
      : '.claude-plugin/plugin.json',
  };
}

/**
 * Derive a sensible name from a git URL — last path segment, `.git` stripped.
 */
export function deriveNameFromUrl(url: string): string {
  const stripped = url.replace(/\.git$/, '').replace(/\/+$/, '');
  const segments = stripped.split('/').filter(Boolean);
  return segments[segments.length - 1] || 'custom-marketplace';
}
