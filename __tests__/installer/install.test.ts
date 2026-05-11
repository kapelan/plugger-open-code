import { describe, test, expect } from 'bun:test';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { installPlugin } from '../../src/installer/install.js';

describe('installPlugin', () => {
  async function createPluginRepo(manifest: Record<string, unknown>): Promise<string> {
    const dir = join(tmpdir(), `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pd = join(dir, '.claude-plugin');
    await mkdir(pd, { recursive: true });
    await writeFile(join(pd, 'plugin.json'), JSON.stringify(manifest));
    // Initialize git repo so clone works
    const { execa } = await import('execa');
    await execa('git', ['init'], { cwd: dir });
    await execa('git', ['checkout', '-b', 'main'], { cwd: dir });
    await execa('git', ['add', '.'], { cwd: dir });
    await execa('git', ['-c', 'user.name=test', '-c', 'user.email=test@test.com', 'commit', '-m', 'init'], { cwd: dir });
    return dir;
  }

  test('installs a plugin with valid manifest', async () => {
    const repoDir = await createPluginRepo({ name: 'test-plugin', version: '1.0.0', description: 'A test' });
    const entry = { name: 'test-plugin', source: { source: 'git' as const, url: repoDir, ref: 'HEAD' } };
    const result = await installPlugin(entry, 'test-marketplace');
    expect(result.name).toBe('test-plugin');
    expect(result.id).toBe('test-plugin@test-marketplace');
    expect(result.manifest.version).toBe('1.0.0');
    await rm(result.installPath, { recursive: true, force: true });
    await rm(repoDir, { recursive: true, force: true });
  });

  test('throws on entry with invalid source', async () => {
    const entry = { name: 'bad', source: { source: 'github' as const } as any };
    await expect(installPlugin(entry, 'mp')).rejects.toThrow();
  });
});
