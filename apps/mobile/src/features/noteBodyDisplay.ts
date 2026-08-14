import { stripSocraticMachineBlocks } from '@toolman/shared'

/**
 * Note body as stored from desktop is Markdown (and may include machine-only
 * Socratic fences or rich-editor HTML wrappers). Strip those so the preview
 * does not show source symbols.
 */
export function prepareNoteMarkdown(text: string): string {
  return stripSocraticMachineBlocks(text)
    .replace(/<u>([\s\S]*?)<\/u>/gi, '$1')
    .replace(/<span\s+style=["']font-size:\s*[^"']+["']>([\s\S]*?)<\/span>/gi, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
}

export type NoteOutlineItem = {
  id: string
  level: 1 | 2 | 3
  text: string
}

export function extractNoteOutline(markdown: string): NoteOutlineItem[] {
  const items: NoteOutlineItem[] = []
  prepareNoteMarkdown(markdown)
    .split('\n')
    .forEach((line, index) => {
      const match = /^(#{1,3})\s+(.+)$/.exec(line.trim())
      if (!match) return
      const level = match[1]!.length as 1 | 2 | 3
      const text = match[2]!.trim()
      if (!text) return
      items.push({ id: `h-${index}`, level, text })
    })
  return items
}
