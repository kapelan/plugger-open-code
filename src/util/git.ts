/**
 * Clone `<url>` at `<ref>` into `<target>`. Centralized so installer and
 * marketplace manager share one implementation of the SHA-vs-branch nuance:
 *
 *   - SHA-shaped refs need a full clone followed by `git checkout <sha>`,
 *     because `git clone --branch <sha>` only accepts branch or tag names,
 *     not commit hashes.
 *   - Everything else uses a shallow single-branch clone (cheap).
 *   - `'HEAD'` is the sentinel for "remote default" but git itself doesn't
 *     accept it as a branch name, so we coerce it to `main` — works for
 *     ~all current CC marketplaces.
 *
 * Caller is responsible for ensuring `target` doesn't already exist. We
 * shell out via `execa` so callers don't have to import it themselves.
 */
const SHA_REGEX = /^[0-9a-f]{7,40}$/i;

export async function gitClone(url: string, ref: string, target: string): Promise<void> {
  const { execa } = await import('execa');
  if (SHA_REGEX.test(ref)) {
    await execa('git', ['clone', '--', url, target]);
    await execa('git', ['checkout', ref], { cwd: target });
    return;
  }
  const branch = ref === 'HEAD' ? 'main' : ref;
  await execa('git', ['clone', '--depth', '1', '--single-branch', '--branch', branch, '--', url, target]);
}
