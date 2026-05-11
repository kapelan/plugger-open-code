import { describe, test, expect } from 'bun:test';
import { resolveMarketplaceSource, resolvePluginSource } from '../../src/marketplace/sources.js';

describe('resolveMarketplaceSource', () => {
  test('resolves github source with defaults', () => {
    const result = resolveMarketplaceSource({
      source: 'github',
      repo: 'anthropics/claude-plugins-official',
    });
    expect(result).toEqual({
      gitUrl: 'https://github.com/anthropics/claude-plugins-official.git',
      ref: 'HEAD',
      manifestPath: '.claude-plugin/marketplace.json',
    });
  });

  test('resolves github source with custom ref', () => {
    const result = resolveMarketplaceSource({
      source: 'github',
      repo: 'user/repo',
      ref: 'develop',
    });
    expect(result.ref).toBe('develop');
  });

  test('resolves git source with custom URL', () => {
    const result = resolveMarketplaceSource({
      source: 'git',
      url: 'https://gitlab.com/user/repo.git',
    });
    expect(result.gitUrl).toBe('https://gitlab.com/user/repo.git');
    expect(result.ref).toBe('HEAD');
  });

  test('resolves git source with custom ref and path', () => {
    const result = resolveMarketplaceSource({
      source: 'git',
      url: 'https://example.com/repo',
      ref: 'develop',
      path: 'custom/path.json',
    });
    expect(result).toEqual({
      gitUrl: 'https://example.com/repo',
      ref: 'develop',
      manifestPath: 'custom/path.json',
    });
  });

  test('throws on missing repo for github source', () => {
    expect(() =>
      resolveMarketplaceSource({ source: 'github' } as any)
    ).toThrow();
  });

  test('throws on missing url for git source', () => {
    expect(() =>
      resolveMarketplaceSource({ source: 'git' } as any)
    ).toThrow();
  });
});

describe('resolvePluginSource', () => {
  test('uses .claude-plugin/plugin.json by default', () => {
    const result = resolvePluginSource({
      source: 'github',
      repo: 'user/plugin',
    });
    expect(result.manifestPath).toBe('.claude-plugin/plugin.json');
  });

  test('uses custom path with plugin.json', () => {
    const result = resolvePluginSource({
      source: 'github',
      repo: 'user/plugin',
      path: 'subdir',
    });
    expect(result.manifestPath).toBe('subdir/.claude-plugin/plugin.json');
  });
});
