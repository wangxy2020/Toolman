import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  hasCommunityKnowledgeBundle,
  importCommunityKnowledgeBundle,
} from './knowledge-bundle.adapter'

const createKnowledgeBase = vi.fn()
const ingestFilePaths = vi.fn()
const resolveAgentImportWorkspaceId = vi.fn()

vi.mock('../../knowledge.service', () => ({
  createKnowledgeBase: (...args: unknown[]) => createKnowledgeBase(...args),
}))

vi.mock('../../knowledge-ingest.service', () => ({
  ingestFilePaths: (...args: unknown[]) => ingestFilePaths(...args),
}))

vi.mock('../../p2p/agent-share.service', () => ({
  resolveAgentImportWorkspaceId: () => resolveAgentImportWorkspaceId(),
}))

const tempDirs: string[] = []

function createPackageWithKnowledgeBundle(): string {
  const dir = join('/tmp', `toolman-knowledge-bundle-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(dir, 'bundles', 'knowledge'), { recursive: true })
  writeFileSync(join(dir, 'bundles/knowledge/guide.md'), '# Guide\n', 'utf8')
  writeFileSync(
    join(dir, 'bundles/knowledge-bundle.manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      name: 'Community Docs',
      description: 'Imported bundle',
      files: ['bundles/knowledge/guide.md'],
    }),
    'utf8',
  )
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  createKnowledgeBase.mockReset()
  ingestFilePaths.mockReset()
  resolveAgentImportWorkspaceId.mockReset()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('knowledge-bundle.adapter', () => {
  it('detects embedded knowledge bundle manifests', () => {
    const packagePath = createPackageWithKnowledgeBundle()
    expect(hasCommunityKnowledgeBundle(packagePath)).toBe(true)
  })

  it('creates a knowledge base and ingests bundle files', async () => {
    const packagePath = createPackageWithKnowledgeBundle()
    resolveAgentImportWorkspaceId.mockReturnValue('00000000-0000-0000-0000-000000000001')
    createKnowledgeBase.mockReturnValue({
      id: '00000000-0000-0000-0000-000000000050',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      name: 'Community Docs',
    })
    ingestFilePaths.mockResolvedValue({
      ingested: 1,
      skipped: 0,
      failed: [],
    })

    const result = await importCommunityKnowledgeBundle(packagePath)
    expect(createKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: '00000000-0000-0000-0000-000000000001',
        name: 'Community Docs',
      }),
    )
    expect(ingestFilePaths).toHaveBeenCalledWith(
      expect.objectContaining({
        kbId: '00000000-0000-0000-0000-000000000050',
        filePaths: [join(packagePath, 'bundles/knowledge/guide.md')],
      }),
    )
    expect(result.kbId).toBe('00000000-0000-0000-0000-000000000050')
    expect(result.ingested).toBe(1)
  })
})
