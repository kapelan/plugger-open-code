import { describe, test, expect } from 'bun:test';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installPlugin, updatePlugin } from '../../src/installer/install.js';
import { uninstallPlugin } from '../../src/installer/uninstall.js';

describe('installPlugin', () => {
  async function createPluginRepo(manifest: Record<string, unknown>, extra?: (dir: string) => Promise<void>): Promise<string> {
    const dir = join(tmpdir(), `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pd = join(dir, '.claude-plugin');
    await mkdir(pd, { recursive: true });
    await writeFile(join(pd, 'plugin.json'), JSON.stringify(manifest));
    if (extra) await extra(dir);
    const { execa } = await import('execa');
    await execa('git', ['init'], { cwd: dir });
    await execa('git', ['checkout', '-b', 'main'], { cwd: dir });
    await execa('git', ['add', '.'], { cwd: dir });
    await execa('git', ['-c', 'user.name=test', '-c', 'user.email=test@test.com', 'commit', '-m', 'init'], { cwd: dir });
    return dir;
  }

  function projectScope(projectDir: string) {
    return { scope: { kind: 'project' as const, projectDir } };
  }

  test('clones into <projectDir>/.plugger/plugins and records meta with scope', async () => {
    const repoDir = await createPluginRepo({ name: 'test-plugin', version: '1.0.0' });
    const projectDir = join(tmpdir(), `proj-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectDir, { recursive: true });

    const entry = { name: 'test-plugin', source: { source: 'url' as const, url: `file://${repoDir}`, ref: 'HEAD' } };
    const result = await installPlugin(entry, 'test-marketplace', projectScope(projectDir));

    expect(result.installPath).toBe(join(projectDir, '.plugger', 'plugins', 'test-plugin@test-marketplace'));
    // Result exposes translator output so callers (e.g. plugin-market command)
    // can report what actually activated, without re-reading the manifest.
    expect(result.artifacts).toEqual({ commands: [], skills: [], mcpServers: [], hooks: [] });
    const meta = JSON.parse(await readFile(join(result.installPath, '.opencode-plugin-meta.json'), 'utf-8'));
    expect(meta.scope).toEqual({ kind: 'project', projectDir });
    expect(meta.installedArtifacts).toEqual(result.artifacts);
    expect(meta.source).toEqual(entry.source);

    await rm(projectDir, { recursive: true, force: true });
    await rm(repoDir, { recursive: true, force: true });
  });

  test('translates commands into <projectDir>/.opencode/commands and uninstall removes them', async () => {
    const repoDir = await createPluginRepo({ name: 'cmd-plugin', version: '1.0.0' }, async (dir) => {
      await mkdir(join(dir, 'commands', 'sub'), { recursive: true });
      await writeFile(join(dir, 'commands', 'greet.md'), 'hello');
      await writeFile(join(dir, 'commands', 'sub', 'nested.md'), 'deep');
    });
    const projectDir = join(tmpdir(), `proj-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectDir, { recursive: true });

    const entry = { name: 'cmd-plugin', source: { source: 'url' as const, url: `file://${repoDir}`, ref: 'HEAD' } };
    const result = await installPlugin(entry, 'integ-mp', projectScope(projectDir));

    const commandsBase = join(projectDir, '.opencode', 'commands', 'cmd-plugin@integ-mp');
    expect(existsSync(join(commandsBase, 'greet.md'))).toBe(true);
    expect(existsSync(join(commandsBase, 'sub', 'nested.md'))).toBe(true);

    await uninstallPlugin(result.id, projectScope(projectDir));
    expect(existsSync(result.installPath)).toBe(false);
    expect(existsSync(commandsBase)).toBe(false);

    await rm(repoDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  test('translates skills into <projectDir>/.opencode/skills', async () => {
    const repoDir = await createPluginRepo({ name: 'skill-plugin', version: '1.0.0' }, async (dir) => {
      await mkdir(join(dir, 'skills', 'tdd'), { recursive: true });
      await writeFile(join(dir, 'skills', 'tdd', 'SKILL.md'), '---\nname: tdd\ndescription: x\n---\n');
    });
    const projectDir = join(tmpdir(), `proj-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectDir, { recursive: true });

    const entry = { name: 'skill-plugin', source: { source: 'url' as const, url: `file://${repoDir}`, ref: 'HEAD' } };
    const result = await installPlugin(entry, 'mp', projectScope(projectDir));

    expect(existsSync(join(projectDir, '.opencode', 'skills', 'skill-plugin@mp', 'tdd', 'SKILL.md'))).toBe(true);

    await uninstallPlugin(result.id, projectScope(projectDir));
    expect(existsSync(join(projectDir, '.opencode', 'skills', 'skill-plugin@mp'))).toBe(false);

    await rm(repoDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  test('throws on entry with invalid source', async () => {
    const entry = { name: 'bad', source: { source: 'url' as const } as any };
    await expect(installPlugin(entry, 'mp')).rejects.toThrow();
  });

  test('rejects path-traversal marketplace name', async () => {
    const entry = { name: 'ok', source: { source: 'url' as const, url: 'file:///tmp/x' } };
    await expect(installPlugin(entry, '../../etc')).rejects.toThrow(/Invalid marketplace name/);
  });

  test('rejects marketplace name containing `--` (would collide with namespace separator)', async () => {
    const entry = { name: 'ok', source: { source: 'url' as const, url: 'file:///tmp/x' } };
    await expect(installPlugin(entry, 'foo--bar')).rejects.toThrow(/Invalid marketplace name/);
  });

  test('updatePlugin re-fetches from recorded source, re-translates, refreshes meta', async () => {
    // Build a repo, commit v1 of a SKILL, install once.
    const repoDir = join(tmpdir(), `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pluginDir = join(repoDir, '.claude-plugin');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'plugin.json'), JSON.stringify({ name: 'upd', version: '1.0.0' }));
    await mkdir(join(repoDir, 'skills', 's1'), { recursive: true });
    await writeFile(join(repoDir, 'skills', 's1', 'SKILL.md'), 'v1');
    const { execa } = await import('execa');
    await execa('git', ['init'], { cwd: repoDir });
    await execa('git', ['checkout', '-b', 'main'], { cwd: repoDir });
    await execa('git', ['add', '.'], { cwd: repoDir });
    await execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.com', 'commit', '-m', 'v1'], { cwd: repoDir });

    const projectDir = join(tmpdir(), `proj-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectDir, { recursive: true });
    const scope = { kind: 'project' as const, projectDir };

    const entry = { name: 'upd', source: { source: 'url' as const, url: `file://${repoDir}`, ref: 'HEAD' } };
    const v1 = await installPlugin(entry, 'mp', { scope });
    const s1path = join(projectDir, '.opencode', 'skills', 'upd@mp', 's1', 'SKILL.md');
    expect(await readFile(s1path, 'utf-8')).toBe('v1');

    // Mutate upstream: replace skill content, commit v2.
    await writeFile(join(repoDir, 'skills', 's1', 'SKILL.md'), 'v2');
    await writeFile(join(pluginDir, 'plugin.json'), JSON.stringify({ name: 'upd', version: '2.0.0' }));
    await execa('git', ['add', '.'], { cwd: repoDir });
    await execa('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.com', 'commit', '-m', 'v2'], { cwd: repoDir });

    // Plain installPlugin call would skip clone (path exists) — translation
    // would re-run on stale content. updatePlugin must actually re-fetch.
    const v2 = await updatePlugin(v1.id, { scope });

    expect(v2.manifest.version).toBe('2.0.0');
    expect(await readFile(s1path, 'utf-8')).toBe('v2');

    const meta = JSON.parse(await readFile(join(v2.installPath, '.opencode-plugin-meta.json'), 'utf-8'));
    expect(meta.manifestVersion).toBe('2.0.0');
    expect(meta.source).toEqual(entry.source);

    await uninstallPlugin(v2.id, { scope });
    await rm(repoDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  test('updatePlugin fails loudly when meta is missing source (legacy install)', async () => {
    const projectDir = join(tmpdir(), `proj-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const scope = { kind: 'project' as const, projectDir };
    const id = 'legacy@old';
    const installPath = join(projectDir, '.plugger', 'plugins', id);
    await mkdir(installPath, { recursive: true });
    await writeFile(
      join(installPath, '.opencode-plugin-meta.json'),
      // No `source` — emulates a pre-update-feature install record.
      JSON.stringify({ id, name: 'legacy', marketplace: 'old', installedAt: 'x', manifestVersion: '1.0.0' }),
    );

    await expect(updatePlugin(id, { scope })).rejects.toThrow(/missing name\/marketplace\/source/);

    await rm(projectDir, { recursive: true, force: true });
  });
});

describe('PluginMarketplaceEntrySchema name validation', () => {
  test('rejects path-traversal plugin name', async () => {
    const { PluginMarketplaceEntrySchema } = await import('../../src/schemas/marketplace.js');
    expect(() => PluginMarketplaceEntrySchema.parse({
      name: '../../etc/passwd',
      source: { source: 'url', url: 'https://github.com/owner/repo.git' },
    })).toThrow();
  });

  test('rejects flag-shaped plugin name', async () => {
    const { PluginMarketplaceEntrySchema } = await import('../../src/schemas/marketplace.js');
    expect(() => PluginMarketplaceEntrySchema.parse({
      name: '-rf',
      source: { source: 'url', url: 'https://github.com/owner/repo.git' },
    })).toThrow();
  });

  test('rejects flag-shaped url', async () => {
    const { PluginSourceSchema } = await import('../../src/schemas/marketplace.js');
    expect(() => PluginSourceSchema.parse({
      source: 'url',
      url: '--upload-pack=evil',
    })).toThrow();
  });

  test('accepts real CC marketplace source shape', async () => {
    const { PluginSourceSchema } = await import('../../src/schemas/marketplace.js');
    expect(() => PluginSourceSchema.parse({
      source: 'url',
      url: 'https://github.com/obra/superpowers.git',
      ref: 'dev',
    })).not.toThrow();
  });
});

describe('toPluginSource translator', () => {
  test('translates owner/repo to https github URL', async () => {
    const { toPluginSource } = await import('../../src/schemas/marketplace.js');
    expect(toPluginSource('obra/superpowers')).toEqual({
      source: 'url',
      url: 'https://github.com/obra/superpowers.git',
    });
  });

  test('passes a full URL through', async () => {
    const { toPluginSource } = await import('../../src/schemas/marketplace.js');
    expect(toPluginSource('https://gitlab.com/g/r.git')).toEqual({
      source: 'url',
      url: 'https://gitlab.com/g/r.git',
    });
  });

  test('forwards ref/path opts', async () => {
    const { toPluginSource } = await import('../../src/schemas/marketplace.js');
    expect(toPluginSource('obra/superpowers', { ref: 'dev' })).toEqual({
      source: 'url',
      url: 'https://github.com/obra/superpowers.git',
      ref: 'dev',
    });
  });

  test('rejects flag-shaped token', async () => {
    const { toPluginSource } = await import('../../src/schemas/marketplace.js');
    expect(() => toPluginSource('--upload-pack=evil')).toThrow();
  });

  test('rejects path-traversal in shorthand', async () => {
    const { toPluginSource } = await import('../../src/schemas/marketplace.js');
    expect(() => toPluginSource('owner/..')).toThrow();
  });
});
