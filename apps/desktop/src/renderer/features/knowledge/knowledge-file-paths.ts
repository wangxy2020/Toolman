function fileUriToPath(uri: string): string | null {
  const trimmed = uri.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  try {
    if (!trimmed.startsWith('file://')) return null
    const url = new URL(trimmed)
    let pathname = decodeURIComponent(url.pathname)
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1)
    }
    return pathname || null
  } catch {
    return null
  }
}

function getPathFromFile(file: File): string {
  if (typeof window.api.getPathForFile === 'function') {
    try {
      const path = window.api.getPathForFile(file)
      if (path) return path
    } catch {
      // fall through
    }
  }

  return (file as File & { path?: string }).path ?? ''
}

function getPathsFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const paths: string[] = []
  const seen = new Set<string>()

  const addPath = (path: string | null) => {
    if (!path || seen.has(path)) return
    seen.add(path)
    paths.push(path)
  }

  const uriList = dataTransfer.getData('text/uri-list')
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      addPath(fileUriToPath(line))
    }
  }

  const plain = dataTransfer.getData('text/plain')
  if (plain) {
    for (const line of plain.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed.startsWith('file://')) {
        addPath(fileUriToPath(trimmed))
      }
    }
  }

  return paths
}

export function getLocalFilePaths(
  files: FileList | File[],
  dataTransfer?: DataTransfer | null,
): string[] {
  const paths: string[] = []
  const seen = new Set<string>()

  const addPath = (path: string) => {
    if (!path || seen.has(path)) return
    seen.add(path)
    paths.push(path)
  }

  for (const file of Array.from(files)) {
    const path = getPathFromFile(file)
    if (path) addPath(path)
  }

  if (paths.length === 0 && dataTransfer) {
    for (const path of getPathsFromDataTransfer(dataTransfer)) {
      addPath(path)
    }
  }

  return paths
}
