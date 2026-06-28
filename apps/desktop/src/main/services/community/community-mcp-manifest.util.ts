import { McpMarketManifestSchema } from './adapters/mcp-market.adapter'
import { COMMUNITY_CHECKSUMS_FILENAME, listRelativeFiles } from './community-package-import.util'

export function slugifyMcpId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'mcp'
}

export const MCP_MANIFEST_FILENAME = 'mcp.manifest.json'
export { COMMUNITY_CHECKSUMS_FILENAME } from './community-package-import.util'

export function listMcpPackageFiles(packageRoot: string): string[] {
  return listRelativeFiles(packageRoot).filter((file) => file !== COMMUNITY_CHECKSUMS_FILENAME)
}

export function syncMcpManifestFiles(
  packageRoot: string,
  manifest: Record<string, unknown>,
): Record<string, unknown> {
  const listed =
    packageRoot.trim().length > 0
      ? listMcpPackageFiles(packageRoot)
      : (Array.isArray(manifest.files)
          ? manifest.files.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          : [])
  const normalizedFiles = listed.length > 0 ? listed : [MCP_MANIFEST_FILENAME]
  const filesWithManifest = normalizedFiles.includes(MCP_MANIFEST_FILENAME)
    ? normalizedFiles
    : [MCP_MANIFEST_FILENAME, ...normalizedFiles].sort()

  return McpMarketManifestSchema.parse({
    ...manifest,
    schemaVersion: typeof manifest.schemaVersion === 'number' ? manifest.schemaVersion : 1,
    files: filesWithManifest,
  }) as Record<string, unknown>
}
