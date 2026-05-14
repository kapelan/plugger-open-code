/**
 * @sulesky/opencode-plugger — TUI module
 *
 * `/plugin` slash command opens a dialog-driven flow: Discover / Installed /
 * Marketplaces / Add marketplace. Install picks a scope (global vs project),
 * Installed lets you Update (re-fetch from source) or Uninstall a clone in
 * either scope. Direct execution — no LLM round-trip.
 */

import type {
  TuiPlugin,
  TuiPluginApi,
  TuiDialogSelectOption,
} from '@opencode-ai/plugin/dist/tui.js';

type Tab = 'discover' | 'installed' | 'marketplaces';

type Scope = { kind: 'global' } | { kind: 'project'; projectDir: string };

interface InstalledEntry {
  id: string;
  scope: Scope;
}

// Source object kept opaque — installer/loader know how to handle every
// variant (url, git-subdir, github, inline string).
type RawSource = string | Record<string, unknown>;

interface MarketplaceEntry {
  name: string;
  cachePath: string;
  source: RawSource;
  lastUpdated: string;
}

interface PluginEntry {
  name: string;
  marketplace: string;
  description?: string;
  version?: string;
  category?: string;
  source: RawSource;
  installs: number;
}

const PLUGIN_VALUE_PREFIX = 'plugger.';
const OFFICIAL_MARKETPLACE = 'anthropics/claude-plugins-official';
const INSTALLS_URL =
  'https://raw.githubusercontent.com/anthropics/claude-plugins-official/refs/heads/stats/stats/plugin-installs.json';

let installsCache: Map<string, number> | null = null;
let installsInflight: Promise<Map<string, number>> | null = null;

async function fetchInstallCounts(): Promise<Map<string, number>> {
  if (installsCache) return installsCache;
  if (installsInflight) return installsInflight;
  installsInflight = (async () => {
    try {
      const res = await fetch(INSTALLS_URL, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'plugger-open-code' },
      });
      if (!res.ok) return new Map<string, number>();
      const data = await res.json() as {
        plugins?: Array<{ plugin?: string; unique_installs?: number }>;
      };
      const map = new Map<string, number>();
      for (const p of data.plugins ?? []) {
        if (p.plugin && typeof p.unique_installs === 'number') {
          map.set(p.plugin, p.unique_installs);
        }
      }
      installsCache = map;
      return map;
    } catch {
      installsCache = new Map();
      return installsCache;
    } finally {
      installsInflight = null;
    }
  })();
  return installsInflight;
}

async function ensureOfficialMarketplace(): Promise<void> {
  const current = await listMarketplaces();
  const hasOfficial = current.some(m =>
    m.name === 'claude-plugins-official' ||
    (typeof m.source === 'object' && 'url' in m.source &&
      m.source.url === `https://github.com/${OFFICIAL_MARKETPLACE}.git`),
  );
  if (hasOfficial) return;
  try {
    const { sharedMarketplaceManager } = await import('@sulesky/opencode-plugger/internal');
    const { toPluginSource } = await import('@sulesky/opencode-plugger/internal');
    await sharedMarketplaceManager.init();
    await sharedMarketplaceManager.addMarketplace(toPluginSource(OFFICIAL_MARKETPLACE));
  } catch {
    // offline / unreachable — silently skip
  }
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M installs`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K installs`;
  return `${n} installs`;
}

function describeSource(p: PluginEntry): string {
  const s = p.source;
  const target = `~/.opencode/plugins/${p.name}@${p.marketplace}`;
  if (typeof s === 'string') return `Copy ${s} from marketplace clone into ${target}`;
  const o = s as Record<string, unknown>;
  if (o.source === 'github') {
    return `Clone github:${o.repo}${o.commit || o.ref ? `@${o.commit ?? o.ref}` : ''} into ${target}`;
  }
  if (o.source === 'git-subdir') {
    return `Clone ${o.url}, take subdir "${o.path}", install into ${target}`;
  }
  return `Clone ${o.url}${o.ref ? `@${o.ref}` : ''} into ${target}`;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const { readFile } = await import('fs/promises');
    return JSON.parse(await readFile(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * Mirror of `src/util/errors.ts` `errMsg`. Inlined here so the TUI bundle
 * doesn't need a cross-module import — keep the two in sync if behavior changes.
 */
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e === undefined) return 'undefined';
  if (e === null) return 'null';
  try { return JSON.stringify(e) ?? String(e); } catch { return String(e); }
}

async function listMarketplaces(): Promise<MarketplaceEntry[]> {
  const { join } = await import('path');
  const { homedir } = await import('os');
  const reg = join(homedir(), '.opencode', 'marketplaces', 'known_marketplaces.json');
  const raw = await readJson<Array<{ name: string; cachePath: string; source: RawSource; lastUpdated: string }>>(reg);
  if (!raw) return [];
  return raw.map(r => ({
    name: r.name,
    cachePath: r.cachePath,
    source: r.source,
    lastUpdated: r.lastUpdated,
  }));
}

async function listPluginsInMarketplace(
  mp: MarketplaceEntry,
  installs: Map<string, number>,
): Promise<PluginEntry[]> {
  const { join } = await import('path');
  const manifest = await readJson<{
    plugins: Array<{
      name: string;
      description?: string;
      version?: string;
      category?: string;
      source: RawSource;
    }>;
  }>(join(mp.cachePath, '.claude-plugin', 'marketplace.json'));
  if (!manifest?.plugins) return [];
  return manifest.plugins.map(p => ({
    name: p.name,
    marketplace: mp.name,
    description: p.description,
    version: p.version,
    category: p.category,
    source: p.source,
    installs: installs.get(`${p.name}@${mp.name}`) ?? 0,
  }));
}

async function listInstalledPlugins(projectDir?: string): Promise<InstalledEntry[]> {
  const { join } = await import('path');
  const { homedir } = await import('os');
  const { readdir } = await import('fs/promises');

  const out: InstalledEntry[] = [];

  async function scan(dir: string, scope: Scope): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) out.push({ id: e.name, scope });
      }
    } catch { /* dir doesn't exist — fine */ }
  }

  await scan(join(homedir(), '.opencode', 'plugins'), { kind: 'global' });
  if (projectDir) {
    await scan(join(projectDir, '.plugger', 'plugins'), { kind: 'project', projectDir });
  }

  return out;
}

function describeScope(scope: Scope): string {
  return scope.kind === 'global' ? 'global' : `project: ${scope.projectDir}`;
}

function installPathFor(id: string, scope: Scope): string {
  return scope.kind === 'global'
    ? `~/.opencode/plugins/${id}`
    : `${scope.projectDir}/.plugger/plugins/${id}`;
}

function currentProjectDir(api: TuiPluginApi): string | undefined {
  const dir = api.state?.path?.directory;
  return dir && dir.length > 0 ? dir : undefined;
}

function sourceDescription(s: RawSource): string {
  if (typeof s === 'string') return s;
  const o = s as Record<string, unknown>;
  if (typeof o.url === 'string') return o.url;
  if (typeof o.repo === 'string') return `github:${o.repo}`;
  return JSON.stringify(o);
}

async function openMarketplacesView(api: TuiPluginApi): Promise<void> {
  const marketplaces = await listMarketplaces();
  const options: TuiDialogSelectOption<string>[] = marketplaces.length
    ? marketplaces.map(m => ({
        title: m.name,
        value: m.name,
        description: `${sourceDescription(m.source)} · updated ${new Date(m.lastUpdated).toLocaleDateString()}`,
        category: 'Marketplaces',
      }))
    : [{ title: '(no marketplaces — add one first)', value: '__empty__', disabled: true }];
  options.push({
    title: '+ Add new marketplace',
    value: '__add__',
    description: 'Register a Claude Code marketplace by owner/repo or git URL',
    category: 'Actions',
  });
  options.push({
    title: '← Back',
    value: '__back__',
    category: 'Actions',
  });

  api.ui.dialog.setSize('xlarge');
  api.ui.dialog.replace(() => (
    api.ui.DialogSelect({
      title: 'Marketplaces',
      placeholder: 'Filter...',
      options,
      onSelect: (opt) => {
        if (opt.value === '__back__') openMainView(api);
        else if (opt.value === '__add__') openAddMarketplaceDialog(api);
        else if (opt.value !== '__empty__') openMarketplaceActions(api, opt.value);
      },
    })
  ));
}

function openMarketplaceActions(api: TuiPluginApi, mpName: string): void {
  api.ui.dialog.setSize('large');
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect({
      title: mpName,
      placeholder: '',
      options: [
        { title: 'Browse plugins', value: 'browse', description: `List plugins in ${mpName}` },
        { title: 'Refresh', value: 'refresh', description: 'Re-clone the marketplace to pick up new plugins' },
        { title: 'Remove', value: 'remove', description: 'Unregister and delete the on-disk clone' },
        { title: '← Back', value: 'back' },
      ],
      onSelect: async (opt) => {
        if (opt.value === 'back') return openMarketplacesView(api);
        if (opt.value === 'browse') return openDiscoverInMarketplace(api, mpName);
        if (opt.value === 'refresh') return refreshMarketplace(api, mpName);
        if (opt.value === 'remove') return confirmRemoveMarketplace(api, mpName);
      },
    }),
  );
}

async function refreshMarketplace(api: TuiPluginApi, mpName: string): Promise<void> {
  try {
    const list = await listMarketplaces();
    const entry = list.find(m => m.name === mpName);
    if (!entry) throw new Error('Marketplace not found in registry');
    const { sharedMarketplaceManager } = await import('@sulesky/opencode-plugger/internal');
    await sharedMarketplaceManager.removeMarketplace(mpName);
    await sharedMarketplaceManager.init();
    await sharedMarketplaceManager.addMarketplace(entry.source as any, mpName);
    api.ui.toast({ variant: 'success', title: 'Refreshed', message: mpName });
  } catch (e) {
    api.ui.toast({ variant: 'error', title: 'Refresh failed', message: errMsg(e) });
  }
  openMarketplacesView(api);
}

function confirmRemoveMarketplace(api: TuiPluginApi, mpName: string): void {
  api.ui.dialog.setSize('medium');
  api.ui.dialog.replace(() =>
    api.ui.DialogConfirm({
      title: `Remove ${mpName}?`,
      message: 'Unregisters from known_marketplaces.json and deletes the on-disk clone. Installed plugins from this marketplace are NOT affected.',
      onConfirm: async () => {
        try {
          const { sharedMarketplaceManager } = await import('@sulesky/opencode-plugger/internal');
          await sharedMarketplaceManager.removeMarketplace(mpName);
          api.ui.toast({ variant: 'success', title: 'Removed', message: mpName });
        } catch (e) {
          api.ui.toast({ variant: 'error', title: 'Remove failed', message: errMsg(e) });
        }
        openMarketplacesView(api);
      },
      onCancel: () => openMarketplacesView(api),
    }),
  );
}

function openAddMarketplaceDialog(api: TuiPluginApi): void {
  let busy = false;
  api.ui.dialog.setSize('medium');
  const render = () =>
    api.ui.DialogPrompt({
      title: 'Add marketplace',
      placeholder: 'owner/repo or https://...',
      busy,
      busyText: 'Cloning...',
      onConfirm: async (value) => {
        if (!value) return;
        busy = true;
        try {
          const { sharedMarketplaceManager } = await import('@sulesky/opencode-plugger/internal');
          const { toPluginSource } = await import('@sulesky/opencode-plugger/internal');
          const source = toPluginSource(value);
          await sharedMarketplaceManager.init();
          const mp = await sharedMarketplaceManager.addMarketplace(source);
          api.ui.toast({
            variant: 'success',
            title: 'Marketplace added',
            message: `${mp.name} — ${mp.plugins.length} plugin(s)`,
          });
          openMainView(api);
        } catch (e) {
          api.ui.toast({
            variant: 'error',
            title: 'Failed to add marketplace',
            message: errMsg(e),
          });
          busy = false;
          api.ui.dialog.replace(render);
        }
      },
      onCancel: () => openMainView(api),
    });
  api.ui.dialog.replace(render);
}

async function openDiscoverInMarketplace(api: TuiPluginApi, mpName: string): Promise<void> {
  const marketplaces = await listMarketplaces();
  const mp = marketplaces.find(m => m.name === mpName);
  if (!mp) {
    api.ui.toast({ variant: 'error', message: `Marketplace "${mpName}" not found` });
    return;
  }
  const installs = await fetchInstallCounts();
  const plugins = await listPluginsInMarketplace(mp, installs);

  // Map plugin id → list of scope kinds it's installed in (one plugin can be
  // in both global and project). Used to disable already-installed entries
  // in the list and to label them with where they came from.
  const projectDir = currentProjectDir(api);
  const installedEntries = await listInstalledPlugins(projectDir);
  const installedScopes = new Map<string, Array<'global' | 'project'>>();
  for (const e of installedEntries) {
    const scopes = installedScopes.get(e.id) ?? [];
    scopes.push(e.scope.kind);
    installedScopes.set(e.id, scopes);
  }

  plugins.sort((a, b) => b.installs - a.installs || a.name.localeCompare(b.name));

  const options: TuiDialogSelectOption<string>[] = plugins.map(p => {
    const id = `${p.name}@${p.marketplace}`;
    const inScopes = installedScopes.get(id);
    const isInstalled = !!inScopes;
    const installedTag = isInstalled ? ` · installed (${inScopes!.join('+')})` : '';
    return {
      title: isInstalled ? `${p.name}  ✓` : p.name,
      value: p.name,
      description: [
        `${p.marketplace} · ${formatInstalls(p.installs)}${p.version ? ` · v${p.version}` : ''}${installedTag}`,
        p.description ?? '',
      ].filter(Boolean).join('\n'),
      category: p.category || p.marketplace,
      disabled: isInstalled,
    };
  });
  options.push({ title: '← Back', value: '__back__' });

  api.ui.dialog.setSize('xlarge');
  api.ui.dialog.replace(() => (
    api.ui.DialogSelect({
      title: `Discover · ${mpName} (${plugins.length} plugins, ${installedScopes.size} installed)`,
      placeholder: 'Search plugins...',
      options,
      onSelect: async (opt) => {
        if (opt.value === '__back__') return openMarketplacesView(api);
        const plugin = plugins.find(p => p.name === opt.value);
        if (!plugin) return;
        await confirmInstall(api, plugin);
      },
    })
  ));
}

async function openDiscoverOfficial(api: TuiPluginApi): Promise<void> {
  // Discover mirrors Claude Code: it shows ONLY the official marketplace.
  // Other registered marketplaces live under the Marketplaces tab.
  api.ui.dialog.setSize('xlarge');
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect({
      title: 'Discover · loading...',
      placeholder: '',
      options: [{ title: 'Fetching plugin index...', value: '__loading__', disabled: true }],
      onSelect: () => {},
    }),
  );

  await ensureOfficialMarketplace();
  await openDiscoverInMarketplace(api, 'claude-plugins-official');
}

async function openInstalledView(api: TuiPluginApi): Promise<void> {
  const projectDir = currentProjectDir(api);
  const installed = await listInstalledPlugins(projectDir);
  const options: TuiDialogSelectOption<number | string>[] = installed.length
    ? installed.map((e, i) => ({
        title: e.id,
        value: i,
        description: `[${describeScope(e.scope)}]`,
        category: e.scope.kind === 'global' ? 'Global' : 'Project',
      }))
    : [{ title: '(no plugins installed)', value: '__empty__', disabled: true }];
  options.push({ title: '← Back', value: '__back__' });

  api.ui.dialog.setSize('xlarge');
  api.ui.dialog.replace(() => (
    api.ui.DialogSelect({
      title: `Installed · ${installed.length} plugin(s)`,
      placeholder: 'Filter...',
      options,
      onSelect: (opt) => {
        if (opt.value === '__back__') return openMainView(api);
        if (opt.value === '__empty__') return;
        const entry = installed[opt.value as number];
        if (entry) openInstalledPluginActions(api, entry);
      },
    })
  ));
}

async function openInstalledPluginActions(api: TuiPluginApi, entry: InstalledEntry): Promise<void> {
  const { join } = await import('path');
  const { homedir } = await import('os');
  const installRoot = entry.scope.kind === 'global'
    ? join(homedir(), '.opencode', 'plugins')
    : join(entry.scope.projectDir, '.plugger', 'plugins');
  const meta = await readJson<{ installedAt?: string; manifestVersion?: string }>(
    join(installRoot, entry.id, '.opencode-plugin-meta.json'),
  );
  const manifest = await readJson<{ description?: string; version?: string; homepage?: string }>(
    join(installRoot, entry.id, '.claude-plugin', 'plugin.json'),
  );
  const lines = [
    `Scope: ${describeScope(entry.scope)}`,
    `Path: ${installPathFor(entry.id, entry.scope)}`,
    meta?.installedAt && `Installed: ${meta.installedAt}`,
    manifest?.version && `Version: ${manifest.version}`,
    manifest?.homepage && `Homepage: ${manifest.homepage}`,
    manifest?.description && `\n${manifest.description}`,
  ].filter(Boolean).join('\n');

  api.ui.dialog.setSize('large');
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect({
      title: `${entry.id} [${entry.scope.kind}]`,
      placeholder: '',
      options: [
        { title: 'Update', value: 'update', description: 'Re-fetch from source and re-run translator (replaces the clone).' },
        { title: 'Uninstall', value: 'uninstall', description: `Delete from ${installPathFor(entry.id, entry.scope)} and revert translated artifacts.` },
        { title: 'Back to Installed', value: 'back' },
      ],
      onSelect: async (opt) => {
        if (opt.value === 'back') return openInstalledView(api);
        if (opt.value === 'update') return confirmUpdate(api, entry);
        if (opt.value === 'uninstall') return confirmUninstall(api, entry);
      },
      onMove: () => {},
    }),
  );
  api.ui.toast({ variant: 'info', title: entry.id, message: lines, duration: 8000 });
}

function confirmUpdate(api: TuiPluginApi, entry: InstalledEntry): void {
  api.ui.dialog.setSize('medium');
  api.ui.dialog.replace(() =>
    api.ui.DialogConfirm({
      title: `Update ${entry.id}?`,
      message: `Wipes ${installPathFor(entry.id, entry.scope)}, re-fetches from the original source recorded in meta, and re-runs the translator. Use this to pick up upstream changes.`,
      onConfirm: async () => {
        try {
          const { updatePlugin } = await import('@sulesky/opencode-plugger/internal');
          const result = await updatePlugin(entry.id, { scope: entry.scope });
          api.ui.toast({
            variant: 'success',
            title: 'Plugin updated',
            message: `${result.id} → v${result.manifest.version ?? '?'}`,
          });
        } catch (e) {
          api.ui.toast({ variant: 'error', title: 'Update failed', message: errMsg(e) });
        }
        openInstalledView(api);
      },
      onCancel: () => openInstalledPluginActions(api, entry),
    }),
  );
}

function confirmUninstall(api: TuiPluginApi, entry: InstalledEntry): void {
  api.ui.dialog.setSize('medium');
  api.ui.dialog.replace(() =>
    api.ui.DialogConfirm({
      title: `Uninstall ${entry.id}?`,
      message: `Deletes ${installPathFor(entry.id, entry.scope)} and any translated commands/skills/MCP entries/hook shims in the ${entry.scope.kind} scope.`,
      onConfirm: async () => {
        try {
          const { uninstallPlugin } = await import('@sulesky/opencode-plugger/internal');
          await uninstallPlugin(entry.id, { scope: entry.scope });
          api.ui.toast({ variant: 'success', title: 'Uninstalled', message: `${entry.id} [${entry.scope.kind}]` });
        } catch (e) {
          api.ui.toast({ variant: 'error', title: 'Uninstall failed', message: errMsg(e) });
        }
        openInstalledView(api);
      },
      onCancel: () => openInstalledView(api),
    }),
  );
}


async function confirmInstall(api: TuiPluginApi, plugin: PluginEntry): Promise<void> {
  const projectDir = currentProjectDir(api);
  const lines = [
    plugin.description,
    '',
    `Marketplace: ${plugin.marketplace}`,
    plugin.version && `Version: v${plugin.version}`,
    plugin.category && `Category: ${plugin.category}`,
    plugin.installs > 0 && `Installs: ${formatInstalls(plugin.installs)}`,
    '',
    describeSource(plugin),
  ].filter(Boolean).join('\n');

  const scopeOptions: TuiDialogSelectOption<Scope>[] = [
    {
      title: 'Global (all projects)',
      value: { kind: 'global' },
      description: 'Installs into ~/.opencode/plugins; activates in every project',
    },
  ];
  if (projectDir) {
    scopeOptions.push({
      title: `This project only (${projectDir})`,
      value: { kind: 'project', projectDir },
      description: 'Installs into <project>/.plugger/plugins; only active inside this project',
    });
  }

  api.ui.dialog.setSize('large');
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect({
      title: `Install ${plugin.name} — where? (Esc to cancel)`,
      placeholder: '',
      options: scopeOptions,
      onSelect: (opt) => confirmInstallWithScope(api, plugin, opt.value, lines),
    }),
  );
}

function confirmInstallWithScope(api: TuiPluginApi, plugin: PluginEntry, scope: Scope, info: string): void {
  const message = `${info}\n\nScope: ${describeScope(scope)}`;
  api.ui.dialog.setSize('large');
  api.ui.dialog.replace(() =>
    api.ui.DialogConfirm({
      title: `Install ${plugin.name}?`,
      message,
      onConfirm: async () => {
        try {
          const { installPlugin } = await import('@sulesky/opencode-plugger/internal');
          const result = await installPlugin(
            { name: plugin.name, source: plugin.source as any },
            plugin.marketplace,
            { scope },
          );
          api.ui.toast({
            variant: 'success',
            title: 'Plugin installed',
            message: `${result.id} [${scope.kind}]`,
          });
        } catch (e) {
          api.ui.toast({ variant: 'error', title: 'Install failed', message: errMsg(e) });
        }
        api.ui.dialog.clear();
      },
      onCancel: () => api.ui.dialog.clear(),
    }),
  );
}

function openMainView(api: TuiPluginApi): void {
  const options: TuiDialogSelectOption<Tab | 'add'>[] = [
    { title: 'Discover', value: 'discover', description: 'Browse Claude Code plugins from the official marketplace' },
    { title: 'Installed', value: 'installed', description: 'Claude Code plugins cloned in ~/.opencode/plugins/' },
    { title: 'Marketplaces', value: 'marketplaces', description: 'Registered Claude Code marketplaces' },
    { title: '+ Add marketplace', value: 'add', description: 'Register a new marketplace by owner/repo or git URL' },
  ];

  api.ui.dialog.setSize('xlarge');
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect({
      title: 'Plugger · Claude Code plugins for OpenCode',
      placeholder: 'Choose a section...',
      options,
      onSelect: (opt) => {
        if (opt.value === 'discover') openDiscoverOfficial(api);
        else if (opt.value === 'installed') openInstalledView(api);
        else if (opt.value === 'marketplaces') openMarketplacesView(api);
        else if (opt.value === 'add') openAddMarketplaceDialog(api);
      },
    }),
  );
}

async function prefetchPluginIndex(): Promise<void> {
  try {
    await ensureOfficialMarketplace();
    await fetchInstallCounts();
  } catch {
    // best-effort — Discover still works without preloaded cache
  }
}

export const tui: TuiPlugin = async (api) => {
  // Warm the index in the background so the first /plugin → Discover is snappy.
  prefetchPluginIndex().catch(() => {});

  api.command.register(() => [
    {
      title: 'Plugin Manager',
      value: `${PLUGIN_VALUE_PREFIX}manager`,
      description: 'Browse, install, and manage Claude Code plugins',
      category: 'Plugger',
      slash: { name: 'plugin', aliases: ['marketplace', 'plugger'] },
      onSelect: () => openMainView(api),
    },
  ]);
};

// OpenCode TUI plugin loader derives `id` from the install spec / package
// name. Exporting our own `id` confused the loader into reporting "does not
// expose a tui entrypoint" (the missing-entry branch fires when validation
// rejects the module shape, not only when `tui` itself is absent). Default
// export is the module shape per @opencode-ai/plugin's TuiPluginModule type.
export default { tui } satisfies { tui: TuiPlugin };
