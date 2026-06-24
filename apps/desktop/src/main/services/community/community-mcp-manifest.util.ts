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
