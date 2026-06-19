import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { minimatch } from 'minimatch'
import {
  isIgnoredKnowledgeIngestFile,
  KNOWLEDGE_IGNORED_INGEST_GLOB_PATTERNS,
} from '../parsers/file-type.js'

export function matchesAnyPattern(relativePath: string, patterns: string[]): boolean {
  const normalized = relativePath.split('\\').join('/')
  return patterns.some((pattern) => minimatch(normalized, pattern, { dot: false, nocase: true }))
}

export function isExcluded(relativePath: string, excludePatterns: string[]): boolean {
  const normalized = relativePath.split('\\').join('/')
  return excludePatterns.some((pattern) =>
    minimatch(normalized, pattern, { dot: true, nocase: true }),
  )
}

export function scanDirectory(options: {
  rootPath: string
  include: string[]
  exclude: string[]
}): string[] {
  if (!existsSync(options.rootPath)) return []

  const excludePatterns = [
    ...options.exclude,
    ...KNOWLEDGE_IGNORED_INGEST_GLOB_PATTERNS,
  ]

  const files: string[] = []
  const stack = [options.rootPath]

  while (stack.length > 0) {
    const current = stack.pop()!
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      const rel = relative(options.rootPath, fullPath).split('\\').join('/')

      if (entry.isDirectory()) {
        if (isExcluded(`${rel}/`, excludePatterns) || isExcluded(rel, excludePatterns)) {
          continue
        }
        stack.push(fullPath)
        continue
      }

      if (!entry.isFile()) continue
      if (isIgnoredKnowledgeIngestFile(fullPath)) continue
      if (isExcluded(rel, excludePatterns)) continue
      if (!matchesAnyPattern(rel, options.include)) continue
      files.push(fullPath)
    }
  }

  return files.sort()
}
