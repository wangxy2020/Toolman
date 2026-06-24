import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'

import { UuidSchema } from '@toolman/shared'

import { saveFile } from '../../ipc/dialog'
import { openPathInShell } from '../app-storage.service'
import { downloadModerationResourcePackage, getResource } from './community-ipc.facade'
import { extractZip } from './community-package-import.util'
import { getCommunityDataDir } from './community-paths'

const PACKAGE_ARCHIVE_NAMES = [
  'package.toolman-mcp',
  'package.toolman-skill',
  'package.toolman-workflow',
  'package.toolman-knowledge',
] as const

const ReviewResourceInputSchema = z.object({
  resourceId: UuidSchema,
})

function resolveAbsolutePackagePath(relativePath: string): string {
  return join(getCommunityDataDir(), relativePath)
}

function resolveReviewCacheDir(resourceId: string): string {
  return join(getCommunityDataDir(), 'review-cache', resourceId)
}

function tryResolveLocalPackagePaths(relativePackagePath: string): {
  downloadSourcePath: string
  extractedPath: string
} | null {
  const versionDir = dirname(relativePackagePath)
  let downloadSourcePath: string | null = null

  for (const archiveName of PACKAGE_ARCHIVE_NAMES) {
    const archivePath = resolveAbsolutePackagePath(join(versionDir, archiveName))
    if (existsSync(archivePath)) {
      downloadSourcePath = archivePath
      break
    }
  }

  const extractedPath = resolveAbsolutePackagePath(relativePackagePath)
  if (existsSync(extractedPath)) {
    return {
      downloadSourcePath: downloadSourcePath ?? extractedPath,
      extractedPath,
    }
  }

  if (downloadSourcePath) {
    return { downloadSourcePath, extractedPath: downloadSourcePath }
  }

  return null
}

async function ensureReviewPackagePaths(
  resourceId: string,
  relativePackagePath: string,
): Promise<{ downloadSourcePath: string; extractedPath: string }> {
  const local = tryResolveLocalPackagePaths(relativePackagePath)
  if (local) {
    return local
  }

  const cacheDir = resolveReviewCacheDir(resourceId)
  const archivePath = join(cacheDir, 'package.bin')
  const extractedPath = join(cacheDir, 'extracted')

  if (!existsSync(archivePath) || !existsSync(extractedPath)) {
    rmSync(cacheDir, { recursive: true, force: true })
    mkdirSync(cacheDir, { recursive: true })
    const bytes = await downloadModerationResourcePackage(resourceId)
    writeFileSync(archivePath, bytes)
    extractZip(archivePath, extractedPath, '审核资源包')
  }

  return { downloadSourcePath: archivePath, extractedPath }
}

function defaultDownloadFileName(sourcePath: string, title: string): string {
  const base = basename(sourcePath)
  if (base && base !== 'files' && base !== 'package.bin') {
    return base
  }
  const safeTitle = title.trim().replace(/[^\w\u4e00-\u9fa5.-]+/g, '_') || 'resource-package'
  return `${safeTitle}.zip`
}

export async function openCommunityResourcePackageForReview(input: unknown) {
  const { resourceId } = ReviewResourceInputSchema.parse(input)
  const detail = await getResource({ id: resourceId })
  if (!detail.packagePath) {
    throw new Error('该资源尚未上传资源包')
  }

  const { extractedPath } = await ensureReviewPackagePaths(resourceId, detail.packagePath)
  return openPathInShell(extractedPath)
}

export async function downloadCommunityResourcePackageForReview(input: unknown) {
  const { resourceId } = ReviewResourceInputSchema.parse(input)
  const detail = await getResource({ id: resourceId })
  if (!detail.packagePath) {
    throw new Error('该资源尚未上传资源包')
  }

  const { downloadSourcePath } = await ensureReviewPackagePaths(resourceId, detail.packagePath)
  const result = await saveFile({
    sourcePath: downloadSourcePath,
    defaultFileName: defaultDownloadFileName(downloadSourcePath, detail.title),
  })

  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return result.data
}
