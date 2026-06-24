import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

import { sha256Hex } from './community-package-zip.util'

export const COMMUNITY_CHECKSUMS_FILENAME = 'SHA256SUMS'

export interface PrepareCommunityPackageResult {
  packagePath: string
  normalized: boolean
  message?: string
}

export function slugifyCommunityId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'community-resource'
}

export function looksLikeZip(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

export function listRelativeFiles(rootDir: string, currentDir = rootDir): string[] {
  const entries = readdirSync(currentDir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listRelativeFiles(rootDir, absolutePath))
      continue
    }
    if (entry.isFile()) {
      files.push(absolutePath.slice(rootDir.length + 1).replace(/\\/g, '/'))
    }
  }
  return files.sort()
}

export function writeChecksumsFile(bundleRoot: string): void {
  const relativeFiles = listRelativeFiles(bundleRoot).filter(
    (file) => file !== COMMUNITY_CHECKSUMS_FILENAME,
  )
  const checksumLines = relativeFiles.map((relativePath) => {
    const bytes = readFileSync(join(bundleRoot, relativePath))
    return `${sha256Hex(bytes)}  ${relativePath}`
  })
  writeFileSync(join(bundleRoot, COMMUNITY_CHECKSUMS_FILENAME), `${checksumLines.join('\n')}\n`, 'utf8')
}

export function zipDirectory(sourceDir: string, zipPath: string): void {
  execFileSync('zip', ['-r', zipPath, '.'], { cwd: sourceDir })
}

export function repackDirectory(input: {
  sourceDir: string
  zipFileName: string
  stagingPrefix: string
  zipCommandLabel?: string
}): { packagePath: string; stagingRoot: string } {
  const stagingRoot = mkdtempSync(join(tmpdir(), input.stagingPrefix))
  const bundleRoot = join(stagingRoot, 'bundle')
  cpSync(input.sourceDir, bundleRoot, { recursive: true })
  writeChecksumsFile(bundleRoot)
  const zipPath = join(stagingRoot, input.zipFileName)
  try {
    zipDirectory(bundleRoot, zipPath)
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true })
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`系统未找到 zip 命令，无法打包${input.zipCommandLabel ?? '资源'}`)
    }
    throw error
  }
  return { packagePath: zipPath, stagingRoot }
}

export function extractZip(archivePath: string, destDir: string, label = '压缩包'): void {
  mkdirSync(destDir, { recursive: true })
  try {
    execFileSync('unzip', ['-q', archivePath, '-d', destDir])
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`系统未找到 unzip 命令，无法解析${label}`)
    }
    throw new Error(`无法解压${label}，请确认文件是有效的 zip`)
  }
}

export function resolvePackageRoot(extractDir: string, markerFiles: string[]): string {
  for (const marker of markerFiles) {
    if (existsSync(join(extractDir, marker))) {
      return extractDir
    }
  }

  const entries = readdirSync(extractDir, { withFileTypes: true })
  const directories = entries.filter((entry) => entry.isDirectory())
  if (directories.length === 1) {
    const nested = join(extractDir, directories[0].name)
    for (const marker of markerFiles) {
      if (existsSync(join(nested, marker))) {
        return nested
      }
    }
  }

  return extractDir
}

export function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

export function isCommunityReadyPackage(packageRoot: string, manifestFilename: string): boolean {
  return (
    existsSync(join(packageRoot, manifestFilename)) &&
    existsSync(join(packageRoot, COMMUNITY_CHECKSUMS_FILENAME))
  )
}

export function safeZipBaseName(sourcePath: string, fallbackTitle?: string, fallback = 'community'): string {
  const base = basename(sourcePath).replace(/\.[^.]+$/, '')
  const safe = (fallbackTitle || base).trim().replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 64)
  return safe || fallback
}

export function assertZipSource(sourcePath: string, label: string): Buffer {
  if (!existsSync(sourcePath)) {
    throw new Error('资源包文件不存在')
  }
  const bytes = readFileSync(sourcePath)
  if (!looksLikeZip(bytes)) {
    throw new Error(`${label}必须是 zip 格式`)
  }
  return bytes
}
