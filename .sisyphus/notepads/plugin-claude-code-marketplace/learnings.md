# Learnings - Plugin Claude Code Marketplace

## Task 1: Project Scaffolding

- Reference source code at `../claude-code-source-code-main/` was NOT present — used latest dependency versions instead
- zod v4 (4.4.3) was installed as latest — API may differ from v3 (safeParse still exists)
- typescript v6 (6.0.3) installed — verify compatibility with tsconfig settings
- LSP server (`typescript-language-server`) not installed globally — verification relied on `tsc --noEmit`
- Bun 1.2.17 available for test runner
- Node 25.9.0 available

## QA Review (2026-05-11)

### Test Results
- 34 tests across 6 test suites
- 31 pass / 3 fail
- TypeScript: clean (tsc --noEmit)

### Passing Suites
- sources.test.ts: 8/8 ✅
- plugin.test.ts (loader): 6/6 ✅
- install.test.ts (installer): 2/2 ✅
- Zod schemas (inline): valid/invalid correct ✅
- Source resolver (inline): correct output ✅

### Failing Tests (3)
1. **integration.test.ts:96** — Marketplace name mismatch. `addMarketplace` with git source defaults to "custom-marketplace" instead of reading from marketplace.json's `name` field. Root cause: `manager.ts:26` name derivation logic.
2. **manager.test.ts:24** — `searchPlugins` returns stale results from `known_marketplaces.json` (persistent disk state across test runs).
3. **marketplace.test.ts:26** & **plugin-market.test.ts:30** — Same isolation issue: tests share `~/.opencode/marketplaces/known_marketplaces.json`.
