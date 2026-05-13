import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir, readdir, copyFile, rm } from 'fs/promises';
import { resolveScope, defaultScope, assertValidPluginId, type InstallScope } from './scope.js';

export interface TranslateSkillsOptions {
  scope?: InstallScope;
}

/**
 * Copy `<installPath>/skills/<name>/...` → `<skillsDir>/<pluginId>/<name>/...`.
 * Full tree (any regular file). Symlinks + hidden dirs skipped. Wipes target
 * subdir before each run → idempotent.
 */
export async function translateSkills(
  installPath: string,
  pluginId: string,
  opts?: TranslateSkillsOptions,
): Promise<string[]> {
  assertValidPluginId(pluginId);

  const sourceDir = join(installPath, 'skills');
  if (!existsSync(sourceDir)) return [];

  const paths = resolveScope(opts?.scope ?? defaultScope());
  const targetDir = join(paths.skillsDir, pluginId);

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  const written: string[] = [];
  await copyTree(sourceDir, targetDir, written);
  return written;
}

async function copyTree(src: string, dst: string, written: string[]): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const sp = join(src, e.name);
    const dp = join(dst, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('.')) continue;
      await mkdir(dp, { recursive: true });
      await copyTree(sp, dp, written);
    } else if (e.isFile()) {
      await copyFile(sp, dp);
      written.push(dp);
    }
  }
}
