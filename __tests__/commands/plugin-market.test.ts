import { describe, test, expect } from 'bun:test';
import { pluginMarketplaceSearch, pluginMarketplaceInstall, pluginMarketplaceList } from '../../src/commands/plugin-market.js';

describe('plugin marketplace commands', () => {
  test('pluginMarketplaceSearch fails with no query', async () => {
    const result = await pluginMarketplaceSearch([]);
    expect(result.success).toBe(false);
  });

  test('pluginMarketplaceSearch returns empty results', async () => {
    const result = await pluginMarketplaceSearch(['nonexistent-plugin-xyz']);
    expect(result.success).toBe(true);
    expect(result.message).toContain('No plugins found');
  });

  test('pluginMarketplaceInstall fails with no args', async () => {
    const result = await pluginMarketplaceInstall([]);
    expect(result.success).toBe(false);
  });

  test('pluginMarketplaceInstall fails for unknown plugin', async () => {
    const result = await pluginMarketplaceInstall(['nonexistent@marketplace']);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  test('pluginMarketplaceList without args shows no marketplaces message', async () => {
    const result = await pluginMarketplaceList([]);
    expect(result.success).toBe(true);
    expect(result.message).toContain('No marketplaces');
  });
});
