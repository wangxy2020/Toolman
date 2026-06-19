export interface KnowledgeFileTypeCount {
  type: string
  label: string
  count: number
}

const EXTENSION_LABELS: Record<string, string> = {
  md: 'Markdown',
  markdown: 'Markdown',
  txt: 'TXT',
  pdf: 'PDF',
  doc: 'DOC',
  docx: 'DOCX',
  xls: 'XLS',
  xlsx: 'XLSX',
  csv: 'CSV',
  pptx: 'PPTX',
  html: 'HTML',
  htm: 'HTML',
}

export function getKnowledgeFileExtension(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function countKnowledgeFilesByType(paths: string[]): KnowledgeFileTypeCount[] {
  const counts = new Map<string, number>()

  for (const path of paths) {
    const ext = getKnowledgeFileExtension(path)
    if (!ext) continue
    counts.set(ext, (counts.get(ext) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([type, count]) => ({
      type,
      label: EXTENSION_LABELS[type] ?? type.toUpperCase(),
      count,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'))
}

export function formatKnowledgeFileTypeSummary(counts: KnowledgeFileTypeCount[]): string {
  if (counts.length === 0) return ''
  return counts.map((item) => `${item.label} ${item.count}`).join('、')
}

export function getCommonParentPath(paths: string[]): string {
  if (paths.length === 0) return ''

  const dirs = paths.map((path) => {
    const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    return index >= 0 ? path.slice(0, index) : path
  })

  if (dirs.length === 1) return dirs[0]

  let prefix = dirs[0]
  for (let index = 1; index < dirs.length; index += 1) {
    const current = dirs[index]
    while (current !== prefix && !current.startsWith(`${prefix}/`) && !current.startsWith(`${prefix}\\`)) {
      const cut = Math.max(prefix.lastIndexOf('/'), prefix.lastIndexOf('\\'))
      if (cut < 0) return dirs[0]
      prefix = prefix.slice(0, cut)
    }
  }

  return prefix
}
