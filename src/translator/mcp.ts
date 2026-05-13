import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { mutateOpencodeConfig, type McpEntry } from './opencode-config.js';
import { resolveScope, defaultScope, assertValidPluginId, type InstallScope } from './scope.js';

const SERVER_NAME_REGEX = /^(?!.*--)[a-zA-Z0-9][\w.-]*$/;

export interface TranslateMcpOptions {
  scope?: InstallScope;
}

type CcCommonOpts = {
  enabled?: boolean;
  disabled?: boolean;
  timeout?: number;
};
type CcStdio = CcCommonOpts & { command: string; args?: string[]; env?: Record<string, string> };
type CcRemote = CcCommonOpts & { type?: 'sse' | 'http'; url: string; headers?: Record<string, string> };
type CcEntry = CcStdio | CcRemote;

/**
 * Translate CC mcpServers (from `.mcp.json` and/or `plugin.json.mcpServers`)
 * into the scope's `opencode.json` `mcp:` map under namespaced keys
 * `<pluginId>--<name>`. Returns the inserted keys.
 */
export async function translateMcpServers(
  installPath: string,
  pluginId: string,
  opts?: TranslateMcpOptions,
): Promise<string[]> {
  assertValidPluginId(pluginId);

  const ccEntries = await collectCcEntries(installPath);
  if (Object.keys(ccEntries).length === 0) return [];

  const translated: Record<string, McpEntry> = {};
  for (const [name, entry] of Object.entries(ccEntries)) {
    if (!SERVER_NAME_REGEX.test(name)) {
      throw new Error(`Invalid MCP server name "${name}" in ${pluginId}`);
    }
    translated[`${pluginId}--${name}`] = translateEntry(entry, name);
  }

  const paths = resolveScope(opts?.scope ?? defaultScope());
  await mutateOpencodeConfig((cfg) => {
    cfg.mcp ??= {};
    for (const [k, v] of Object.entries(translated)) cfg.mcp[k] = v;
  }, paths.opencodeConfigPath);

  return Object.keys(translated);
}

async function collectCcEntries(installPath: string): Promise<Record<string, CcEntry>> {
  const out: Record<string, CcEntry> = {};

  // `.mcp.json` in the wild appears in two shapes:
  //   - `{"mcpServers": {"name": {...}}}` (canonical CC form)
  //   - `{"name": {"command": "...", ...}}` (bare top-level map, e.g. context7)
  // We accept either: if a top-level `mcpServers` key exists, use it; else
  // treat every top-level key whose value is a server-shaped object (has
  // `command` or `url`) as a server entry.
  const dotMcp = join(installPath, '.mcp.json');
  if (existsSync(dotMcp)) {
    const parsed = JSON.parse(await readFile(dotMcp, 'utf-8'));
    if (parsed?.mcpServers && typeof parsed.mcpServers === 'object') {
      Object.assign(out, parsed.mcpServers);
    } else if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (looksLikeServer(v)) out[k] = v as CcEntry;
      }
    }
  }

  const manifestPath = join(installPath, '.claude-plugin', 'plugin.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    Object.assign(out, manifest?.mcpServers ?? {});
  }

  return out;
}

function looksLikeServer(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.command === 'string' || typeof o.url === 'string';
}

function translateEntry(raw: CcEntry, name: string): McpEntry {
  // CC uses `disabled: true`; OpenCode uses `enabled: false`. Either form
  // disables the server. Honor both, preferring an explicit `enabled` value.
  const enabled =
    typeof raw.enabled === 'boolean'
      ? raw.enabled
      : raw.disabled === true
        ? false
        : undefined;

  if ('url' in raw && typeof raw.url === 'string') {
    const entry: McpEntry = { type: 'remote', url: raw.url };
    if (raw.headers) entry.headers = raw.headers;
    if (enabled !== undefined) entry.enabled = enabled;
    return entry;
  }
  if ('command' in raw && typeof raw.command === 'string') {
    const entry: McpEntry = {
      type: 'local',
      command: [raw.command, ...(raw.args ?? [])],
    };
    if (raw.env) entry.environment = raw.env;
    if (enabled !== undefined) entry.enabled = enabled;
    if (typeof raw.timeout === 'number') entry.timeout = raw.timeout;
    return entry;
  }
  throw new Error(`MCP entry "${name}" has neither command nor url`);
}
