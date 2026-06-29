export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

export function truncatePath(path: string, max = 34): string {
  if (path.length <= max) return path
  return `${path.slice(0, max)}…`
}
