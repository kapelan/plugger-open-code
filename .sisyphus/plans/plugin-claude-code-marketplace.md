# OpenCode Plugin: Claude Code Marketplace Bridge

## TL;DR

> **Quick Summary**: Plugin OpenCode dodający natywny system marketplace wzorowany na Claude Code. Umożliwia przeglądanie, wyszukiwanie i instalowanie pluginów z marketplace'ów Claude Code (oficjalnych i społecznościowych) bezpośrednio w OpenCode. Używa `.claude-plugin/plugin.json` bezpośrednio bez translacji — pluginy Claude Code działają natywnie.
>
> **Deliverables**:
> - Plugin OpenCode (`opencode.plugin.json` + npm package)
> - System marketplace: `/marketplace add|list|remove|update`
> - Instalacja pluginów z marketplace: `/plugin marketplace-install <id>`
> - Natywne wsparcie `.claude-plugin/plugin.json` (bez translacji)
> - Cache marketplace w `~/.opencode/marketplaces/`
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 5 → Task 10 → Task 14 → Final Verification

---

## Context

### Original Request
Użytkownik chce zbudować plugin do OpenCode, który umożliwia używanie marketplace'ów i pluginów Claude Code — "dokładnie w ten sam sposób". Kod źródłowy Claude Code znajduje się w `../claude-code-source-code-main`.

### Interview Summary
**Key Discussions**:
- **Podejście**: "Port koncepcji" — natywny system marketplace dla OpenCode inspirowany Claude Code, nie 1:1 API compatibility
- **Zakres**: Pełen ekosystem — discover, install, run (oficjalny marketplace + community)
- **Format**: Plugin OpenCode, który dodaje marketplace jako koncept. Używa `.claude-plugin/plugin.json` bezpośrednio — pluginy Claude Code są ładowane natywnie, bez konwersji do `opencode.plugin.json`.
- **Instalacja**: Standardowo przez `opencode plugin install`
- **Marketplace'y**: Oficjalny `anthropics/claude-plugins-official` + dowolne repozytorium Git z `marketplace.json`
- **Testy**: TDD

**Research Findings**:
- **Claude Code marketplace**: Git repo → `.claude-plugin/marketplace.json` → lista pluginów z `{name, source, description, tags, ...}`
- **Claude Code plugin**: `.claude-plugin/plugin.json` → `{name, version, description, hooks, commands, agents, skills, MCP, outputStyles, LSP, dependencies}`
- **OpenCode plugin**: npm package z `opencode.plugin.json` → `{name, version, description, hooks, skills, commands, mcp, toolOverrides, completions}`
- **OpenCode v1.14.41**: Brak systemu marketplace — tylko `opencode plugin install <npm-module>`
- **Claude Code plugin ID format**: `{name}@{marketplace}`

### Metis Review
Metis nie zwrócił analizy (agent utknął). Luki zidentyfikowane samodzielnie:
- Instalacja pluginów Claude Code (Git repo) różni się od instalacji OpenCode (npm) → plugin ładuje `.claude-plugin/plugin.json` bezpośrednio z sklonowanego repozytorium
- Pola Claude Code nieobecne w OpenCode (`agents`, `outputStyles`, `LSP`) → ignorowane przy ładowaniu (nie przeszkadzają)
- Bezpieczeństwo: pluginy z community marketplace mogą być złośliwe → potrzebujemy podstawowej walidacji

---

## Work Objectives

### Core Objective
Zbudować plugin OpenCode, który dodaje system marketplace pozwalający na przeglądanie i instalację pluginów z marketplace'ów Claude Code (oficjalnych i community), z automatyczną translacją manifestów.

### Concrete Deliverables
- `opencode.plugin.json` — manifest pluginu
- `src/marketplace/` — zarządzanie marketplace (clone, cache, parse, search)
- `src/translator/` — translacja `.claude-plugin/plugin.json` → `opencode.plugin.json`
- `src/commands/` — slash komendy: `/marketplace`, `/plugin marketplace-install`, `/plugin marketplace-search`
- `__tests__/` — testy TDD dla każdego modułu

### Definition of Done
- [ ] `opencode plugin install ./plugger-open-code` instaluje plugin poprawnie
- [ ] `/marketplace add anthropics/claude-plugins-official` dodaje oficjalny marketplace
- [ ] `/plugin marketplace-search <query>` zwraca listę pluginów z marketplace
- [ ] `/plugin marketplace-install <plugin-id>` instaluje plugin z marketplace do OpenCode
- [ ] Wszystkie testy przechodzą: `bun test`

### Must Have
- Klonowanie i cache marketplace repozytoriów Git
- Parsowanie i walidacja `marketplace.json` (Zod schema)
- Parsowanie i walidacja `.claude-plugin/plugin.json` (Zod schema)
- Translacja manifestu Claude Code → OpenCode (mapowanie pól)
- Slash komenda `/marketplace add <source>`
- Slash komenda `/plugin marketplace-install <id>`
- Slash komenda `/plugin marketplace-search <query>`
- Wsparcie dla oficjalnego marketplace `anthropics/claude-plugins-official`

### Must NOT Have (Guardrails)
- **NIE** 1:1 API compatibility z Claude Code — to jest natywny system OpenCode
- **NIE** translacja/konwersja manifestów — `.claude-plugin/plugin.json` jest używany bezpośrednio
- **NIE** modyfikacja binarki OpenCode — tylko plugin
- **NIE** wsparcie dla npm-based marketplace Claude Code (v1 — tylko Git)
- **NIE** generowanie pośredniego `opencode.plugin.json` dla pluginów z marketplace
- **NIE** automatyczna aktualizacja pluginów (out of scope v1)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (greenfield — trzeba setup)
- **Automated tests**: TDD
- **Framework**: bun test (dla spójności z Claude Code ekosystemem)
- **Test setup**: `bun test` z TypeScript, brak dodatkowych configów

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI commands**: interactive_bash (tmux) — Run OpenCode commands, validate output
- **API/module tests**: Bash (bun/node REPL) — Import, call functions, compare output
- **File verification**: Bash — Check file existence, content, structure

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + scaffolding):
├── Task 1: Project scaffolding + package.json + tsconfig [quick]
├── Task 2: Zod schemas — marketplace.json + plugin.json [quick]
├── Task 3: Type definitions [quick]
├── Task 4: Test infrastructure setup [quick]
└── Task 5: Marketplace source resolver [quick]

Wave 2 (After Wave 1 — core modules, MAX PARALLEL):
├── Task 6: Marketplace manager (clone, cache, parse) [deep]
├── Task 7: Plugin loader (read .claude-plugin/plugin.json directly) [deep]
├── Task 8: Plugin installer (clone + register) [unspecified-high]
├── Task 9: Slash commands — marketplace management [quick]
└── Task 10: Slash commands — plugin install from marketplace [quick]

Wave 3 (After Wave 2 — integration + documentation):
├── Task 11: opencode.plugin.json manifest [quick]
├── Task 12: Integration tests [unspecified-high]
└── Task 13: CLI end-to-end verification [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

**Critical Path**: Task 1 → Task 5 → Task 6 → Task 10 → Task 12 → F1-F4 → user okay
**Parallel Speedup**: ~50% faster than sequential
**Max Concurrent**: 5 (Waves 1 & 2)

---

## TODOs

- [x] 1. Project scaffolding + package.json + tsconfig [quick] [Wave 1]
- [x] 2. Zod schemas: marketplace.json + plugin.json [quick] [Wave 1]
- [x] 3. Type definitions from schemas [quick] [Wave 1]
- [x] 4. Test infrastructure: bun test + fixtures [quick] [Wave 1]
- [x] 5. Marketplace source resolver (github/git → gitUrl) [quick] [Wave 1]
- [x] 6. Marketplace manager: clone, cache, parse marketplace.json [deep] [Wave 2]
- [x] 7. Plugin loader: read .claude-plugin/plugin.json directly + map to OpenCode capabilities [deep] [Wave 2]
- [x] 8. Plugin installer: clone + register [unspecified-high] [Wave 2]
- [x] 9. Slash commands: /marketplace add|list|remove [quick] [Wave 2]
- [x] 10. Slash commands: /plugin marketplace-install|search [quick] [Wave 2]
- [x] 11. opencode.plugin.json manifest + plugin registration [quick] [Wave 3]
- [x] 12. Integration tests: end-to-end marketplace → install flow [unspecified-high] [Wave 3]
- [x] 13. CLI end-to-end verification [deep] [Wave 3]

---

## Task Details

### Wave 1 — Foundation (all parallel, max 5 concurrent)

#### Task 1: Project scaffolding [quick]

**What to do**: Create package.json (@plugger-open-code/claude-marketplace, type=module), tsconfig.json (ES2022, NodeNext, strict), src/index.ts placeholder, directory structure (src/commands/, src/marketplace/, src/translator/, src/installer/, __tests__/). Install deps: zod, execa, semver. devDeps: @types/node, typescript, bun-types.

**Refs**: `../claude-code-source-code-main/package.json` (dep versions, scripts), `../claude-code-source-code-main/tsconfig.json` (strict TypeScript config)

**QA**: `npm install && npx tsc --noEmit` → both succeed. Evidence: `.sisyphus/evidence/task-1-scaffold.txt`

**Commit**: `feat(scaffold): project setup` — package.json, tsconfig.json, src/index.ts

#### Task 2: Zod schemas [quick]

**What to do**: `src/schemas/marketplace.ts` with MarketplaceSchema, PluginMarketplaceEntrySchema (discriminatedUnion for source: github|git). `src/schemas/plugin.ts` with PluginManifestSchema (name, version?, description?, author?, hooks?, commands?, skills?, mcpServers?, dependencies?).

**Refs**: `../claude-code-source-code-main/src/utils/plugins/schemas.ts` — FULL: PluginManifestSchema L884, PluginMarketplaceEntrySchema L1254, MarketplaceSourceSchema L906, PluginAuthorSchema L251

**QA**: bun repl → `MarketplaceSchema.safeParse({name:'test',plugins:[{name:'p',source:{source:'github',repo:'a/b'}}]})` → success. Invalid → ZodError. Evidence: `.sisyphus/evidence/task-2-parse.txt`

**Commit**: `feat(schemas): Zod schemas for marketplace and plugin manifests` — src/schemas/marketplace.ts, src/schemas/plugin.ts

#### Task 3: Type definitions [quick]

**What to do**: `src/types/index.ts` — infer types from schemas. Add helpers: MarketplaceConfig, InstalledPlugin (id, name, marketplace, manifest, installPath), TranslatedManifest (originalName, opencodeManifest, warnings[]).

**Refs**: `../claude-code-source-code-main/src/types/plugin.ts` (PluginConfig, LoadedPlugin), `../claude-code-source-code-main/src/utils/plugins/schemas.ts:1647-1662` (type exports)

**QA**: `npx tsc --noEmit` → zero errors. Evidence: `.sisyphus/evidence/task-3-typecheck.txt`

**Commit**: `feat(types): type definitions from Zod schemas` — src/types/index.ts

#### Task 4: Test infrastructure [quick]

**What to do**: Configure `bun test`. Create test fixtures: `__tests__/fixtures/valid-marketplace.json` (3 plugins: github/git sources), `valid-plugin.json`, `invalid-marketplace.json`, `invalid-plugin.json`. `__tests__/setup.ts`.

**Refs**: `../claude-code-source-code-main/src/utils/plugins/schemas.ts:1254-1299` (marketplace + entry schemas for fixture shape)

**QA**: `bun test` exits 0. Fixture JSON parses without error. Evidence: `.sisyphus/evidence/task-4-test.txt`

**Commit**: `feat(tests): test infrastructure with bun test and fixtures` — __tests__/setup.ts, __tests__/fixtures/

#### Task 5: Marketplace source resolver [quick]

**What to do**: `src/marketplace/sources.ts` — `resolveMarketplaceSource(source) → {gitUrl, ref, manifestPath}`. github→https://github.com/{repo}.git, git→url directly. Default manifestPath: `.claude-plugin/marketplace.json`. TDD: test first.

**Refs**: `../claude-code-source-code-main/src/utils/plugins/schemas.ts:906-1010` (MarketplaceSourceSchema variants)

**QA**: `resolveMarketplaceSource({source:'github',repo:'anthropics/claude-plugins-official'})` → `{gitUrl:'https://github.com/anthropics/claude-plugins-official.git',...}`. Invalid → ZodError. Evidence: `.sisyphus/evidence/task-5-resolve.txt`

**Commit**: `feat(marketplace): source resolver for GitHub and Git sources` — src/marketplace/sources.ts, __tests__/marketplace/sources.test.ts

### Wave 2 — Core modules (all parallel, max 5 concurrent)

#### Task 6: Marketplace manager — clone, cache, parse [deep]

**What to do**: Create `src/marketplace/manager.ts` — class `MarketplaceManager` with:
- `addMarketplace(source, name?)` → clone Git repo via execa(`git clone --depth 1 --single-branch`), sparse checkout if path specified
- `listMarketplaces()` → returns cached marketplace names and metadata
- `getMarketplace(name)` → parse cached marketplace.json via MarketplaceSchema
- `searchPlugins(query)` → search across all cached marketplaces by name/description/tags
- `updateMarketplace(name)` → `git pull` in cached repo
- `removeMarketplace(name)` → delete cached repo
- Cache directory: `~/.opencode/marketplaces/{name}/`
- Cache metadata: `~/.opencode/marketplaces/known_marketplaces.json`
- Write TDD test first: `__tests__/marketplace/manager.test.ts`

**Refs**: `../claude-code-source-code-main/src/utils/plugins/marketplaceManager.ts` (FULL: file structure L10-19, loadAndCacheMarketplace, getMarketplace, getPluginById, loadKnownMarketplacesConfig), `../claude-code-source-code-main/src/services/plugins/PluginInstallationManager.ts` (background installation pattern)

**QA**: 
1. `MarketplaceManager.addMarketplace({source:'github', repo:'anthropics/claude-plugins-official'})` → clones repo, parses marketplace.json, returns plugin count
2. `MarketplaceManager.searchPlugins('react')` → returns matching plugins
3. Invalid marketplace (no marketplace.json) → throws descriptive error
Evidence: `.sisyphus/evidence/task-6-{add,search,invalid}.txt`

**Commit**: `feat(marketplace): manager with clone, cache, parse, search` — src/marketplace/manager.ts, __tests__/marketplace/manager.test.ts

#### Task 7: Plugin loader — read .claude-plugin/plugin.json directly [deep]

**What to do**: Create `src/loader/plugin.ts` with `loadPlugin(pluginDir: string) → LoadedPlugin`:
- Read and parse `.claude-plugin/plugin.json` via PluginManifestSchema
- Zwróć strukturę LoadedPlugin z oryginalnym manifestem (bez translacji!)
- Mapuj pola manifestu do możliwości OpenCode w runtime:
  - `commands` → rejestruj jako slash komendy
  - `hooks` → rejestruj jako hooki OpenCode
  - `skills` → rejestruj jako skille
  - `mcpServers` → rejestruj jako MCP serwery
- Pola `agents`, `outputStyles`, `lspServers` — ignoruj (loguj warning)
- Plugin jest ładowany bezpośrednio z katalogu (nie wymaga `opencode.plugin.json`)
- Write TDD test first: `__tests__/loader/plugin.test.ts`

**Refs**: `../claude-code-source-code-main/src/utils/plugins/schemas.ts:884-898` (PluginManifestSchema — struktura do czytania), `../claude-code-source-code-main/src/utils/plugins/loadPluginCommands.ts` (jak komendy są ładowane z manifestu), `../claude-code-source-code-main/src/utils/plugins/pluginLoader.ts` (loadPluginManifest, loadAllPlugins)

**QA**:
1. Poprawny `.claude-plugin/plugin.json` → LoadedPlugin z pełnym manifestem
2. Minimalny manifest (tylko name) → LoadedPlugin z minimalną strukturą
3. Brak plugin.json → descriptive error
Evidence: `.sisyphus/evidence/task-7-{valid,minimal,missing}.txt`

**Commit**: `feat(loader): direct .claude-plugin/plugin.json loading` — src/loader/plugin.ts, __tests__/loader/plugin.test.ts

#### Task 8: Plugin installer — clone + register [unspecified-high]

**What to do**: Create `src/installer/install.ts` with `installPlugin(entry: PluginMarketplaceEntry, marketplace: string) → InstalledPlugin`:
- Pobierz źródło pluginu z marketplace entry (`source` field)
- Sklonuj repozytorium pluginu (git clone --depth 1)
- Zweryfikuj istnienie `.claude-plugin/plugin.json`
- Wywołaj `loadPlugin()` z Task 7 aby załadować manifest
- Zarejestruj plugin w OpenCode: zapisz ścieżkę do katalogu pluginu w konfiguracji
- Wygeneruj plugin ID: `{name}@{marketplace}`
- Obsługa błędów: missing plugin.json, invalid manifest, git clone failure
- Write TDD test first: `__tests__/installer/install.test.ts`

**Refs**: `../claude-code-source-code-main/src/services/plugins/pluginOperations.ts` (installPluginOp, resolvePluginFromEntry), `../claude-code-source-code-main/src/utils/plugins/pluginInstallationHelpers.ts` (installResolvedPlugin)

**QA**:
1. Instalacja poprawnego pluginu → zwraca InstalledPlugin
2. Brak plugin.json → descriptive error
3. Niepoprawny manifest → ZodError
Evidence: `.sisyphus/evidence/task-8-{install,missing-manifest,invalid}.txt`

**Commit**: `feat(installer): plugin cloning and registration` — src/installer/install.ts, __tests__/installer/install.test.ts

**Refs**: `../claude-code-source-code-main/src/services/plugins/pluginOperations.ts` (FULL: installPluginOp, installResolvedPlugin, resolvePluginFromEntry — installation flow pattern), `../claude-code-source-code-main/src/utils/plugins/pluginInstallationHelpers.ts` (formatResolutionError, installResolvedPlugin)

**QA**:
1. Install valid plugin from marketplace entry → returns InstalledPlugin with correct id
2. Plugin missing plugin.json → descriptive error, not crash
3. manifest.json invalid → Zod validation error propagated
Evidence: `.sisyphus/evidence/task-8-{install,missing-manifest,invalid-manifest}.txt`

**Commit**: `feat(installer): plugin installation from marketplace entries` — src/installer/install.ts, __tests__/installer/install.test.ts

#### Task 9: Slash commands — marketplace management [quick]

**What to do**: Create `src/commands/marketplace.ts` — slash commands:
- `/marketplace add <source>` — add marketplace (github repo, git URL). Examples: `anthropics/claude-plugins-official`, `https://gitlab.com/user/repo.git`
- `/marketplace list` — list all added marketplaces with status (cached, last updated, plugin count)
- `/marketplace remove <name>` — remove marketplace and its cache
- `/marketplace update [name]` — update marketplace cache (git pull)
- Each command: parse args, call MarketplaceManager methods, format output for display
- Handle errors: network failures, invalid repos, missing marketplaces

**Refs**: `../claude-code-source-code-main/src/services/plugins/pluginCliCommands.ts` (CLI command wrapper pattern), `../claude-code-source-code-main/src/cli/handlers/plugins.ts` (CLI handler pattern)

**QA**:
1. `/marketplace add anthropics/claude-plugins-official` → clones, reports success with plugin count
2. `/marketplace list` → shows added marketplace
3. `/marketplace add invalid/repo` → reports error "Repository not found"
Evidence: `.sisyphus/evidence/task-9-{add,list,error}.txt`

**Commit**: `feat(commands): marketplace management slash commands` — src/commands/marketplace.ts

#### Task 10: Slash commands — plugin install from marketplace [quick]

**What to do**: Create `src/commands/plugin-market.ts` — slash commands:
- `/plugin marketplace-search <query>` — search all marketplaces, return matching plugins with name, description, marketplace source
- `/plugin marketplace-install <id>` — install plugin by ID (`name@marketplace` or bare name with marketplace picker)
- `/plugin marketplace-list [marketplace]` — list all plugins in a marketplace
- Each command: parse args, call MarketplaceManager.searchPlugins() / installer.installPlugin(), format output
- Handle: no results, ambiguous plugin name (multiple matches), installation failures

**Refs**: `../claude-code-source-code-main/src/services/plugins/pluginCliCommands.ts` (installPluginOp wrapper), `../claude-code-source-code-main/src/utils/plugins/pluginIdentifier.ts` (parsePluginIdentifier — how plugin@marketplace IDs work)

**QA**:
1. `/plugin marketplace-search react` → returns plugins matching "react"
2. `/plugin marketplace-install some-plugin@claude-plugins-official` → installs successfully
3. `/plugin marketplace-search xyzabc123` → "No plugins found"
Evidence: `.sisyphus/evidence/task-10-{search,install,no-results}.txt`

**Commit**: `feat(commands): plugin marketplace install and search commands` — src/commands/plugin-market.ts

---

#### Task 11: opencode.plugin.json manifest [quick]

**What to do**: Create `opencode.plugin.json` at project root — the OpenCode plugin manifest that registers this plugin. Fields: name, version, description, author, commands (list slash commands with handlers), hooks (if any), skills (if any).

**Refs**: OpenCode plugin format (explore agent findings: opencode.plugin.json with hooks, skills, commands, mcp)

**QA**: Valid JSON, parses without errors, all required fields present. Evidence: `.sisyphus/evidence/task-11-manifest.txt`

**Commit**: `feat(manifest): OpenCode plugin manifest registration` — opencode.plugin.json

#### Task 12: Integration tests [unspecified-high]

**What to do**: Create `__tests__/integration.test.ts` — end-to-end test suite:
- Mock git repository with marketplace.json and plugins
- Test full flow: add marketplace → search → install plugin → verify installed
- Test edge cases: network timeout, corrupted marketplace.json, conflicting plugins
- Use bun test with temp directories for isolation

**QA**: `bun test __tests__/integration.test.ts` → all tests pass. Evidence: `.sisyphus/evidence/task-12-integration.txt`

**Commit**: `test(integration): end-to-end marketplace-to-install flow` — __tests__/integration.test.ts

#### Task 13: CLI end-to-end verification [deep]

**What to do**: Manual verification using `opencode` CLI:
- `opencode plugin install ./plugger-open-code` → plugin installed
- `/marketplace add anthropics/claude-plugins-official` → marketplace added
- `/plugin marketplace-search <query>` → results returned
- Document any issues found

**QA**: All commands work end-to-end with real OpenCode. Evidence: `.sisyphus/evidence/task-13-e2e.txt`

**Commit**: NO (verification only, no code changes)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Test edge cases: empty state, invalid marketplace URL, missing plugin.json, network errors.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: verify everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(scaffold): project setup with schemas and test infrastructure` — package.json, tsconfig.json, src/types/, src/schemas/
- **Wave 2**: `feat(core): marketplace manager, translator, installer` — src/marketplace/, src/translator/, src/installer/
- **Wave 3**: `feat(commands): slash commands and integration` — src/commands/, opencode.plugin.json

---

## Success Criteria

### Verification Commands
```bash
# Plugin installation
opencode plugin install ./plugger-open-code  # Expected: Plugin installed successfully

# Marketplace operations
opencode marketplace add anthropics/claude-plugins-official  # Expected: Marketplace added
opencode plugin marketplace-search react                    # Expected: List of matching plugins
opencode plugin marketplace-install some-plugin@claude-plugins-official  # Expected: Plugin installed

# Tests
bun test  # Expected: All tests pass
tsc --noEmit  # Expected: No type errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Plugin installs successfully via `opencode plugin install`
- [ ] Marketplace `anthropics/claude-plugins-official` loads correctly
- [ ] Plugin manifest translation produces valid `opencode.plugin.json`
