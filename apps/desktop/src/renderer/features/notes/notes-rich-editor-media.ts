/** Local image helpers for the notes rich editor (file:// cannot load in the renderer). */

import { FileReadBinaryOutputSchema, IpcChannel } from '@toolman/shared'

export function toFileUrl(filePath: string): string {
  if (filePath.startsWith('file://')) return filePath
  if (filePath.startsWith('/')) return `file://${filePath}`
  // Windows paths like C:\...
  return `file:///${filePath.replace(/\\/g, '/')}`
}

export function filePathFromFileUrl(url: string): string | null {
  if (!url.startsWith('file://')) return null
  try {
    const parsed = new URL(url)
    let path = decodeURIComponent(parsed.pathname)
    // URL pathname on Windows is /C:/...
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1)
    return path
  } catch {
    return null
  }
}

export async function loadLocalImageDataUrl(filePath: string): Promise<string | null> {
  const result = await window.api.invoke(IpcChannel.FileReadBinary, {
    path: filePath,
    maxBytes: 12 * 1024 * 1024,
  })
  if (!result.ok) return null
  const payload = FileReadBinaryOutputSchema.parse(result.data)
  const mime =
    payload.mimeType.startsWith('image/')
      ? payload.mimeType
      : mimeFromFileName(payload.fileName) ?? 'application/octet-stream'
  return `data:${mime};base64,${payload.base64}`
}

function mimeFromFileName(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'bmp':
      return 'image/bmp'
    default:
      return null
  }
}

/** Replace file:// image sources with data URLs so they render under Electron sandbox. */
export async function hydrateNoteEditorImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img.tm-notes-rich-image, img'))
  await Promise.all(
    images.map(async (img) => {
      if (!(img instanceof HTMLImageElement)) return
      const storedPath = img.dataset.filePath?.trim()
      const src = img.getAttribute('src') ?? ''
      if (src.startsWith('data:')) {
        if (!storedPath && src.length > 0) return
        return
      }
      const filePath = storedPath || filePathFromFileUrl(src)
      if (!filePath) return
      img.dataset.filePath = filePath
      const dataUrl = await loadLocalImageDataUrl(filePath)
      if (dataUrl) img.src = dataUrl
    }),
  )
}
