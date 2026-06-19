import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export function hashFileBytes(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}
