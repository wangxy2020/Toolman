import { existsSync, readdirSync } from 'node:fs'
import { getKbVectorStorePath } from './file-vector-store.js'

/** v1 keeps the historical unversioned filename so existing indexes keep working. */
export function listKbVectorStorePaths(vectorsDir: string, kbId: string): string[] {
  const paths = new Set<string>([getKbVectorStorePath(vectorsDir, kbId, 1)])
  if (!existsSync(vectorsDir)) return [...paths]
  const prefix = `kb_${kbId}.v`
  for (const name of readdirSync(vectorsDir)) {
    if (name.startsWith(prefix) && name.endsWith('.vectors.json')) {
      paths.add(`${vectorsDir}/${name}`)
    }
  }
  return [...paths]
}
