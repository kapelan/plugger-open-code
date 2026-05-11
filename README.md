# plugger-open-code

`@plugger-open-code/claude-marketplace` — an OpenCode plugin that bridges the Claude Code marketplace ecosystem. Add Claude Code marketplaces (git repos containing `.claude-plugin/marketplace.json`) and install plugins listed in them (`.claude-plugin/plugin.json`) into OpenCode.

## Commands (planned slash commands)

- `/marketplace-add <owner/repo | git-url>` — register a marketplace
- `/marketplace-list` — list registered marketplaces
- `/marketplace-remove <name>` — remove a marketplace and its cache
- `/plugin-marketplace-search <query>` — search across all registered marketplaces
- `/plugin-marketplace-list [marketplace]` — list plugins (one marketplace or all)
- `/plugin-marketplace-install <plugin>[@marketplace]` — clone a plugin into `~/.opencode/plugins/`

## Status

The library (schemas, marketplace manager, installer, loader, command handlers) is implemented and tested. The OpenCode runtime wiring — the `src/index.ts` plugin entry point, slash-command registration, and translation of Claude Code hooks/MCP/skills into OpenCode activations — is not done yet. Installing a plugin today clones the repo and validates the manifest; it does not yet activate the plugin inside OpenCode.

## Develop

```bash
npm install
npm run build        # tsc → dist/
npm test             # bun test
npm run typecheck    # tsc --noEmit
```

State on disk lives under `~/.opencode/marketplaces/` and `~/.opencode/plugins/`. Tests touch the real `$HOME` — be aware before running against a populated install.
