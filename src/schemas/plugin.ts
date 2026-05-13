import { z } from 'zod';

/**
 * Schema for a Claude Code plugin manifest (plugin.json).
 *
 * The `name` regex matches IDENTIFIER_REGEX in schemas/marketplace.ts (no
 * `--` substring): we concatenate `name@marketplace` into a pluginId that
 * uses `--` as a namespace separator in MCP keys / shim filenames, so a
 * name containing `--` would cause cross-plugin collisions on uninstall.
 *
 * `commands` and `skills` are accepted for forward-compat but the translator
 * doesn't consume them — it scans `<installPath>/commands/` and
 * `<installPath>/skills/` directly. No real CC plugin in the 172-plugin
 * official sample sets these fields.
 */
export const PluginManifestSchema = z.object({
  name: z.string().regex(
    /^(?!.*--)[a-z0-9][a-z0-9._-]*$/i,
    'Plugin name must start with alphanumeric, contain only [A-Za-z0-9._-], and have no `--`',
  ),
  version: z.string().optional(),
  description: z.string().optional(),
  author: z.object({
    name: z.string(),
    email: z.string().optional(),
    url: z.string().optional(),
  }).optional(),
  hooks: z.record(z.string(), z.array(z.object({
    matcher: z.string(),
    hooks: z.array(z.object({
      type: z.string(),
      command: z.string().optional(),
      description: z.string().optional(),
    })),
  }))).optional(),
  commands: z.array(z.string()).optional(), // dead — translator scans FS
  skills: z.array(z.string()).optional(),   // dead — translator scans FS
  agents: z.array(z.string()).optional(),
  mcpServers: z.record(z.string(), z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })).optional(),
}).passthrough();

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
