import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import { createKnowledgeBase } from '../../knowledge.service'
import { ingestFilePaths } from '../../knowledge-ingest.service'
import { resolveAgentImportWorkspaceId } from '../../p2p/agent-share.service'
import { COMMUNITY_KNOWLEDGE_BUNDLE_MANIFEST_RELATIVE_PATHS } from '../community-bundle-paths'

export const KnowledgeBundleManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  files: z.array(z.string().min(1)).min(1),
})

export type KnowledgeBundleManifest = z.infer<typeof KnowledgeBundleManifestSchema>

export interface CommunityKnowledgeBundleImportResult {
  kbId: string
  workspaceId: string
  ingested: number
  skipped: number
  failed: Array<{ path: string; message: string }>
}

export function findCommunityKnowledgeBundleManifestPath(packagePath: string): string | null {
  for (const relativePath of COMMUNITY_KNOWLEDGE_BUNDLE_MANIFEST_RELATIVE_PATHS) {
    const absolutePath = join(packagePath, relativePath)
    if (existsSync(absolutePath)) {
      return absolutePath
    }
  }
  return null
}

export function hasCommunityKnowledgeBundle(packagePath: string): boolean {
  return findCommunityKnowledgeBundleManifestPath(packagePath) !== null
}

function readKnowledgeBundleManifest(packagePath: string): KnowledgeBundleManifest {
  const manifestPath = findCommunityKnowledgeBundleManifestPath(packagePath)
  if (!manifestPath) {
    throw new Error('Community package does not include a knowledge bundle manifest')
  }

  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
  return KnowledgeBundleManifestSchema.parse(raw)
}

export async function importCommunityKnowledgeBundle(
  packagePath: string,
): Promise<CommunityKnowledgeBundleImportResult> {
  const workspaceId = resolveAgentImportWorkspaceId()
  if (!workspaceId) {
    throw new Error('工作区未就绪，无法导入知识库合集')
  }

  const manifest = readKnowledgeBundleManifest(packagePath)
  const filePaths: string[] = []

  for (const relativePath of manifest.files) {
    const absolutePath = join(packagePath, relativePath)
    if (!existsSync(absolutePath)) {
      throw new Error(`Knowledge bundle is missing file: ${relativePath}`)
    }
    filePaths.push(absolutePath)
  }

  const kb = createKnowledgeBase({
    workspaceId,
    name: manifest.name,
    description: manifest.description,
    kind: 'local',
  })

  const ingestResult = await ingestFilePaths({
    workspaceId,
    kbId: kb.id,
    filePaths,
  })

  if (ingestResult.ingested === 0 && ingestResult.failed.length > 0) {
    throw new Error(ingestResult.failed[0]?.message ?? '知识库文档导入失败')
  }

  return {
    kbId: kb.id,
    workspaceId,
    ingested: ingestResult.ingested,
    skipped: ingestResult.skipped,
    failed: ingestResult.failed,
  }
}
