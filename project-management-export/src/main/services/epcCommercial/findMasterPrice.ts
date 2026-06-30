import fs from 'node:fs'
import path from 'node:path'

const MAX_DEPTH = 4

const collectXlsx = (dir: string, depth: number, out: string[]): void => {
  if (depth > MAX_DEPTH) {
    return
  }
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectXlsx(full, depth + 1, out)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (entry.name.startsWith('~$')) {
      continue
    }
    if (full.toLowerCase().endsWith('.xlsx')) {
      out.push(full)
    }
  }
}

/**
 * 在工作目录中查找首个可能为合同母表的 xlsx
 */
export const findMasterPriceWorkbook = async (rootDir: string): Promise<string | null> => {
  if (!fs.existsSync(rootDir)) {
    return null
  }
  const candidates: string[] = []
  collectXlsx(rootDir, 0, candidates)
  const scored = candidates
    .map((filePath) => ({
      filePath,
      score: scoreMasterCandidate(path.basename(filePath))
    }))
    .sort((a, b) => b.score - a.score)
  return scored[0]?.filePath ?? candidates[0] ?? null
}

const scoreMasterCandidate = (name: string): number => {
  const lower = name.toLowerCase()
  let score = 0
  if (lower.includes('price')) score += 3
  if (lower.includes('合同')) score += 3
  if (lower.includes('母表')) score += 4
  if (lower.includes('schedule')) score += 2
  if (lower.includes('ipc')) score -= 2
  return score
}
