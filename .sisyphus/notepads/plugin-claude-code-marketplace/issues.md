# Issues - Plugin Claude Code Marketplace

## Critical
None found.

## High
None found.

## Medium

### 1. Marketplace name derivation bug (manager.ts:26)
When `addMarketplace()` receives a `git` source without an explicit name, it defaults to `"custom-marketplace"` instead of reading the `name` from the marketplace.json manifest. This causes `searchPlugins` to return `marketplace: "custom-marketplace"` regardless of the actual marketplace name.

**Impact**: Integration test fails. Incorrect marketplace name in search results.
**Fix**: Move name derivation after cloning — read manifest, use `marketplace.name` if no explicit name provided.

### 2. Test isolation: shared ~/.opencode/marketplaces/known_marketplaces.json
Multiple test suites write to the same persistent file path. Tests that assert "empty marketplace list" fail when other tests have previously added marketplaces, because `MarketplaceManager` reads from the global `~/.opencode/marketplaces/known_marketplaces.json`.

**Impact**: 3 tests fail intermittently depending on run order.
**Fix**: Make `KNOWN_FILE` configurable in `MarketplaceManager` constructor, or use `beforeEach`/`afterEach` cleanup in tests.

## Low
None.
