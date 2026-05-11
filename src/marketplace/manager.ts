import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { MarketplaceSchema, type Marketplace, type PluginMarketplaceEntry, type PluginSource } from '../schemas/marketplace.js';
import type { MarketplaceConfig } from '../types/index.js';

const HOME = process.env.HOME || '~';
const MARKETPLACE_DIR = join(HOME, '.opencode', 'marketplaces');
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
    const mpName = name || (source.source === 'github' ? source.repo.split('/')[1] : 'custom-marketplace');
    const cachePath = join(MARKETPLACE_DIR, mpName);

    if (!existsSync(cachePath)) {
      const { execa } = await import('execa');
      const { resolveMarketplaceSource } = await import('./sources.js');
      const { gitUrl, ref } = resolveMarketplaceSource(source);
      const branch = ref === 'HEAD' ? 'main' : ref;
      await execa('git', ['clone', '--depth', '1', '--single-branch', '--branch', branch, gitUrl, cachePath]);
    }

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
  }

  private async loadKnown(): Promise<KnownMarketplace[]> {
    try { return JSON.parse(await readFile(KNOWN_FILE, 'utf-8')); } catch { return []; }
  }
}
