/**
 * Records of artifacts written outside the plugin install directory during
 * translation. Persisted in `.opencode-plugin-meta.json` so uninstall can
 * remove exactly what install created — no scanning, no guessing.
 */
export interface InstalledArtifacts {
  /** Absolute paths of markdown files written under <commandsDir>/<id>/. */
  commands: string[];
  /** Absolute paths of files written under <skillsDir>/<id>/. */
  skills: string[];
  /** Keys added to <opencodeConfig> mcp map. */
  mcpServers: string[];
  /** Absolute paths of generated hook shim files. */
  hooks: string[];
}

export function emptyArtifacts(): InstalledArtifacts {
  return { commands: [], skills: [], mcpServers: [], hooks: [] };
}
