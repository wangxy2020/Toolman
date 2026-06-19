export function sanitizeKnowledgeBaseFolderName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''

  return trimmed
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildKnowledgeBasePath(baseFolder: string | null, name: string): string {
  if (!baseFolder) return ''

  const folderName = sanitizeKnowledgeBaseFolderName(name)
  if (!folderName) return ''

  const sep = baseFolder.includes('\\') ? '\\' : '/'
  const base = baseFolder.replace(/[/\\]+$/, '')
  return `${base}${sep}${folderName}`
}

export function getPathBasename(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '')
  const parts = normalized.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? normalized
}

export function stripFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return filename
  return filename.slice(0, dot)
}
