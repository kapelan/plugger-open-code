import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execa } from 'execa';
import { MarketplaceManager } from '../src/marketplace/manager.js';
import { installPlugin } from '../src/installer/install.js';
import { uninstallPlugin } from '../src/installer/uninstall.js';
import { loadPlugin } from '../src/loader/plugin.js';

describe('Integration: marketplace → install pipeline', () => {
  let testMarketplaceDir: string;
  let testPluginDir: string;
  let testProjectDir: string;
  let uniqueMarketplaceName: string;
  let uniquePluginName: string;

  beforeAll(async () => {
    // Timestamp-only IDs (no `-`) so the strict id regex accepts them.
    uniqueMarketplaceName = `testmp${Date.now()}`;
    uniquePluginName = `testplugin${Date.now()}`;
    testProjectDir = join(tmpdir(), `integ-proj-${Date.now()}`);
    await mkdir(testProjectDir, { recursive: true });

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
    await rm(testProjectDir, { recursive: true, force: true }).catch(() => {});
  });

  test('loadPlugin reads valid .claude-plugin/plugin.json', async () => {
    const plugin = await loadPlugin(testPluginDir);
    expect(plugin.name).toBe(uniquePluginName);
    expect(plugin.manifest.version).toBe('1.0.0');
  });

  test('installPlugin clones and installs a plugin (project scope, full uninstall cleanup)', async () => {
    const entry = { name: uniquePluginName, source: { source: 'url' as const, url: `file://${testPluginDir}`, ref: 'main' } };
    const scope = { kind: 'project' as const, projectDir: testProjectDir };
    const installed = await installPlugin(entry, uniqueMarketplaceName, { scope });
    expect(installed.id).toBe(`${uniquePluginName}@${uniqueMarketplaceName}`);
    expect(installed.name).toBe(uniquePluginName);
    // Full uninstall — verifies hook shim + plugin[] entry get reverted, not
    // just the clone dir.
    await uninstallPlugin(installed.id, { scope });
  });

  test('full pipeline: manager adds marketplace → searches → finds plugin', async () => {
    const mpPluginDir = join(testMarketplaceDir, '.claude-plugin');
    const marketplace = {
      name: uniqueMarketplaceName,
      owner: { name: 'Test' },
      plugins: [{
        name: uniquePluginName,
        source: { source: 'url' as const, url: `file://${testPluginDir}`, ref: 'main' },
        description: 'A test plugin',
        tags: ['test']
      }]
    };
    await writeFile(join(mpPluginDir, 'marketplace.json'), JSON.stringify(marketplace));
    await execa('git', ['add', '.'], { cwd: testMarketplaceDir });
    await execa('git', ['-c', 'user.name=test', '-c', 'user.email=test@t.com', 'commit', '-m', 'add plugin'], { cwd: testMarketplaceDir });

    // Isolated baseDir so this test doesn't pollute `~/.opencode/marketplaces/`.
    const baseDir = join(tmpdir(), `mpmgr-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const manager = new MarketplaceManager({ baseDir });
    await manager.init();
    const mp = await manager.addMarketplace({ source: 'url', url: `file://${testMarketplaceDir}`, ref: 'main' }, uniqueMarketplaceName);
    expect(mp.plugins.length).toBe(1);

    const results = await manager.searchPlugins(uniquePluginName);
    expect(results.length).toBe(1);
    expect(results[0].plugin.name).toBe(uniquePluginName);
    expect(results[0].marketplace).toBe(uniqueMarketplaceName);

    await manager.removeMarketplace(uniqueMarketplaceName);
    await rm(baseDir, { recursive: true, force: true });
  });

  test('searchPlugins returns empty for non-matching query (isolated baseDir)', async () => {
    const baseDir = join(tmpdir(), `mpmgr-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const manager = new MarketplaceManager({ baseDir });
    const results = await manager.searchPlugins('does-not-exist-xyz');
    expect(results).toEqual([]);
    await rm(baseDir, { recursive: true, force: true });
  });
});
