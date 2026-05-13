import { homedir } from 'os';
import { join } from 'path';

/**
 * Where a plugin lives — and, consequently, which set of OpenCode config
 * directories its translated artifacts target.
 *
 *   - `global`:  ~/.opencode/plugins/  +  ~/.config/opencode/...
 *   - `project`: <projectDir>/.plugger/plugins/  +  <projectDir>/.opencode/...
 *                +  <projectDir>/opencode.json
 *
 * Same plugin can live in both scopes — each has its own clone + artifacts.
 */
/**
 * Plugin identity format: `<name>@<marketplace>`. Each segment matches the
 * standard identifier shape used in marketplace.ts (alphanumeric start, then
 * `[\w.-]`, no `--` anywhere). The `--` ban matters because it's our
 * separator inside MCP keys and shim filenames — see comment in marketplace.ts.
 */
export const PLUGIN_ID_REGEX = /^(?!.*--)[a-zA-Z0-9][\w.-]*@[a-zA-Z0-9][\w.-]*$/;

export function assertValidPluginId(pluginId: string): void {
  if (!PLUGIN_ID_REGEX.test(pluginId)) {
    throw new Error(`Invalid pluginId: "${pluginId}"`);
  }
}

/**
 * Build the canonical `<name>@<marketplace>` id. Caller is expected to have
 * already validated `name` and `marketplace` separately (via IDENTIFIER_REGEX
 * or upstream schema); this just concatenates so the format lives in one
 * place. The result is regex-validated as a final guard.
 */
export function makePluginId(name: string, marketplace: string): string {
  const id = `${name}@${marketplace}`;
  assertValidPluginId(id);
  return id;
}

export type InstallScope =
  | { kind: 'global' }
  | { kind: 'project'; projectDir: string };

export interface ScopePaths {
  installRoot: string;
  commandsDir: string;
  skillsDir: string;
  hookShimsDir: string;
  opencodeConfigPath: string;
}

export function resolveScope(scope: InstallScope): ScopePaths {
  if (scope.kind === 'global') {
    const config = join(homedir(), '.config', 'opencode');
    return {
      installRoot: join(homedir(), '.opencode', 'plugins'),
      commandsDir: join(config, 'commands'),
      skillsDir: join(config, 'skills'),
      hookShimsDir: join(config, 'hook-shims'),
      opencodeConfigPath: join(config, 'opencode.json'),
    };
  }
  const oc = join(scope.projectDir, '.opencode');
  return {
    installRoot: join(scope.projectDir, '.plugger', 'plugins'),
    commandsDir: join(oc, 'commands'),
    skillsDir: join(oc, 'skills'),
    hookShimsDir: join(oc, 'hook-shims'),
    opencodeConfigPath: join(scope.projectDir, 'opencode.json'),
  };
}

export function defaultScope(): InstallScope {
  return { kind: 'global' };
}
