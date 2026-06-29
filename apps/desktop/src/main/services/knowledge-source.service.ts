import { existsSync } from 'node:fs'
import { toErrorMessage } from '@toolman/shared'
import { fetchSitemapUrls } from '@toolman/knowledge'
import {KnowledgeSourceAddFolderInputSchema,
  KnowledgeSourceAddNotionExportInputSchema,
  KnowledgeSourceAddSitemapInputSchema,
  KnowledgeSourceAddUrlInputSchema,
  KnowledgeSourceListInputSchema,
  KnowledgeSourceRemoveInputSchema,
  KnowledgeSourceSchema,
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  type KnowledgeSource } from '@toolman/shared'
import { scanDirectory } from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { ingestFilePaths, ingestUrlDocument } from './knowledge-ingest.service'
import { resolveKnowledgeBaseStoragePath } from './knowledge-kb-storage-path.service'
import { assertKnowledgeBaseAcceptsUrls } from './knowledge-kb-kind-guard'
import { ensureKnowledgeBaseStorageSource } from './knowledge-kb-storage-source.service'
import { copyScannedFilesToStorage } from './knowledge-storage-copy.service'
import { resolveKnowledgeWatchConfig } from './knowledge-watch-config.service'
import {
  getKnowledgeWatchStatus,
  restartKnowledgeWatchersForKb,
  stopKnowledgeWatchForFolder,
} from './knowledge-watcher.service'

const NOTION_EXPORT_INCLUDE = ['**/*.{md,html,htm}']

function parseWatchConfig(json: string) {
  return resolveKnowledgeWatchConfig(json)
}

function toSource(row: {
  id: string
  kbId: string
  type: string
  uri: string
  createdAt: Date
  updatedAt: Date
}): KnowledgeSource {
  return KnowledgeSourceSchema.parse({
    id: row.id,
    kbId: row.kbId,
    type: row.type,
    uri: row.uri,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}


export function listKnowledgeSources(input: unknown): KnowledgeSource[] {
  const data = KnowledgeSourceListInputSchema.parse(input)
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) return []

  return getDocumentRepository()
    .listSourcesByKb(data.kbId)
    .map(toSource)
}

async function importFolderIntoKnowledgeBase(options: {
  workspaceId: string
  kbId: string
  folderPath: string
  include: string[]
  exclude: string[]
}) {
  const kbRepo = getKnowledgeBaseRepository()
  const kb = kbRepo.findRowById(options.kbId, options.workspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }

  const folderPath = options.folderPath.trim()
  if (!existsSync(folderPath)) {
    throw new Error('文件夹不存在')
  }

  const storagePath = resolveKnowledgeBaseStoragePath(kb, { ensure: true })
  if (!storagePath) {
    throw new Error('知识库存储路径未设置')
  }

  const files = scanDirectory({
    rootPath: folderPath,
    include: options.include,
    exclude: options.exclude,
  })

  const copiedPaths = copyScannedFilesToStorage(storagePath, folderPath, files)
  const source = ensureKnowledgeBaseStorageSource(
    options.workspaceId,
    options.kbId,
    storagePath,
  )
  restartKnowledgeWatchersForKb(options.workspaceId, options.kbId)

  const initialScan = await ingestFilePaths({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    filePaths: copiedPaths,
    sourceId: source.id,
  })

  return {
    source: toSource(source),
    initialScan,
  }
}

export async function addKnowledgeWatchFolder(input: unknown) {
  const data = KnowledgeSourceAddFolderInputSchema.parse(input)
  const kb = getKnowledgeBaseRepository().findRowById(data.kbId, data.workspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }

  const watchConfig = parseWatchConfig(kb.watchConfigJson)
  return importFolderIntoKnowledgeBase({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    folderPath: data.folderPath,
    include: watchConfig.include,
    exclude: watchConfig.exclude,
  })
}

export async function addKnowledgeNotionExportFolder(input: unknown) {
  const data = KnowledgeSourceAddNotionExportInputSchema.parse(input)
  return importFolderIntoKnowledgeBase({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    folderPath: data.folderPath,
    include: NOTION_EXPORT_INCLUDE,
    exclude: DEFAULT_KNOWLEDGE_WATCH_CONFIG.exclude,
  })
}

export async function addKnowledgeUrl(input: unknown) {
  const data = KnowledgeSourceAddUrlInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const kb = kbRepo.findRowById(data.kbId, data.workspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }
  assertKnowledgeBaseAcceptsUrls(kb)

  const url = data.url.trim()
  const docRepo = getDocumentRepository()
  let source = docRepo.findSourceByUri(data.kbId, url)
  if (!source) {
    source = docRepo.createSource({
      kbId: data.kbId,
      type: 'url',
      uri: url,
    })
  }

  kbRepo.update({
    id: data.kbId,
    workspaceId: data.workspaceId,
    status: 'indexing',
  })

  const result = await ingestUrlDocument({
    workspaceId: data.workspaceId,
    kbId: data.kbId,
    url,
    sourceId: source.id,
  })

  kbRepo.update({
    id: data.kbId,
    workspaceId: data.workspaceId,
    status: result.outcome === 'failed' ? 'error' : 'idle',
  })

  return {
    source: toSource(source),
    documentId: result.documentId ?? source.id,
    outcome: result.outcome,
    message: result.message,
  }
}

export async function addKnowledgeSitemap(input: unknown) {
  const data = KnowledgeSourceAddSitemapInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const kb = kbRepo.findRowById(data.kbId, data.workspaceId)
  if (!kb) {
    throw new Error('知识库不存在')
  }

  const sitemapUrl = data.sitemapUrl.trim()
  const urls = await fetchSitemapUrls(sitemapUrl)
  const docRepo = getDocumentRepository()

  let source = docRepo.findSourceByUri(data.kbId, sitemapUrl)
  if (!source) {
    source = docRepo.createSource({
      kbId: data.kbId,
      type: 'url',
      uri: sitemapUrl,
    })
  }

  kbRepo.update({
    id: data.kbId,
    workspaceId: data.workspaceId,
    status: 'indexing',
  })

  let ingested = 0
  let skipped = 0
  const failed: Array<{ path: string; message: string }> = []

  for (const url of urls) {
    try {
      const result = await ingestUrlDocument({
        workspaceId: data.workspaceId,
        kbId: data.kbId,
        url,
        sourceId: source.id,
      })
      if (result.outcome === 'ingested') ingested += 1
      else if (result.outcome === 'skipped') skipped += 1
      else failed.push({ path: url, message: result.message ?? '导入失败' })
    } catch (error) {
      failed.push({
        path: url,
        message: toErrorMessage(error, '导入失败'),
      })
    }
  }

  kbRepo.update({
    id: data.kbId,
    workspaceId: data.workspaceId,
    status: failed.length > 0 && ingested === 0 ? 'error' : 'idle',
  })

  return {
    source: toSource(source),
    urlsFound: urls.length,
    ingested,
    skipped,
    failed,
  }
}

export function removeKnowledgeSource(input: unknown): boolean {
  const data = KnowledgeSourceRemoveInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const kb = kbRepo.findRowById(data.kbId, data.workspaceId)
  if (!kb) return false

  const docRepo = getDocumentRepository()
  const source = docRepo.getSourceById(data.sourceId, data.kbId)
  if (!source) return false

  const storagePath = resolveKnowledgeBaseStoragePath(kb, { ensure: false })
  if (storagePath && source.uri === storagePath) {
    throw new Error('无法移除知识库目录监听')
  }

  if (source.type === 'folder' || source.type === 'notion_export') {
    stopKnowledgeWatchForFolder(data.workspaceId, data.kbId, source.uri)

    const currentWatch = parseWatchConfig(kb.watchConfigJson)
    const paths = currentWatch.paths.filter((path) => path !== source.uri)
    kbRepo.update({
      id: data.kbId,
      workspaceId: data.workspaceId,
      watchConfigJson: JSON.stringify({ ...currentWatch, paths }),
    })
  }

  docRepo.softDeleteSource(source.id, data.kbId)
  return true
}

export function getKnowledgeWatchStatusForKb(workspaceId: string, kbId: string) {
  return getKnowledgeWatchStatus().filter(
    (item) => item.workspaceId === workspaceId && item.kbId === kbId,
  )
}
