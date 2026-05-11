import { z } from 'zod';

/**
 * Schema for a Claude Code plugin manifest (plugin.json).
 */
export const PluginManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i, 'Plugin name must start with alphanumeric and contain only letters, digits, hyphens, dots, or underscores'),
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
  commands: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  agents: z.array(z.string()).optional(),
  mcpServers: z.record(z.string(), z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })).optional(),
}).passthrough();

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
