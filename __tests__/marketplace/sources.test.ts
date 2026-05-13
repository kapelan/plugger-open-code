import { describe, test, expect } from 'bun:test';
import {
  resolveMarketplaceSource,
  resolvePluginSource,
  deriveNameFromUrl,
} from '../../src/marketplace/sources.js';

describe('resolveMarketplaceSource', () => {
  test('resolves a url source with defaults', () => {
    const result = resolveMarketplaceSource({
      source: 'url',
      url: 'https://github.com/anthropics/claude-plugins-official.git',
    });
    expect(result).toMatchObject({
      gitUrl: 'https://github.com/anthropics/claude-plugins-official.git',
      ref: 'HEAD',
      manifestPath: '.claude-plugin/marketplace.json',
      inline: false,
    });
  });

  test('resolves a url source with custom ref', () => {
    const result = resolveMarketplaceSource({
      source: 'url',
      url: 'https://github.com/user/repo.git',
      ref: 'develop',
    });
    expect(result.ref).toBe('develop');
  });

  test('resolves a non-github git URL', () => {
    const result = resolveMarketplaceSource({
      source: 'url',
      url: 'https://gitlab.com/user/repo.git',
    });
    expect(result.gitUrl).toBe('https://gitlab.com/user/repo.git');
    expect(result.ref).toBe('HEAD');
  });

  test('resolves with custom subdir path', () => {
    const result = resolveMarketplaceSource({
      source: 'url',
      url: 'https://example.com/repo',
      ref: 'develop',
      path: 'custom/subdir',
    });
    expect(result).toMatchObject({
      gitUrl: 'https://example.com/repo',
      ref: 'develop',
      manifestPath: 'custom/subdir/.claude-plugin/marketplace.json',
      subPath: 'custom/subdir',
    });
  });

  test('resolves a git-subdir source', () => {
    const result = resolveMarketplaceSource({
      source: 'git-subdir',
      url: 'https://github.com/owner/monorepo.git',
      path: 'packages/x',
      sha: 'abcdef123',
    });
    expect(result).toMatchObject({
      gitUrl: 'https://github.com/owner/monorepo.git',
      ref: 'abcdef123',
      manifestPath: 'packages/x/.claude-plugin/marketplace.json',
      subPath: 'packages/x',
    });
  });

  test('resolves an inline (string) source', () => {
    const result = resolveMarketplaceSource('./plugins/foo' as any);
    expect(result).toMatchObject({
      inline: true,
      inlinePath: './plugins/foo',
      manifestPath: './plugins/foo/.claude-plugin/marketplace.json',
    });
  });

  test('resolves a github source with commit', () => {
    const result = resolveMarketplaceSource({
      source: 'github',
      repo: 'owner/repo',
      commit: 'abc123',
    });
    expect(result).toMatchObject({
      gitUrl: 'https://github.com/owner/repo.git',
      ref: 'abc123',
    });
  });

  test('throws on missing url', () => {
    expect(() => resolveMarketplaceSource({ source: 'url' } as any)).toThrow();
  });
});

describe('resolvePluginSource', () => {
  test('uses .claude-plugin/plugin.json by default', () => {
    const result = resolvePluginSource({
      source: 'url',
      url: 'https://github.com/user/plugin.git',
    });
    expect(result.manifestPath).toBe('.claude-plugin/plugin.json');
  });

  test('uses custom path with plugin.json', () => {
    const result = resolvePluginSource({
      source: 'url',
      url: 'https://github.com/user/plugin.git',
      path: 'subdir',
    });
    expect(result.manifestPath).toBe('subdir/.claude-plugin/plugin.json');
  });
});

describe('deriveNameFromUrl', () => {
  test('strips .git suffix', () => {
    expect(deriveNameFromUrl('https://github.com/obra/superpowers.git')).toBe('superpowers');
  });

  test('handles URL with no .git', () => {
    expect(deriveNameFromUrl('https://gitlab.com/group/sub/repo')).toBe('repo');
  });

  test('handles trailing slash', () => {
    expect(deriveNameFromUrl('https://github.com/o/r/')).toBe('r');
  });
});
