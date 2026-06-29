import { IpcChannel } from '@toolman/shared'
import type { NotesData } from './notes-storage'
import { normalizeData } from './notes-storage'

export function exportNotesDataAsJson(data: NotesData, filename = 'toolman-notes-backup.json'): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function importNotesDataFromJson(raw: string): NotesData {
  return normalizeData(JSON.parse(raw) as Partial<NotesData>)
}

export async function syncNotesToFolder(folderPath: string, data: NotesData): Promise<string | null> {
  const result = await window.api.invoke(IpcChannel.NotesSyncExport, {
    folderPath,
    dataJson: JSON.stringify(data, null, 2),
  })
  if (!result.ok) return result.error.message
  return (result.data as { filePath: string }).filePath
}

export async function importMarkdownFiles(paths: string[]): Promise<Array<{ title: string; content: string }>> {
  if (paths.length === 0) return []
  const result = await window.api.invoke(IpcChannel.FileReadForChat, { paths })
  if (!result.ok) return []
  const { files } = result.data as {
    files: Array<{ path: string; name: string; content: string }>
  }
  return files.map((file) => ({
    title: file.name.replace(/\.(md|markdown|txt)$/i, '') || '导入笔记',
    content: file.content,
  }))
}

export function exportNoteAsMarkdown(note: { title: string; content: string }): void {
  const markdown = `# ${note.title}\n\n${note.content}`.trimEnd()
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${note.title || '笔记'}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function printNote(note: { title: string; content: string }): void {
  const html = `
    <html><head><title>${note.title}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; line-height: 1.7; }
      h1 { font-size: 28px; margin-bottom: 24px; }
      pre { background: #f5f5f5; padding: 12px; border-radius: 8px; overflow: auto; }
      blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 12px; color: #555; }
    </style></head><body>
    <h1>${note.title}</h1>
    <pre style="white-space: pre-wrap; font-family: inherit; background: transparent; padding: 0;">${note.content.replace(/</g, '&lt;')}</pre>
    </body></html>
  `
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) {
    frame.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  frame.contentWindow?.focus()
  frame.contentWindow?.print()
  setTimeout(() => frame.remove(), 1000)
}
