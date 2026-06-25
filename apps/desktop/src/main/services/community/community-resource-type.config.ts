import { basename } from 'node:path'

export const COMMUNITY_PACKAGE_EXTENSIONS: Record<string, string> = {
  mcp: '.toolman-mcp',
  skill: '.toolman-skill',
  workflow: '.toolman-workflow',
  knowledge: '.zip',
  task: '.zip',
}

const PUBLISH_SEGMENTS: Record<string, string> = {
  mcp: 'mcp',
  skill: 'skills',
  workflow: 'workflows',
  knowledge: 'knowledge',
}

export function marketplacePublishSegment(resourceType: string): string {
  const segment = PUBLISH_SEGMENTS[resourceType]
  if (!segment) {
    throw new Error(`Publishing is not supported for resource type: ${resourceType}`)
  }
  return segment
}

export function resolveCommunityPackageFilename(resourceType: string, packagePath: string): string {
  const base = basename(packagePath)
  const expected = COMMUNITY_PACKAGE_EXTENSIONS[resourceType] ?? '.zip'
  if (base.toLowerCase().endsWith(expected)) {
    return base
  }
  const stem = base.replace(/\.[^.]+$/, '') || 'package'
  return `${stem}${expected}`
}
