import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { toErrorMessage } from '@toolman/shared'
import { basename, join, resolve, sep } from 'node:path'
import { scanDirectory } from '@toolman/knowledge'
import {DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  KnowledgeFolderDeleteFileInputSchema,
  KnowledgeFolderDeleteFileOutputSchema,
  KnowledgeFolderImportFilesInputSchema,
  KnowledgeFolderImportFilesOutputSchema,
  KnowledgeFolderListFilesInputSchema,
  KnowledgeFolderListFilesOutputSchema } from '@toolman/shared'
import { resolveKnowledgeWatchConfig } from './knowledge-watch-config.service'

function ensureFolder(folderPath: string) {
  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true })
  }
}

function isPathInsideFolder(folderPath: string, filePath: string): boolean {
  const root = resolve(folderPath)
  const target = resolve(filePath)
  return target === root || target.startsWith(`${root}${sep}`)
}

export function listKnowledgeFolderFiles(input: unknown) {
  const data = KnowledgeFolderListFilesInputSchema.parse(input)
  const folderPath = data.folderPath.trim()

  if (!existsSync(folderPath)) {
    return KnowledgeFolderListFilesOutputSchema.parse({ items: [] })
  }

  const watchConfig = resolveKnowledgeWatchConfig(
    JSON.stringify(DEFAULT_KNOWLEDGE_WATCH_CONFIG),
  )

  const files = scanDirectory({
    rootPath: folderPath,
    include: watchConfig.include,
    exclude: watchConfig.exclude,
  })

  const items = files.map((filePath) => {
    const stat = statSync(filePath)
    return {
      path: filePath,
      name: basename(filePath),
      sizeBytes: stat.size,
      updatedAt: Math.floor(stat.mtimeMs),
    }
  })

  return KnowledgeFolderListFilesOutputSchema.parse({ items })
}

export function importKnowledgeFolderFiles(input: unknown) {
  const data = KnowledgeFolderImportFilesInputSchema.parse(input)
  const folderPath = data.folderPath.trim()
  ensureFolder(folderPath)

  let imported = 0
  let skipped = 0
  const failed: Array<{ path: string; message: string }> = []

  for (const sourcePath of data.filePaths) {
    try {
      if (!existsSync(sourcePath)) {
        failed.push({ path: sourcePath, message: '文件不存在' })
        continue
      }

      const destinationPath = join(folderPath, basename(sourcePath))
      if (existsSync(destinationPath)) {
        skipped += 1
        continue
      }

      copyFileSync(sourcePath, destinationPath)
      imported += 1
    } catch (error) {
      const message = toErrorMessage(error, '复制失败')
      failed.push({ path: sourcePath, message })
    }
  }

  return KnowledgeFolderImportFilesOutputSchema.parse({ imported, skipped, failed })
}

export function deleteKnowledgeFolderFile(input: unknown) {
  const data = KnowledgeFolderDeleteFileInputSchema.parse(input)
  const folderPath = data.folderPath.trim()
  const filePath = data.filePath.trim()

  if (!isPathInsideFolder(folderPath, filePath)) {
    throw new Error('只能删除默认文件夹内的文件')
  }

  if (!existsSync(filePath)) {
    return KnowledgeFolderDeleteFileOutputSchema.parse({ deleted: false })
  }

  unlinkSync(filePath)
  return KnowledgeFolderDeleteFileOutputSchema.parse({ deleted: true })
}
