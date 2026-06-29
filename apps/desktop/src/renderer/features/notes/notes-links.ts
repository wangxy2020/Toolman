import type { NoteItem } from './notes-storage'

const WIKI_LINK_RE = /\[\[([^[\]]+)\]\]/g

export function extractWikiLinkTargets(content: string): string[] {
  if (!content) return []
  const targets: string[] = []
  for (const match of content.matchAll(WIKI_LINK_RE)) {
    const raw = match[1]?.trim()
    if (!raw) continue
    const target = raw.split('|')[0]?.trim()
    if (target) targets.push(target)
  }
  return targets
}

export function resolveWikiLinkTarget(target: string, notes: NoteItem[]): NoteItem | null {
  const byId = notes.find((note) => note.id === target)
  if (byId) return byId
  const normalized = target.trim().toLowerCase()
  return (
    notes.find((note) => note.title.trim().toLowerCase() === normalized) ??
    notes.find((note) => note.title.trim() === target) ??
    null
  )
}

export function preprocessWikiLinks(content: string, notes: NoteItem[]): string {
  return content.replace(WIKI_LINK_RE, (match, raw: string) => {
    const [targetRaw, labelRaw] = raw.split('|').map((part: string) => part.trim())
    const target = targetRaw ?? ''
    const resolved = resolveWikiLinkTarget(target, notes)
    if (!resolved) return match
    const label = labelRaw || target
    return `[${label}](note://${resolved.id})`
  })
}
