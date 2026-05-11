import type {
  Marketplace,
  PluginMarketplaceEntry,
  PluginSource,
  PluginAuthor,
} from '../schemas/marketplace.js';
import type { PluginManifest } from '../schemas/plugin.js';

// Re-export inferred types from Zod schemas
export type { Marketplace, PluginMarketplaceEntry, PluginSource, PluginAuthor, PluginManifest };

// An installed plugin from a marketplace
export interface InstalledPlugin {
  id: string;          // '{name}@{marketplace}'
  name: string;
  marketplace: string;
  manifest: PluginManifest;
  installPath: string;
}

// A loaded plugin ready for use
export interface LoadedPlugin {
  id: string;
  name: string;
  manifest: PluginManifest;
  path: string;
  source: string;
}
