export function getParentPath(filePath: string): string | null {
  const normalized = filePath.replace(/[/\\]+$/, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (index <= 0) return null
  return normalized.slice(0, index)
}
