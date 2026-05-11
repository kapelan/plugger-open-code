import { z } from 'zod';

/**
 * Schema for a plugin source — how a plugin can be fetched.
 */
export const PluginSourceSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('github'),
    repo: z.string().min(1, 'repo is required for github source'),
    ref: z.string().optional(),
    path: z.string().optional(),
  }),
  z.object({
    source: z.literal('git'),
    url: z.string().min(1, 'url is required for git source'),
    ref: z.string().optional(),
    path: z.string().optional(),
  }),
]);

export type PluginSource = z.infer<typeof PluginSourceSchema>;

/**
 * Schema for a plugin author.
 */
export const PluginAuthorSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  url: z.string().optional(),
});

export type PluginAuthor = z.infer<typeof PluginAuthorSchema>;

/**
 * Schema for a single entry in a marketplace plugin list.
 */
export const PluginMarketplaceEntrySchema = z.object({
  name: z.string().min(1),
  source: PluginSourceSchema,
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  version: z.string().optional(),
  author: PluginAuthorSchema.optional(),
});

export type PluginMarketplaceEntry = z.infer<typeof PluginMarketplaceEntrySchema>;

/**
 * Schema for a marketplace manifest file (marketplace.json).
 */
export const MarketplaceSchema = z.object({
  name: z.string().min(1, 'Marketplace name is required'),
  owner: PluginAuthorSchema.optional(),
  plugins: z.array(PluginMarketplaceEntrySchema),
});

export type Marketplace = z.infer<typeof MarketplaceSchema>;
