import { describe, test, expect } from 'bun:test';
import { marketplaceAdd, marketplaceList, marketplaceRemove } from '../../src/commands/marketplace.js';

describe('marketplace commands', () => {
  test('marketplaceAdd fails with no args', async () => {
    const result = await marketplaceAdd([]);
    expect(result.success).toBe(false);
  });

  test('marketplaceAdd fails with bad shorthand token', async () => {
    const result = await marketplaceAdd(['not-a-valid-source']);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Invalid source/);
  });

  test('marketplaceAdd github shorthand works', async () => {
    const result = await marketplaceAdd(['test/repo']);
    // Will fail to clone (no real repo), but parsing should succeed
    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed');
  });

  test('marketplaceList succeeds', async () => {
    // Don't assert on contents — tests share real ~/.opencode/ state.
    const result = await marketplaceList();
    expect(result.success).toBe(true);
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
