import { describe, test, expect } from 'bun:test';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadPlugin, getPluginCapabilities } from '../../src/loader/plugin.js';

async function createPluginDir(manifest: Record<string, unknown>): Promise<string> {
  const dir = join(tmpdir(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const pd = join(dir, '.claude-plugin');
  await mkdir(pd, { recursive: true });
  await writeFile(join(pd, 'plugin.json'), JSON.stringify(manifest));
  return dir;
}

describe('loadPlugin', () => {
  test('loads minimal plugin.json', async () => {
    const dir = await createPluginDir({ name: 'test-plugin' });
    const r = await loadPlugin(dir);
    expect(r.name).toBe('test-plugin');
    expect(r.warnings).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });

  test('loads full plugin.json with warnings', async () => {
    const dir = await createPluginDir({ name: 'full', version: '1.0', agents: ['./a/'], outputStyles: ['./s/'], lspServers: {}, commands: ['./c/'], skills: ['./s/'], mcpServers: { x: { command: 'e', args: [] } } });
    const r = await loadPlugin(dir);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.some(w => w.includes('agents'))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  test('throws on missing plugin.json', async () => {
    const dir = join(tmpdir(), `empty-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await expect(loadPlugin(dir)).rejects.toThrow('not found');
    await rm(dir, { recursive: true, force: true });
  });

  test('throws on invalid name', async () => {
    const dir = await createPluginDir({ name: '' });
    await expect(loadPlugin(dir)).rejects.toThrow();
    await rm(dir, { recursive: true, force: true });
  });
});

describe('getPluginCapabilities', () => {
  test('detects all capabilities', () => {
    const r = getPluginCapabilities({ id: 't', name: 't', path: '/t', source: 'l', warnings: [], manifest: { name: 't', commands: ['./c/'], hooks: { PreToolUse: [] }, skills: ['./s/'], mcpServers: { s: { command: 'e', args: [] } } } });
    expect(r.hasCommands).toBe(true);
    expect(r.hasHooks).toBe(true);
    expect(r.hasSkills).toBe(true);
    expect(r.hasMcpServers).toBe(true);
  });

  test('reports no capabilities for minimal plugin', () => {
    const r = getPluginCapabilities({ id: 'm', name: 'm', path: '/m', source: 'l', warnings: [], manifest: { name: 'm' } });
    expect(r.hasCommands).toBe(false);
    expect(r.hasHooks).toBe(false);
  });
});
