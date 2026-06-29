import { IpcChannel } from '@toolman/shared'

import { ensureDefaultFolderKb, importFilesToKnowledgeStorage } from './knowledge-import-files'
import type { KnowledgeSidebarSection } from './knowledge-sidebar-types'

type IngestResult = {
  failed: Array<{ message: string }>
  skipped: number
  queued?: number
}

export function formatImportResultError(result: IngestResult): string | null {
  if (result.failed.length > 0) {
    const detail = result.failed
      .map((item) => item.message)
      .slice(0, 2)
      .join('；')
    return `导入失败 ${result.failed.length} 个${detail ? `：${detail}` : ''}`
  }
  if (result.skipped > 0 && (result.queued ?? 0) === 0 && result.failed.length === 0) {
    return `所选文件已存在，跳过 ${result.skipped} 个`
  }
  return null
}

type SitemapImportResult = {
  ingested: number
  skipped: number
  failed: Array<{ message: string }>
}

export function formatSitemapImportResultError(data: SitemapImportResult): string | null {
  if (data.failed.length === 0) return null
  const detail = data.failed
    .slice(0, 2)
    .map((item) => item.message)
    .join('；')
  return `Sitemap 导入完成：成功 ${data.ingested}，跳过 ${data.skipped}，失败 ${data.failed.length}${detail ? `（${detail}）` : ''}`
}

type ReindexResult = {
  ingested: number
  skipped: number
  failed: Array<{ message: string }>
}

export function formatReindexResultError(result: ReindexResult): string | null {
  if (result.failed.length === 0) return null
  const detail = result.failed
    .slice(0, 2)
    .map((item) => item.message)
    .join('；')
  return `重建完成：成功 ${result.ingested}，跳过 ${result.skipped}，失败 ${result.failed.length}${detail ? `（${detail}）` : ''}`
}

export interface ImportKnowledgeFilesParams {
  workspaceId: string | null
  section: KnowledgeSidebarSection
  paths: string[]
  importTargetKbId: string | null
  importTargetStoragePath: string | null
  showingDefaultLocalFilesFolder: boolean
  localFilesFolderPath: string | null
  localFilesDefaultFolderPath: string | null
  setError: (message: string | null) => void
  ingestFiles: (paths: string[]) => Promise<IngestResult | null>
  load: () => Promise<void>
  reloadLocalFilesDefaultKb: () => void
}

export async function importKnowledgeFiles({
  workspaceId,
  section,
  paths,
  importTargetKbId,
  importTargetStoragePath,
  showingDefaultLocalFilesFolder,
  localFilesFolderPath,
  localFilesDefaultFolderPath,
  setError,
  ingestFiles,
  load,
  reloadLocalFilesDefaultKb,
}: ImportKnowledgeFilesParams): Promise<IngestResult | null> {
  if (section === 'network') {
    setError('网络知识库仅支持添加网页 URL，不能导入本地文件')
    return null
  }

  let kbId = importTargetKbId
  let storagePath = importTargetStoragePath

  if (
    !kbId &&
    showingDefaultLocalFilesFolder &&
    workspaceId &&
    (localFilesFolderPath ?? localFilesDefaultFolderPath)
  ) {
    const ensured = await ensureDefaultFolderKb(workspaceId, 'local_files')
    if (ensured) {
      reloadLocalFilesDefaultKb()
      kbId = ensured.kb.id
      storagePath = ensured.folderPath
    }
  }

  if (!workspaceId || !kbId || !storagePath || paths.length === 0) {
    setError('知识库未就绪，请先在设置中配置存储目录')
    return null
  }

  const ingestPaths = await importFilesToKnowledgeStorage({
    workspaceId,
    storagePath,
    filePaths: paths,
    setError,
  })
  if (!ingestPaths) return null

  if (kbId !== importTargetKbId) {
    const ingestResponse = await window.api.invoke(IpcChannel.KnowledgeDocumentIngest, {
      workspaceId,
      kbId,
      filePaths: ingestPaths,
    })
    if (!ingestResponse.ok) {
      setError(ingestResponse.error.message)
      return null
    }
    reloadLocalFilesDefaultKb()
    return ingestResponse.data as IngestResult
  }

  const result = await ingestFiles(ingestPaths)
  await load()
  return result
}

export interface AddKnowledgeUrlParams {
  workspaceId: string | null
  kbId: string | null
  section: KnowledgeSidebarSection
  url: string
  setError: (message: string | null) => void
  load: () => Promise<void>
}

export async function addKnowledgeUrl({
  workspaceId,
  kbId,
  section,
  url,
  setError,
  load,
}: AddKnowledgeUrlParams): Promise<void> {
  if (section === 'local' || section === 'local-files') {
    throw new Error('本地知识库仅支持上传文件，网页请添加到网络知识库')
  }

  if (!workspaceId || !kbId) {
    throw new Error('知识库未就绪，请稍候再试')
  }

  setError(null)
  const result = await window.api.invoke(IpcChannel.KnowledgeSourceAddUrl, {
    workspaceId,
    kbId,
    url,
  })

  if (!result.ok) {
    throw new Error(result.error.message)
  }

  const data = result.data as { outcome: 'ingested' | 'skipped' | 'failed'; message?: string }
  if (data.outcome === 'failed') {
    throw new Error(data.message ?? '网页导入失败')
  }

  await load()
}

export interface AddKnowledgeSitemapParams {
  workspaceId: string | null
  kbId: string | null
  sitemapUrl: string
  setError: (message: string | null) => void
  load: () => Promise<void>
}

export async function addKnowledgeSitemap({
  workspaceId,
  kbId,
  sitemapUrl,
  setError,
  load,
}: AddKnowledgeSitemapParams): Promise<SitemapImportResult | null> {
  if (!workspaceId || !kbId) {
    throw new Error('知识库未就绪，请稍候再试')
  }

  setError(null)
  const result = await window.api.invoke(IpcChannel.KnowledgeSourceAddSitemap, {
    workspaceId,
    kbId,
    sitemapUrl,
  })

  if (!result.ok) {
    throw new Error(result.error.message)
  }

  const data = result.data as SitemapImportResult
  await load()
  return data
}

export interface DeleteKnowledgeDocumentsParams {
  ids: string[]
  remove: (id: string) => Promise<boolean>
}

export async function deleteKnowledgeDocuments({
  ids,
  remove,
}: DeleteKnowledgeDocumentsParams): Promise<number> {
  let failed = 0
  for (const id of ids) {
    const ok = await remove(id)
    if (!ok) failed += 1
  }
  return failed
}
