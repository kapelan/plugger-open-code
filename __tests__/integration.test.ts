import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execa } from 'execa';
import { MarketplaceManager } from '../src/marketplace/manager.js';
import { installPlugin } from '../src/installer/install.js';
import { loadPlugin } from '../src/loader/plugin.js';

describe('Integration: marketplace → install pipeline', () => {
  let testMarketplaceDir: string;
  let testPluginDir: string;
  let uniqueMarketplaceName: string;
  let uniquePluginName: string;

  beforeAll(async () => {
    uniqueMarketplaceName = `test-mp-${Date.now()}`;
    uniquePluginName = `test-plugin-${Date.now()}`;
    
    // Create a mock marketplace with a test plugin
    testMarketplaceDir = join(tmpdir(), `mp-${Date.now()}`);
    const mpPluginDir = join(testMarketplaceDir, '.claude-plugin');
    await mkdir(mpPluginDir, { recursive: true });

    // Write marketplace.json
    const marketplace = {
      name: uniqueMarketplaceName,
      owner: { name: 'Test' },
      plugins: []
    };
    await writeFile(join(mpPluginDir, 'marketplace.json'), JSON.stringify(marketplace));

    // Init git repo
    await execa('git', ['init', '--initial-branch=main'], { cwd: testMarketplaceDir });
    await execa('git', ['add', '.'], { cwd: testMarketplaceDir });
    await execa('git', ['-c', 'user.name=test', '-c', 'user.email=test@t.com', 'commit', '-m', 'init'], { cwd: testMarketplaceDir });

    // Create a test plugin repo
    testPluginDir = join(tmpdir(), `plugin-${Date.now()}`);
    const pluginPdir = join(testPluginDir, '.claude-plugin');
    await mkdir(pluginPdir, { recursive: true });
    const pluginManifest = {
      name: uniquePluginName,
      version: '1.0.0',
      description: 'A test plugin for integration tests',
      commands: ['./commands/'],
      hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo test' }] }] },
    };
    await writeFile(join(pluginPdir, 'plugin.json'), JSON.stringify(pluginManifest));
    await execa('git', ['init', '--initial-branch=main'], { cwd: testPluginDir });
    await execa('git', ['add', '.'], { cwd: testPluginDir });
    await execa('git', ['-c', 'user.name=test', '-c', 'user.email=test@t.com', 'commit', '-m', 'init'], { cwd: testPluginDir });
  });

  afterAll(async () => {
    await rm(testMarketplaceDir, { recursive: true, force: true }).catch(() => {});
    await rm(testPluginDir, { recursive: true, force: true }).catch(() => {});
  });

  test('loadPlugin reads valid .claude-plugin/plugin.json', async () => {
    const plugin = await loadPlugin(testPluginDir);
    expect(plugin.name).toBe(uniquePluginName);
    expect(plugin.manifest.version).toBe('1.0.0');
  });

  test('installPlugin clones and installs a plugin', async () => {
    const entry = { name: uniquePluginName, source: { source: 'git' as const, url: testPluginDir, ref: 'main' } };
    const installed = await installPlugin(entry, uniqueMarketplaceName);
    expect(installed.id).toBe(`${uniquePluginName}@${uniqueMarketplaceName}`);
    expect(installed.name).toBe(uniquePluginName);
    // Cleanup
    await rm(installed.installPath, { recursive: true, force: true }).catch(() => {});
  });

  test('full pipeline: manager adds marketplace → searches → finds plugin', async () => {
    const mpPluginDir = join(testMarketplaceDir, '.claude-plugin');
    const marketplace = {
      name: uniqueMarketplaceName,
      owner: { name: 'Test' },
      plugins: [{
        name: uniquePluginName,
        source: { source: 'git' as const, url: testPluginDir, ref: 'main' },
        description: 'A test plugin',
        tags: ['test']
      }]
    };
    await writeFile(join(mpPluginDir, 'marketplace.json'), JSON.stringify(marketplace));
    await execa('git', ['add', '.'], { cwd: testMarketplaceDir });
    await execa('git', ['-c', 'user.name=test', '-c', 'user.email=test@t.com', 'commit', '-m', 'add plugin'], { cwd: testMarketplaceDir });

    // Add marketplace
    const manager = new MarketplaceManager();
    await manager.init();
    const mp = await manager.addMarketplace({ source: 'git', url: testMarketplaceDir, ref: 'main' }, uniqueMarketplaceName);
    expect(mp.plugins.length).toBe(1);

    const results = await manager.searchPlugins(uniquePluginName);
    expect(results.length).toBe(1);
    expect(results[0].plugin.name).toBe(uniquePluginName);
    expect(results[0].marketplace).toBe(uniqueMarketplaceName);
    
    await manager.removeMarketplace(uniqueMarketplaceName);
  });

  test('searchPlugins returns empty for non-matching query', async () => {
    const manager = new MarketplaceManager();
    const results = await manager.searchPlugins('does-not-exist-xyz');
    expect(results.length).toBe(0);
  });
});
