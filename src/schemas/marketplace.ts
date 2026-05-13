import { z } from 'zod';

/**
 * Identifier regex for plugin/marketplace names. Blocks:
 *   - path traversal (no `..`)
 *   - git-flag-injection (no leading `-`)
 *   - cross-plugin namespace collision via consecutive `--`. We use `--`
 *     as the separator inside MCP keys (`<pluginId>--<server>`) and shim
 *     filenames, so a plugin id containing `--` would create ambiguity
 *     about which plugin owns which key.
 *
 * Pattern: alphanumeric start, then `[\w.-]` chars, with a negative
 * lookahead rejecting any string that contains `--` anywhere.
 */
export const IDENTIFIER_REGEX = /^(?!.*--)[a-zA-Z0-9][\w.-]*$/;
const IDENTIFIER_MSG = 'must start with alphanumeric, contain only [A-Za-z0-9._-], and have no `--`';

/**
 * Repo regex for GitHub "owner/name" form. Same constraints as IDENTIFIER_REGEX
 * per segment, including the `--` ban.
 */
export const GITHUB_REPO_REGEX = /^(?!.*--)[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.-]*$/;

/**
 * Git URL regex. Allow common URL/ssh forms (incl. file:// for local clones);
 * reject "-..." which git would interpret as a flag (CVE-2017-1000117 class).
 */
export const GIT_URL_REGEX = /^(https?:\/\/|git:\/\/|ssh:\/\/|file:\/\/|git@)[^\s]+$/;

/**
 * Plugin source — accepts the four real Claude Code marketplace shapes:
 *
 *   1. `{ source: "url", url, ref?, sha?, path? }`              — canonical
 *   2. `{ source: "git-subdir", url, path, ref?, sha? }`        — monorepo subdir
 *   3. `{ source: "github", repo, commit?, sha? }`              — github shorthand
 *   4. `"./relative/path"` (plain string)                       — inside marketplace repo
 *
 * The string variant means "plugin lives in this subdirectory of the
 * marketplace repo we already cloned" — no extra fetch.
 */
const UrlSourceSchema = z.object({
  source: z.literal('url'),
  url: z.string().regex(GIT_URL_REGEX, 'url must be a valid https/git/ssh/file URL'),
  ref: z.string().optional(),
  sha: z.string().optional(),
  path: z.string().optional(),
}).passthrough();

const GitSubdirSourceSchema = z.object({
  source: z.literal('git-subdir'),
  url: z.string().regex(GIT_URL_REGEX, 'url must be a valid https/git/ssh/file URL'),
  path: z.string().min(1, 'git-subdir requires a path'),
  ref: z.string().optional(),
  sha: z.string().optional(),
}).passthrough();

const GithubSourceSchema = z.object({
  source: z.literal('github'),
  repo: z.string()
    .regex(GITHUB_REPO_REGEX, 'repo must be in "owner/name" form with safe characters')
    .refine(s => !s.includes('..'), 'repo cannot contain ".."'),
  commit: z.string().optional(),
  sha: z.string().optional(),
  ref: z.string().optional(),
  path: z.string().optional(),
}).passthrough();

const InlineSourceSchema = z.string()
  .regex(/^\.?\.?\//, 'inline source must be a relative path starting with ./ or /')
  .refine(s => !s.includes('..'), 'inline source cannot contain ".."');

export const PluginSourceSchema = z.union([
  UrlSourceSchema,
  GitSubdirSourceSchema,
  GithubSourceSchema,
  InlineSourceSchema,
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
 * Schema for a single entry in a marketplace plugin list. Passthrough allows
 * marketplace-specific extras (e.g. `strict`) without rejection.
 */
export const PluginMarketplaceEntrySchema = z.object({
  name: z.string().regex(IDENTIFIER_REGEX, `plugin name ${IDENTIFIER_MSG}`),
  source: PluginSourceSchema,
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  version: z.string().optional(),
  author: PluginAuthorSchema.optional(),
}).passthrough();

export type PluginMarketplaceEntry = z.infer<typeof PluginMarketplaceEntrySchema>;

/**
 * Schema for a marketplace manifest file (marketplace.json). Passthrough so
 * top-level extras like `metadata` survive parsing.
 */
export const MarketplaceSchema = z.object({
  name: z.string().regex(IDENTIFIER_REGEX, `marketplace name ${IDENTIFIER_MSG}`),
  owner: PluginAuthorSchema.optional(),
  plugins: z.array(PluginMarketplaceEntrySchema),
}).passthrough();

export type Marketplace = z.infer<typeof MarketplaceSchema>;

/**
 * Translate a free-form source token (CLI/tool boundary) into a canonical
 * `PluginSource`. Accepts either "owner/repo" GitHub shorthand or a full
 * git URL (https/git/ssh/file). Throws on anything else.
 */
export function toPluginSource(token: string, opts?: { ref?: string; path?: string }): PluginSource {
  if (GITHUB_REPO_REGEX.test(token) && !token.includes('..')) {
    return { source: 'url', url: `https://github.com/${token}.git`, ...opts };
  }
  if (GIT_URL_REGEX.test(token)) {
    return { source: 'url', url: token, ...opts };
  }
  throw new Error(
    `Invalid source "${token}": expected "owner/repo" shorthand or https/git/ssh/file URL`,
  );
}
