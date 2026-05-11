import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';
import {
  MarketplaceSchema,
  IDENTIFIER_REGEX,
  type Marketplace,
  type PluginMarketplaceEntry,
  type PluginSource,
} from '../schemas/marketplace.js';

const MARKETPLACE_DIR = join(homedir(), '.opencode', 'marketplaces');
const KNOWN_FILE = join(MARKETPLACE_DIR, 'known_marketplaces.json');

interface KnownMarketplace {
  name: string;
  source: PluginSource;
  cachePath: string;
  lastUpdated: string;
}

export class MarketplaceManager {
  private cache: Map<string, Marketplace> = new Map();

  async init(): Promise<void> {
    await mkdir(MARKETPLACE_DIR, { recursive: true });
  }

  async addMarketplace(source: PluginSource, name?: string): Promise<Marketplace> {
    if (name !== undefined && !IDENTIFIER_REGEX.test(name)) {
      throw new Error(`Invalid marketplace name "${name}": must match ${IDENTIFIER_REGEX}`);
    }
    const mpName = name || (source.source === 'github' ? source.repo.split('/')[1] : 'custom-marketplace');
    if (!IDENTIFIER_REGEX.test(mpName)) {
      throw new Error(`Derived marketplace name "${mpName}" is unsafe; pass an explicit --name`);
    }
    const cachePath = join(MARKETPLACE_DIR, mpName);

    const cloned = !existsSync(cachePath);
    if (cloned) {
      const { execa } = await import('execa');
      const { resolveMarketplaceSource } = await import('./sources.js');
      const { gitUrl, ref } = resolveMarketplaceSource(source);
      const branch = ref === 'HEAD' ? 'main' : ref;
      await execa('git', ['clone', '--depth', '1', '--single-branch', '--branch', branch, '--', gitUrl, cachePath]);
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
      await writeFile(KNOWN_FILE, JSON.stringify(known, null, 2));

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
      } catch {}
    }
    return results;
  }

  async removeMarketplace(name: string): Promise<void> {
    const known = await this.loadKnown();
    const entry = known.find(k => k.name === name);
    if (!entry) throw new Error(`Marketplace "${name}" not found.`);
    const remaining = known.filter(k => k.name !== name);
    await writeFile(KNOWN_FILE, JSON.stringify(remaining, null, 2));
    this.cache.delete(name);
    await rm(entry.cachePath, { recursive: true, force: true }).catch(() => {});
  }

  private async loadKnown(): Promise<KnownMarketplace[]> {
    try { return JSON.parse(await readFile(KNOWN_FILE, 'utf-8')); } catch { return []; }
  }
}

/**
 * Shared singleton for command handlers. Command modules used to each
 * instantiate their own manager, which split the in-memory cache.
 */
export const sharedMarketplaceManager = new MarketplaceManager();
