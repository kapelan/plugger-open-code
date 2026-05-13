import { describe, test, expect } from 'bun:test';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { uninstallPlugin } from '../../src/installer/uninstall.js';

async function scratch(prefix: string): Promise<string> {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

function projectScope(projectDir: string) {
  return { scope: { kind: 'project' as const, projectDir } };
}

function paths(projectDir: string) {
  return {
    installRoot: join(projectDir, '.plugger', 'plugins'),
    commandsDir: join(projectDir, '.opencode', 'commands'),
    skillsDir: join(projectDir, '.opencode', 'skills'),
    hookShimsDir: join(projectDir, '.opencode', 'hook-shims'),
    opencodeConfigPath: join(projectDir, 'opencode.json'),
  };
}

describe('uninstallPlugin', () => {
  test('rejects invalid pluginId', async () => {
    await expect(uninstallPlugin('../escape@m')).rejects.toThrow(/Invalid pluginId/);
    await expect(uninstallPlugin('no-at-sign')).rejects.toThrow(/Invalid pluginId/);
  });

  test('is a no-op when nothing exists', async () => {
    const projectDir = await scratch('proj');
    await uninstallPlugin('ghost@nowhere', projectScope(projectDir));
    expect(existsSync(join(paths(projectDir).installRoot, 'ghost@nowhere'))).toBe(false);
    await rm(projectDir, { recursive: true, force: true });
  });

  test('removes install dir + scoped commands subdir', async () => {
    const projectDir = await scratch('proj');
    const p = paths(projectDir);
    const id = 'foo@bar';

    await mkdir(join(p.installRoot, id), { recursive: true });
    await mkdir(join(p.commandsDir, id), { recursive: true });
    await writeFile(join(p.commandsDir, id, 'cmd.md'), 'x');

    await uninstallPlugin(id, projectScope(projectDir));

    expect(existsSync(join(p.installRoot, id))).toBe(false);
    expect(existsSync(join(p.commandsDir, id))).toBe(false);

    await rm(projectDir, { recursive: true, force: true });
  });

  test('strips mcp keys with our namespace prefix even when meta is empty/missing', async () => {
    const projectDir = await scratch('proj');
    const p = paths(projectDir);
    const id = 'foo@bar';

    await mkdir(join(p.installRoot, id), { recursive: true });
    // Deliberately no meta file: simulates a plugin installed before the
    // translator started recording artifacts.
    await writeFile(
      p.opencodeConfigPath,
      JSON.stringify({
        mcp: {
          [`${id}--mine`]: { type: 'local', command: ['x'] },
          'someone-else--other': { type: 'local', command: ['y'] },
        },
      }),
    );

    await uninstallPlugin(id, projectScope(projectDir));

    const cfg = JSON.parse(await Bun.file(p.opencodeConfigPath).text());
    expect(cfg.mcp).toEqual({ 'someone-else--other': { type: 'local', command: ['y'] } });

    await rm(projectDir, { recursive: true, force: true });
  });

  test('removes hook shim file and its plugin[] entry from opencode.json', async () => {
    const projectDir = await scratch('proj');
    const p = paths(projectDir);
    const id = 'foo@bar';

    await mkdir(join(p.installRoot, id), { recursive: true });
    await mkdir(p.hookShimsDir, { recursive: true });
    const shim = join(p.hookShimsDir, `${id}.js`);
    await writeFile(shim, '// stub');
    await writeFile(
      p.opencodeConfigPath,
      JSON.stringify({
        plugin: ['keep-this', `file://${shim}`],
      }),
    );

    await uninstallPlugin(id, projectScope(projectDir));

    expect(existsSync(shim)).toBe(false);
    const cfg = JSON.parse(await Bun.file(p.opencodeConfigPath).text());
    expect(cfg.plugin).toEqual(['keep-this']);

    await rm(projectDir, { recursive: true, force: true });
  });

  test('does not touch unrelated user mcp keys or plugin entries', async () => {
    const projectDir = await scratch('proj');
    const p = paths(projectDir);
    const id = 'foo@bar';

    await writeFile(
      p.opencodeConfigPath,
      JSON.stringify({
        plugin: ['user-plugin', '@vendor/plugin@latest'],
        mcp: {
          'user-mcp': { type: 'local', command: ['x'] },
          'foo-bar-mine': { type: 'local', command: ['y'] }, // no `--`, not ours
        },
      }),
    );

    await uninstallPlugin(id, projectScope(projectDir));

    const cfg = JSON.parse(await Bun.file(p.opencodeConfigPath).text());
    expect(cfg.plugin).toEqual(['user-plugin', '@vendor/plugin@latest']);
    expect(cfg.mcp).toEqual({
      'user-mcp': { type: 'local', command: ['x'] },
      'foo-bar-mine': { type: 'local', command: ['y'] },
    });

    await rm(projectDir, { recursive: true, force: true });
  });
});
