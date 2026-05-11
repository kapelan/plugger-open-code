import { describe, test, expect } from 'bun:test';
import { MarketplaceManager } from '../../src/marketplace/manager.js';

describe('MarketplaceManager', () => {
  test('initializes without errors', async () => {
    const manager = new MarketplaceManager();
    await manager.init();
  });

  test('listMarketplaces returns empty array when no marketplaces', async () => {
    const manager = new MarketplaceManager();
    const list = await manager.listMarketplaces();
    expect(Array.isArray(list)).toBe(true);
  });

  test('addMarketplace rejects invalid source', async () => {
    const manager = new MarketplaceManager();
    await expect(manager.addMarketplace({ source: 'github' } as any)).rejects.toThrow();
  });

  test('searchPlugins returns empty for no marketplaces', async () => {
    const manager = new MarketplaceManager();
    const results = await manager.searchPlugins('test');
    expect(results).toEqual([]);
  });

  test('removeMarketplace throws for non-existent', async () => {
    const manager = new MarketplaceManager();
    await expect(manager.removeMarketplace('nonexistent')).rejects.toThrow('not found');
  });
});
