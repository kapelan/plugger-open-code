import type {
  Marketplace,
  PluginMarketplaceEntry,
  PluginSource,
  PluginAuthor,
} from '../schemas/marketplace.js';
import type { PluginManifest } from '../schemas/plugin.js';

// Re-export inferred types from Zod schemas
export type { Marketplace, PluginMarketplaceEntry, PluginSource, PluginAuthor, PluginManifest };

/** An installed plugin from a marketplace. Returned by installPlugin/updatePlugin. */
export interface InstalledPlugin {
  /** `<name>@<marketplace>`. */
  id: string;
  name: string;
  marketplace: string;
  manifest: PluginManifest;
  installPath: string;
  /** What the translator wrote outside `installPath`. Useful for callers
   *  who want to report actual activation (vs trusting manifest fields). */
  artifacts: import('../translator/types.js').InstalledArtifacts;
}
