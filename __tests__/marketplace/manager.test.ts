import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarketplaceManager } from '../../src/marketplace/manager.js';

describe('MarketplaceManager', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = join(tmpdir(), `mpmgr-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(baseDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test('initializes without errors', async () => {
    const manager = new MarketplaceManager({ baseDir });
    await manager.init();
  });

  test('listMarketplaces returns empty array when no marketplaces (verified — not just shape)', async () => {
    const manager = new MarketplaceManager({ baseDir });
    const list = await manager.listMarketplaces();
    expect(list).toEqual([]);
  });

  test('addMarketplace rejects invalid source', async () => {
    const manager = new MarketplaceManager({ baseDir });
    await expect(manager.addMarketplace({ source: 'github' } as any)).rejects.toThrow();
  });

  test('searchPlugins returns [] with no marketplaces registered', async () => {
    const manager = new MarketplaceManager({ baseDir });
    const results = await manager.searchPlugins('zzz-no-such-plugin-zzz');
    expect(results).toEqual([]);
  });

  test('removeMarketplace throws for non-existent', async () => {
    const manager = new MarketplaceManager({ baseDir });
    await expect(manager.removeMarketplace('nonexistent')).rejects.toThrow('not found');
  });
});
