import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { z } from 'zod';
import {
  MarketplaceSchema,
  IDENTIFIER_REGEX,
  PluginSourceSchema,
  type Marketplace,
  type PluginMarketplaceEntry,
  type PluginSource,
} from '../schemas/marketplace.js';
import { errMsg } from '../util/errors.js';

function defaultMarketplaceDir(): string {
  return join(homedir(), '.opencode', 'marketplaces');
}

/**
 * Shape of one entry in `<baseDir>/known_marketplaces.json`. Validated via
 * Zod at read time so a corrupted/tampered registry file can't poison
 * downstream operations (e.g. `getMarketplace` reading from a malicious
 * `cachePath`). Entries that fail validation are dropped and logged.
 */
const KnownMarketplaceSchema = z.object({
  name: z.string().regex(IDENTIFIER_REGEX),
  source: PluginSourceSchema,
  cachePath: z.string(),
  lastUpdated: z.string(),
});

type KnownMarketplace = z.infer<typeof KnownMarketplaceSchema>;

export interface MarketplaceManagerOptions {
  /**
   * Where marketplace clones and the registry file live. Defaults to
   * `~/.opencode/marketplaces`. Tests inject a tmpdir to avoid polluting
   * real `$HOME` state.
   */
  baseDir?: string;
}

export class MarketplaceManager {
  private cache: Map<string, Marketplace> = new Map();
  private readonly marketplaceDir: string;
  private readonly knownFile: string;

  constructor(opts?: MarketplaceManagerOptions) {
    this.marketplaceDir = opts?.baseDir ?? defaultMarketplaceDir();
    this.knownFile = join(this.marketplaceDir, 'known_marketplaces.json');
  }

  async init(): Promise<void> {
    await mkdir(this.marketplaceDir, { recursive: true });
  }

  async addMarketplace(source: PluginSource, name?: string): Promise<Marketplace> {
    if (name !== undefined && !IDENTIFIER_REGEX.test(name)) {
      throw new Error(`Invalid marketplace name "${name}": must match ${IDENTIFIER_REGEX}`);
    }
    const { deriveNameFromUrl, resolveMarketplaceSource } = await import('./sources.js');
    const resolved = resolveMarketplaceSource(source);
    if (resolved.inline) {
      throw new Error('Inline source (./path) can only appear inside a marketplace, not as a marketplace itself');
    }
    const mpName = name || deriveNameFromUrl(resolved.gitUrl);
    if (!IDENTIFIER_REGEX.test(mpName)) {
      throw new Error(`Derived marketplace name "${mpName}" is unsafe; pass an explicit --name`);
    }
    const cachePath = join(this.marketplaceDir, mpName);

    const cloned = !existsSync(cachePath);
    if (cloned) {
      const { gitClone } = await import('../util/git.js');
      await gitClone(resolved.gitUrl, resolved.ref, cachePath);
    }

    try {
      const manifestPath = join(cachePath, '.claude-plugin', 'marketplace.json');
      if (!existsSync(manifestPath)) {
        throw new Error(`marketplace.json not found at .claude-plugin/marketplace.json in ${mpName}`);
      }

      const content = await readFile(manifestPath, 'utf-8');
      const marketplace = MarketplaceSchema.parse(JSON.parse(content));
      this.cache.set(mpName, marketplace);

      const known = await this.loadKnown();
      const idx = known.findIndex(k => k.name === mpName);
      const entry: KnownMarketplace = { name: mpName, source, cachePath, lastUpdated: new Date().toISOString() };
      if (idx >= 0) known[idx] = entry; else known.push(entry);
      await writeFile(this.knownFile, JSON.stringify(known, null, 2));

      return marketplace;
    } catch (err) {
      // If we cloned the cache this call and validation failed, roll back so
      // the next attempt isn't stuck on a half-broken clone.
      if (cloned) {
        await rm(cachePath, { recursive: true, force: true }).catch(() => {});
      }
      throw err;
    }
  }

  async listMarketplaces(): Promise<KnownMarketplace[]> {
    return this.loadKnown();
  }

  async getMarketplace(name: string): Promise<Marketplace> {
    if (this.cache.has(name)) return this.cache.get(name)!;
    const known = await this.loadKnown();
    const entry = known.find(k => k.name === name);
    if (!entry) throw new Error(`Marketplace "${name}" not found. Use /marketplace add first.`);
    const manifestPath = join(entry.cachePath, '.claude-plugin', 'marketplace.json');
    const content = await readFile(manifestPath, 'utf-8');
    const mp = MarketplaceSchema.parse(JSON.parse(content));
    this.cache.set(name, mp);
    return mp;
  }

  async searchPlugins(query: string): Promise<{ plugin: PluginMarketplaceEntry; marketplace: string }[]> {
    const results: { plugin: PluginMarketplaceEntry; marketplace: string }[] = [];
    const known = await this.loadKnown();
    const q = query.toLowerCase();
    for (const km of known) {
      try {
        const mp = await this.getMarketplace(km.name);
        for (const plugin of mp.plugins) {
          if (plugin.name.toLowerCase().includes(q) || plugin.description?.toLowerCase().includes(q) || plugin.tags?.some(t => t.toLowerCase().includes(q))) {
            results.push({ plugin, marketplace: km.name });
          }
        }
      } catch (e) {
        // Don't let one bad marketplace blank the whole search. Surface
        // why we skipped it so the user can fix it (vs silent empty).
        console.warn(`[plugger] skipping marketplace "${km.name}" during search: ${errMsg(e)}`);
      }
    }
    return results;
  }

  async removeMarketplace(name: string): Promise<void> {
    const known = await this.loadKnown();
    const entry = known.find(k => k.name === name);
    if (!entry) throw new Error(`Marketplace "${name}" not found.`);
    const remaining = known.filter(k => k.name !== name);
    await writeFile(this.knownFile, JSON.stringify(remaining, null, 2));
    this.cache.delete(name);
    await rm(entry.cachePath, { recursive: true, force: true }).catch(() => {});
  }

  private async loadKnown(): Promise<KnownMarketplace[]> {
    let raw: string;
    try {
      raw = await readFile(this.knownFile, 'utf-8');
    } catch (e) {
      // Missing file = first run. Anything else (perm denied, EIO) is
      // worth knowing about; log and treat as empty so we don't crash.
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn(`[plugger] could not read ${this.knownFile}: ${errMsg(e)}`);
      }
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn(`[plugger] ${this.knownFile} is corrupted JSON (${errMsg(e)}). Treating registry as empty; fix or delete the file to recover.`);
      return [];
    }

    if (!Array.isArray(parsed)) {
      console.warn(`[plugger] ${this.knownFile} is not an array; treating registry as empty.`);
      return [];
    }

    // Validate each entry; drop and log invalid ones rather than failing
    // the whole call. This is the trust boundary for tampered cachePath.
    const valid: KnownMarketplace[] = [];
    for (const entry of parsed) {
      const r = KnownMarketplaceSchema.safeParse(entry);
      if (r.success) {
        valid.push(r.data);
      } else {
        console.warn(`[plugger] dropping malformed marketplace entry: ${r.error.message}`);
      }
    }
    return valid;
  }
}

/**
 * Shared singleton for command handlers. Command modules used to each
 * instantiate their own manager, which split the in-memory cache.
 */
export const sharedMarketplaceManager = new MarketplaceManager();
