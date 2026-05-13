import { describe, test, expect } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import {
  resolveScope,
  defaultScope,
  assertValidPluginId,
  makePluginId,
  PLUGIN_ID_REGEX,
} from '../../src/translator/scope.js';

describe('scope', () => {
  test('defaultScope is global', () => {
    expect(defaultScope()).toEqual({ kind: 'global' });
  });

  test('resolveScope(global) → user home paths', () => {
    const p = resolveScope({ kind: 'global' });
    expect(p.installRoot).toBe(join(homedir(), '.opencode', 'plugins'));
    expect(p.commandsDir).toBe(join(homedir(), '.config', 'opencode', 'commands'));
    expect(p.skillsDir).toBe(join(homedir(), '.config', 'opencode', 'skills'));
    expect(p.hookShimsDir).toBe(join(homedir(), '.config', 'opencode', 'hook-shims'));
    expect(p.opencodeConfigPath).toBe(join(homedir(), '.config', 'opencode', 'opencode.json'));
  });

  test('resolveScope(project) keeps everything under projectDir', () => {
    const p = resolveScope({ kind: 'project', projectDir: '/some/proj' });
    expect(p.installRoot).toBe('/some/proj/.plugger/plugins');
    expect(p.commandsDir).toBe('/some/proj/.opencode/commands');
    expect(p.skillsDir).toBe('/some/proj/.opencode/skills');
    expect(p.hookShimsDir).toBe('/some/proj/.opencode/hook-shims');
    expect(p.opencodeConfigPath).toBe('/some/proj/opencode.json');
  });
});

describe('pluginId validation', () => {
  test('PLUGIN_ID_REGEX accepts canonical forms', () => {
    for (const id of ['foo@bar', 'plugin-1@mp', 'a.b@c.d', 'foo123@bar456']) {
      expect(PLUGIN_ID_REGEX.test(id)).toBe(true);
    }
  });

  test('PLUGIN_ID_REGEX rejects `--`, leading `-`, missing `@`, path traversal', () => {
    for (const id of ['foo--bar@m', 'foo@bar--baz', '-foo@m', 'foo@-m', 'no-at-sign', '../escape@m', 'foo@', '@bar']) {
      expect(PLUGIN_ID_REGEX.test(id)).toBe(false);
    }
  });

  test('assertValidPluginId throws on bad id', () => {
    expect(() => assertValidPluginId('foo--bar@m')).toThrow(/Invalid pluginId/);
    expect(() => assertValidPluginId('no-at-sign')).toThrow(/Invalid pluginId/);
  });

  test('makePluginId composes name@marketplace and validates', () => {
    expect(makePluginId('foo', 'bar')).toBe('foo@bar');
    // Even though IDENTIFIER_REGEX upstream would reject these, the final
    // assertion in makePluginId is a second line of defense.
    expect(() => makePluginId('foo', '--bad')).toThrow(/Invalid pluginId/);
    expect(() => makePluginId('foo--x', 'bar')).toThrow(/Invalid pluginId/);
  });
});
