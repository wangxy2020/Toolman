import { IpcChannel, type KnowledgeBase } from '@toolman/shared'
import { setupKnowledgeBaseAfterCreate } from '../knowledge/knowledge-base-setup'
import { resolveKbPath } from '../knowledge/knowledge-create-utils'
import { countKnowledgeFilesByType } from '../knowledge/knowledge-file-types'
import { getPathBasename } from '../knowledge/knowledge-path-utils'

function buildFilesSourcePick(filePaths: string[]) {
  const first = filePaths[0] ?? ''
  const parentPath = first.replace(/[/\\][^/\\]+$/, '') || first
  return {
    mode: 'files' as const,
    filePaths,
    parentPath,
    totalFiles: filePaths.length,
    fileCounts: countKnowledgeFilesByType(filePaths),
  }
}

/**
 * Create a local knowledge-base folder under 本地知识库 and upload/ingest files into it.
 */
export async function createLocalTextbookKnowledgeBase(options: {
  workspaceId: string
  name: string
  defaultLocalFolderPath: string | null
  filePaths: string[]
}): Promise<{ kb: KnowledgeBase; warning: string | null }> {
  const name = options.name.trim()
  if (!name) {
    throw new Error('课程名称不能为空')
  }
  if (options.filePaths.length === 0) {
    throw new Error('请先选择要上传的教材文件')
  }
  if (!options.defaultLocalFolderPath?.trim()) {
    throw new Error('本地知识库路径未配置，请先在知识库中设置本地知识库目录')
  }

  const kbPath = resolveKbPath(name, options.defaultLocalFolderPath)
  if (!kbPath) {
    throw new Error('无法解析知识库存储路径')
  }

  const createResult = await window.api.invoke(IpcChannel.KnowledgeBaseCreate, {
    workspaceId: options.workspaceId,
    name,
    description: `助手库课程教材（${getPathBasename(name)}）`,
    kind: 'local',
  })
  if (!createResult.ok) {
    throw new Error(createResult.error.message || '创建教材知识库失败')
  }
  const kb = createResult.data as KnowledgeBase

  const warning = await setupKnowledgeBaseAfterCreate(options.workspaceId, kb, {
    kbPath,
    sourcePick: buildFilesSourcePick(options.filePaths),
  })

  return { kb, warning }
}
