import { createHash } from 'node:crypto'

export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
