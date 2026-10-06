import { join } from 'node:path'

export interface DisplacedAccountInput {
  currentSlug: string
  currentRoot: string
  documentsRoot: string
  siblingSlugs: string[]
  referencedPaths: string[]
  fileExists: (path: string) => boolean
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * When a login switch rewrote database paths onto the new account folder
 * without moving the files, the previous account is the sibling folder that
 * still holds more of those files than the current folder.
 */
export function inferDisplacedOwnerSlug(input: DisplacedAccountInput): string | null {
  const currentRoot = normalize(input.currentRoot)
  const prefix = `${currentRoot}/`
  let currentHits = 0
  const siblingHits = new Map<string, number>()

  for (const rawPath of input.referencedPaths) {
    const path = normalize(rawPath)
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(currentRoot.length)
    if (input.fileExists(path)) {
      currentHits += 1
      continue
    }
    for (const slug of input.siblingSlugs) {
      if (!slug || slug === input.currentSlug) continue
      const candidate = `${normalize(join(input.documentsRoot, slug))}${rest}`
      if (!input.fileExists(candidate)) continue
      siblingHits.set(slug, (siblingHits.get(slug) ?? 0) + 1)
    }
  }

  let bestSlug: string | null = null
  let bestHits = 0
  for (const [slug, hits] of siblingHits) {
    if (hits > bestHits) {
      bestSlug = slug
      bestHits = hits
    }
  }
  if (!bestSlug || bestHits === 0 || bestHits <= currentHits) return null
  return bestSlug
}
