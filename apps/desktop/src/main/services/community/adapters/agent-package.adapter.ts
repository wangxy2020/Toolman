import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { AgentPackageSchema } from '@toolman/shared'

import {
  importAgentPackageToWorkspace,
  resolveAgentImportWorkspaceId,
} from '../../p2p/agent-share.service'
import { COMMUNITY_AGENT_PACKAGE_RELATIVE_PATHS } from '../community-bundle-paths'

export interface CommunityAgentPackageImportResult {
  assistantId: string
  workspaceId: string
}

export function findCommunityAgentPackagePath(packagePath: string): string | null {
  for (const relativePath of COMMUNITY_AGENT_PACKAGE_RELATIVE_PATHS) {
    const absolutePath = join(packagePath, relativePath)
    if (existsSync(absolutePath)) {
      return absolutePath
    }
  }
  return null
}

export function hasCommunityAgentPackage(packagePath: string): boolean {
  return findCommunityAgentPackagePath(packagePath) !== null
}

export function importCommunityAgentPackage(packagePath: string): CommunityAgentPackageImportResult {
  const workspaceId = resolveAgentImportWorkspaceId()
  if (!workspaceId) {
    throw new Error('工作区未就绪，无法导入智能体包')
  }

  const packageFilePath = findCommunityAgentPackagePath(packagePath)
  if (!packageFilePath) {
    throw new Error('Community package does not include an agent package')
  }

  const packageJson = readFileSync(packageFilePath, 'utf8')
  AgentPackageSchema.parse(JSON.parse(packageJson))

  const { assistantId } = importAgentPackageToWorkspace(workspaceId, packageJson)
  return { assistantId, workspaceId }
}
