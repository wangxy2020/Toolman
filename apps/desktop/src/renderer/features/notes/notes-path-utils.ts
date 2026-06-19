import type { SystemPaths } from '../chat/useSystemPaths'

export function getDefaultNotesWorkingDirectory(paths: SystemPaths | null): string {
  if (!paths?.userData) return ''
  return `${paths.userData}/notes`
}

export function resolveNotesWorkingDirectory(
  stored: string | null,
  paths: SystemPaths | null,
): string {
  const defaultPath = getDefaultNotesWorkingDirectory(paths)
  return stored ?? defaultPath
}

export function normalizeStoredWorkingDirectory(
  draft: string,
  paths: SystemPaths | null,
): string | null {
  const trimmed = draft.trim()
  const defaultPath = getDefaultNotesWorkingDirectory(paths)
  if (!trimmed || (defaultPath && trimmed === defaultPath)) return null
  return trimmed
}
