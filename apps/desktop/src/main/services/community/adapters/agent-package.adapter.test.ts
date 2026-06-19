import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  findCommunityAgentPackagePath,
  hasCommunityAgentPackage,
  importCommunityAgentPackage,
} from './agent-package.adapter'

const importAgentPackageToWorkspace = vi.fn()
const resolveAgentImportWorkspaceId = vi.fn()

vi.mock('../../p2p/agent-share.service', () => ({
  importAgentPackageToWorkspace: (...args: unknown[]) => importAgentPackageToWorkspace(...args),
  resolveAgentImportWorkspaceId: () => resolveAgentImportWorkspaceId(),
}))

const tempDirs: string[] = []

function createPackageWithAgentBundle(): string {
  const dir = join('/tmp', `toolman-agent-bundle-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(dir, 'bundles'), { recursive: true })
  writeFileSync(
    join(dir, 'bundles/agent-package.v1.json'),
    JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      assistant: {
        name: 'Community Agent',
        systemPrompt: 'You are helpful',
        modelId: 'openai/gpt-4o-mini',
        parameters: {},
        mcpServers: [],
        toolIds: [],
        knowledgeRefs: [],
      },
      workflow: null,
    }),
    'utf8',
  )
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  importAgentPackageToWorkspace.mockReset()
  resolveAgentImportWorkspaceId.mockReset()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('agent-package.adapter', () => {
  it('detects embedded agent package files', () => {
    const packagePath = createPackageWithAgentBundle()
    expect(hasCommunityAgentPackage(packagePath)).toBe(true)
    expect(findCommunityAgentPackagePath(packagePath)).toContain('agent-package.v1.json')
  })

  it('imports agent package through agent-share service', () => {
    const packagePath = createPackageWithAgentBundle()
    resolveAgentImportWorkspaceId.mockReturnValue('00000000-0000-0000-0000-000000000001')
    importAgentPackageToWorkspace.mockReturnValue({
      assistantId: '00000000-0000-0000-0000-000000000099',
    })

    const result = importCommunityAgentPackage(packagePath)
    expect(result).toEqual({
      assistantId: '00000000-0000-0000-0000-000000000099',
      workspaceId: '00000000-0000-0000-0000-000000000001',
    })
    expect(importAgentPackageToWorkspace).toHaveBeenCalled()
  })
})
