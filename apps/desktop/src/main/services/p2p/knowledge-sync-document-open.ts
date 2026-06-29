import { copyFileSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { P2pWorkspaceRepository } from '@toolman/db'
import {
  P2pKnowledgeEnsureDocumentSavedInputSchema,
  P2pKnowledgeMaterializeDocumentInputSchema,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository } from '../../db/repos'
import { resolvePersonalStorageWorkspaceId } from './p2p-group-resource-naming'
import { getActiveWorkspaceMember } from './p2p-permission.guard'
import { getDefaultWorkspace } from '../workspace.service'
import { ingestFileAtPath, refreshKbStats } from '../knowledge-ingest.service'
import {
  ensureSharedKnowledgeBlobCachedWithRetry,
  ensureUserSavedGroupKnowledgeBase,
  resolveSharedKnowledgeDocumentContent,
  sanitizeKnowledgeDocumentFileName,
} from './knowledge-sync-document-helpers'

export async function materializeP2pKnowledgeDocumentForOpen(rawInput: unknown): Promise<{
  absolutePath: string
}> {
  const input = P2pKnowledgeMaterializeDocumentInputSchema.parse(rawInput)
  const content = await resolveSharedKnowledgeDocumentContent(input)
  const storageWorkspaceId =
    resolvePersonalStorageWorkspaceId() ?? getDefaultWorkspace()?.id
  if (!storageWorkspaceId) {
    throw new Error('工作区未就绪')
  }

  const cachedPath = await ensureSharedKnowledgeBlobCachedWithRetry({
    workspaceId: input.workspaceId,
    storageWorkspaceId,
    sourceKbId: content.sourceKbId,
    documentId: input.documentId,
    title: content.title,
    contentHash: content.contentHash,
    mimeType: content.mimeType,
    sharedBy: content.sharedBy,
  })
  if (!cachedPath) {
    throw new Error('文档内容尚未同步到群组，请稍后重试')
  }

  return { absolutePath: cachedPath }
}

export async function ensureP2pKnowledgeDocumentSaved(rawInput: unknown): Promise<{
  absolutePath: string
  savedDocumentId: string
}> {
  const input = P2pKnowledgeEnsureDocumentSavedInputSchema.parse(rawInput)
  const content = await resolveSharedKnowledgeDocumentContent(input)
  const storageWorkspaceId =
    resolvePersonalStorageWorkspaceId() ?? getDefaultWorkspace()?.id
  if (!storageWorkspaceId) {
    throw new Error('工作区未就绪')
  }

  const cachedPath = await ensureSharedKnowledgeBlobCachedWithRetry({
    workspaceId: input.workspaceId,
    storageWorkspaceId,
    sourceKbId: content.sourceKbId,
    documentId: input.documentId,
    title: content.title,
    contentHash: content.contentHash,
    mimeType: content.mimeType,
    sharedBy: content.sharedBy,
  })
  if (!cachedPath) {
    throw new Error('文档内容尚未从群主同步，请确认 P2P 已连接后重试')
  }

  const p2pWorkspace = new P2pWorkspaceRepository(getDatabase()).findById(input.workspaceId)
  if (!p2pWorkspace) {
    throw new Error('群组不存在')
  }

  const member = getActiveWorkspaceMember(input.workspaceId)
  if (content.sharedBy === member.id) {
    throw new Error('自己的共享文件请保存在本地知识库，不会写入共享知识库')
  }

  const { kbId, storagePath } = ensureUserSavedGroupKnowledgeBase(
    storageWorkspaceId,
    input.workspaceId,
    p2pWorkspace.name,
    content.sharedFolderName,
  )

  const fileExt = extname(cachedPath) || extname(content.title)
  const titledName = sanitizeKnowledgeDocumentFileName(
    content.title.replace(/\.[^./\\]+$/i, '') || content.title,
  )
  const fileName =
    fileExt && !titledName.toLowerCase().endsWith(fileExt.toLowerCase())
      ? `${titledName}${fileExt}`
      : titledName
  const destinationPath = join(storagePath, fileName)

  if (!existsSync(destinationPath)) {
    copyFileSync(cachedPath, destinationPath)
  }

  const result = await ingestFileAtPath({
    workspaceId: storageWorkspaceId,
    kbId,
    filePath: destinationPath,
    skipP2pSync: true,
  })
  if (result.outcome === 'failed') {
    throw new Error(result.message ?? '保存文档失败')
  }

  refreshKbStats(storageWorkspaceId, kbId)

  const savedDoc = getDocumentRepository().findByPath(kbId, destinationPath)
  if (!savedDoc) {
    throw new Error('保存文档失败')
  }

  return { absolutePath: destinationPath, savedDocumentId: savedDoc.id }
}
