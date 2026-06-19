import { normalizeToolName } from './tool-display-meta'

export interface FsListEntry {
  kind: 'dir' | 'file'
  name: string
}

export type ParsedToolResult =
  | { type: 'fs_list'; entries: FsListEntry[] }
  | { type: 'glob'; summary: string; truncated: boolean; paths: string[] }
  | { type: 'line_list'; lines: string[] }
  | { type: 'text' }

function parseFsList(text: string): ParsedToolResult {
  const entries: FsListEntry[] = []
  for (const line of text.split('\n')) {
    const match = line.match(/^\[(dir|file)\]\s+(.+)$/)
    if (match) {
      entries.push({ kind: match[1] as 'dir' | 'file', name: match[2] })
    }
  }
  if (entries.length === 0) return { type: 'text' }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return { type: 'fs_list', entries }
}

function parseGlob(text: string): ParsedToolResult {
  if (text === '未找到匹配文件') {
    return { type: 'glob', summary: '未找到匹配文件', truncated: false, paths: [] }
  }

  const headerMatch = text.match(/^(找到(?:至少)?\s*\d+\s*个匹配文件[^：\n]*)：\s*\n?/)
  if (!headerMatch) return { type: 'text' }

  const summary = headerMatch[0].replace(/：\s*\n?$/, '').trim()
  const truncated = summary.includes('截断')
  const paths = text
    .slice(headerMatch[0].length)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (paths.length === 0) return { type: 'text' }
  return { type: 'glob', summary, truncated, paths }
}

function parseLineList(text: string): ParsedToolResult | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2) return null
  return { type: 'line_list', lines }
}

export function parseToolResult(toolName: string, raw: string): ParsedToolResult {
  const text = raw.trim()
  if (!text) return { type: 'text' }

  const shortName = normalizeToolName(toolName)
  if (shortName === 'fs_list') return parseFsList(text)
  if (shortName === 'fs_glob' || shortName === 'glob') return parseGlob(text)

  if (['fs_grep', 'grep', 'sql_list_tables', 'memory_list', 'agent_task_list'].includes(shortName)) {
    const list = parseLineList(text)
    if (list) return list
  }

  return { type: 'text' }
}

export function summarizeToolResult(parsed: ParsedToolResult, raw = ''): string | null {
  if (parsed.type === 'fs_list') {
    const dirs = parsed.entries.filter((entry) => entry.kind === 'dir').length
    const files = parsed.entries.filter((entry) => entry.kind === 'file').length
    const total = parsed.entries.length
    const parts = [`共${total}项`]
    if (dirs) parts.push(`${dirs}个文件夹`)
    if (files) parts.push(`${files}个文件`)
    return parts.join('，')
  }

  if (parsed.type === 'glob') {
    if (!parsed.paths.length) return parsed.summary
    const count = parsed.paths.length
    return parsed.truncated ? `共找到至少 ${count} 个匹配文件` : `共找到 ${count} 个匹配文件`
  }

  if (parsed.type === 'line_list') {
    return `共 ${parsed.lines.length} 项`
  }

  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    return `输出结果：${trimmed}`
  }

  const lines = trimmed.split('\n').filter((line) => line.trim())
  if (lines.length > 1) {
    return `共 ${lines.length} 行输出`
  }

  if (trimmed.length > 120) {
    return `${trimmed.slice(0, 120)}…`
  }

  return trimmed
}

export function splitPathParts(path: string): { name: string; parent: string | null } {
  const normalized = path.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  if (slash === -1) return { name: normalized, parent: null }
  return {
    name: normalized.slice(slash + 1) || normalized,
    parent: normalized.slice(0, slash) || '/',
  }
}
