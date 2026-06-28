/** Sanitize a segment under ~/Documents/ToolmanData/{segment}/ */
export function sanitizeUserFolderName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '本地用户'
  const sanitized = trimmed.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim()
  return sanitized || '本地用户'
}
