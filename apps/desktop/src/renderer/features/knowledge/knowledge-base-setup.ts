import { IpcChannel, type KnowledgeBase } from '@toolman/shared'
import type { KnowledgeCreateInput } from './KnowledgeCreateModal'
import { buildIngestPaths } from './knowledge-import-files'
import { isVectorizedKnowledgeBaseKind } from '@toolman/shared'

export async function setupKnowledgeBaseAfterCreate(
  workspaceId: string,
  kb: KnowledgeBase,
  input: Pick<KnowledgeCreateInput, 'kbPath' | 'sourcePick'>,
): Promise<string | null> {
  let warning: string | null = null
  const vectorized = isVectorizedKnowledgeBaseKind(kb.kind)

  if (input.kbPath) {
    const storageResult = await window.api.invoke(IpcChannel.KnowledgeBaseStorageEnsure, {
      path: input.kbPath,
    })
    if (!storageResult.ok) {
      warning = storageResult.error.message
    }
  }

  if (input.sourcePick.mode === 'folder-with-files') {
    const folderResult = await window.api.invoke(IpcChannel.KnowledgeSourceAddFolder, {
      workspaceId,
      kbId: kb.id,
      folderPath: input.sourcePick.folderPath,
    })
    if (!folderResult.ok) {
      warning = folderResult.error.message
    } else if (vectorized) {
      const data = folderResult.data as {
        initialScan?: { failed?: Array<{ message: string }> }
      }
      const failed = data.initialScan?.failed ?? []
      if (failed.length > 0) {
        warning = `文件已复制到知识库，但部分文件索引失败（${failed.length}）`
      }
    }
  }

  if (input.sourcePick.mode === 'files') {
    if (!input.kbPath) {
      return warning ?? '知识库存储路径未设置'
    }

    const importResult = await window.api.invoke(IpcChannel.KnowledgeFolderImportFiles, {
      folderPath: input.kbPath,
      filePaths: input.sourcePick.filePaths,
    })
    if (!importResult.ok) {
      return warning ? `${warning}；文件复制失败` : importResult.error.message
    }

    const ingestPaths = buildIngestPaths(input.kbPath, input.sourcePick.filePaths)
    const ingestResult = await window.api.invoke(IpcChannel.KnowledgeDocumentIngest, {
      workspaceId,
      kbId: kb.id,
      filePaths: ingestPaths,
    })
    if (!ingestResult.ok) {
      warning = warning ? `${warning}；文件导入失败` : ingestResult.error.message
    } else {
      const data = ingestResult.data as {
        ingested: number
        failed: Array<{ message: string }>
      }
      if (data.failed.length > 0) {
        const actionLabel = vectorized ? '索引' : '登记'
        const ingestWarning = `文件${actionLabel}：成功 ${data.ingested}，失败 ${data.failed.length}`
        warning = warning ? `${warning}；${ingestWarning}` : ingestWarning
      }
    }
  }

  if (input.sourcePick.mode === 'url') {
    const urlResult = await window.api.invoke(IpcChannel.KnowledgeSourceAddUrl, {
      workspaceId,
      kbId: kb.id,
      url: input.sourcePick.url,
    })
    if (!urlResult.ok) {
      warning = urlResult.error.message
    } else {
      const data = urlResult.data as {
        outcome: 'ingested' | 'skipped' | 'failed'
        message?: string
      }
      if (data.outcome === 'failed') {
        warning = data.message ?? '网页导入失败'
      } else if (data.outcome === 'skipped') {
        warning = data.message ?? '该网页已存在，已跳过'
      }
    }
  }

  return warning
}
