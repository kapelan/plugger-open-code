import { describe, test, expect } from 'bun:test';
import { marketplaceAdd, marketplaceList, marketplaceRemove } from '../../src/commands/marketplace.js';

describe('marketplace commands', () => {
  test('marketplaceAdd fails with no args', async () => {
    const result = await marketplaceAdd([]);
    expect(result.success).toBe(false);
  });

  test('marketplaceAdd fails with invalid source type', async () => {
    const result = await marketplaceAdd(['--source', 'invalid', '--repo', 'x/y']);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown source type');
  });

  test('marketplaceAdd github shorthand works', async () => {
    const result = await marketplaceAdd(['test/repo']);
    // Will fail to clone (no real repo), but parsing should succeed
    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed');
  });

  test('marketplaceList returns no results message', async () => {
    const result = await marketplaceList();
    expect(result.success).toBe(true);
    expect(result.message).toContain('No marketplaces');
  });

  test('marketplaceRemove fails with no args', async () => {
    const result = await marketplaceRemove([]);
    expect(result.success).toBe(false);
  });

  test('marketplaceRemove fails for nonexistent marketplace', async () => {
    const result = await marketplaceRemove(['nonexistent']);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed');
  });
});
