import { z } from 'zod';

/**
 * Identifier regex for plugin/marketplace names. Blocks path traversal
 * (no "..", no "/") and git-flag-injection shapes (no leading "-").
 */
export const IDENTIFIER_REGEX = /^[a-zA-Z0-9][\w.-]*$/;
const IDENTIFIER_MSG = 'must start with alphanumeric and contain only [A-Za-z0-9._-]';

/**
 * Repo regex for GitHub "owner/name" form. Each segment must start with
 * alphanumeric to block ".." traversal and "-flag" injection.
 */
const GITHUB_REPO_REGEX = /^[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.-]*$/;

/**
 * Git URL regex. Allow common URL/ssh forms (incl. file:// for local clones);
 * reject "-..." which git would interpret as a flag (CVE-2017-1000117 class).
 */
const GIT_URL_REGEX = /^(https?:\/\/|git:\/\/|ssh:\/\/|file:\/\/|git@)[^\s]+$/;

/**
 * Schema for a plugin source — how a plugin can be fetched.
 */
export const PluginSourceSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('github'),
    repo: z.string()
      .regex(GITHUB_REPO_REGEX, 'repo must be in "owner/name" form with safe characters')
      .refine(s => !s.includes('..'), 'repo cannot contain ".."'),
    ref: z.string().optional(),
    path: z.string().optional(),
  }),
  z.object({
    source: z.literal('git'),
    url: z.string().regex(GIT_URL_REGEX, 'url must be a valid https/git/ssh URL'),
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
  name: z.string().regex(IDENTIFIER_REGEX, `plugin name ${IDENTIFIER_MSG}`),
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
  name: z.string().regex(IDENTIFIER_REGEX, `marketplace name ${IDENTIFIER_MSG}`),
  owner: PluginAuthorSchema.optional(),
  plugins: z.array(PluginMarketplaceEntrySchema),
});

export type Marketplace = z.infer<typeof MarketplaceSchema>;
