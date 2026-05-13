/**
 * Internal entry point for the TUI bundle.
 *
 * OpenCode's plugin spec resolver treats `<pkg>/<subpath>@<ver>` as a single
 * npm package name (it doesn't split into name + subpath for resolution), so
 * the TUI lives in a separate package — `@sulesky/opencode-plugger-tui` —
 * that depends on this one. The TUI bundle imports server-side code through
 * this module instead of relative `../dist/...` paths, because in the
 * installed (non-monorepo) layout those relative paths don't exist.
 *
 * Don't add anything here that isn't actually consumed by the TUI; this is a
 * public surface as far as npm is concerned and every export is a forever
 * compatibility commitment.
 */
export { sharedMarketplaceManager } from './marketplace/manager.js';
export { toPluginSource } from './schemas/marketplace.js';
export { installPlugin, updatePlugin } from './installer/install.js';
export { uninstallPlugin } from './installer/uninstall.js';
