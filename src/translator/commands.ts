import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir, readdir, copyFile, rm } from 'fs/promises';
import { resolveScope, defaultScope, assertValidPluginId, type InstallScope } from './scope.js';

export interface TranslateCommandsOptions {
  scope?: InstallScope;
}

/**
 * Copy `<installPath>/commands/**\/*.md` → `<commandsDir>/<pluginId>/<rel>`.
 * Only `.md` files. Symlinks + hidden dirs skipped. Wipes target subdir
 * before each run → idempotent.
 */
export async function translateCommands(
  installPath: string,
  pluginId: string,
  opts?: TranslateCommandsOptions,
): Promise<string[]> {
  assertValidPluginId(pluginId);

  const sourceDir = join(installPath, 'commands');
  if (!existsSync(sourceDir)) return [];

  const paths = resolveScope(opts?.scope ?? defaultScope());
  const targetDir = join(paths.commandsDir, pluginId);

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  const written: string[] = [];
  await copyMarkdownTree(sourceDir, targetDir, written);
  return written;
}

async function copyMarkdownTree(src: string, dst: string, written: string[]): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const sp = join(src, e.name);
    const dp = join(dst, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('.')) continue;
      await mkdir(dp, { recursive: true });
      await copyMarkdownTree(sp, dp, written);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      await copyFile(sp, dp);
      written.push(dp);
    }
  }
}
