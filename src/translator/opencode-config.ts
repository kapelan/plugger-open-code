import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { errMsg } from '../util/errors.js';

export interface OpencodeConfig {
  $schema?: string;
  plugin?: Array<string | [string, Record<string, unknown>]>;
  mcp?: Record<string, McpEntry>;
  [key: string]: unknown;
}

export type McpLocalEntry = {
  type: 'local';
  command: string[];
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
};

export type McpRemoteEntry = {
  type: 'remote';
  url: string;
  enabled?: boolean;
  headers?: Record<string, string>;
};

export type McpEntry = McpLocalEntry | McpRemoteEntry;

export async function readOpencodeConfig(path: string): Promise<OpencodeConfig> {
  if (!existsSync(path)) return {};
  const raw = await readFile(path, 'utf-8');
  if (raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as OpencodeConfig;
    }
    throw new Error('opencode.json must be a JSON object at the top level');
  } catch (e) {
    throw new Error(`Failed to parse ${path}: ${errMsg(e)}`);
  }
}

/** Atomic write: tmp file + rename. */
export async function writeOpencodeConfig(config: OpencodeConfig, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const body = JSON.stringify(config, null, 2) + '\n';
  await writeFile(tmp, body, 'utf-8');
  await rename(tmp, path);
}

export async function mutateOpencodeConfig(
  fn: (config: OpencodeConfig) => OpencodeConfig | void,
  path: string,
): Promise<void> {
  const cfg = await readOpencodeConfig(path);
  const next = fn(cfg);
  await writeOpencodeConfig(next ?? cfg, path);
}
