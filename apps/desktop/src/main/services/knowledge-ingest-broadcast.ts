import { BrowserWindow } from 'electron'
import { IpcChannel, type KnowledgeIngestStreamEvent } from '@toolman/shared'

export function broadcastKnowledgeIngestEvent(event: KnowledgeIngestStreamEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannel.KnowledgeIngestStream, event)
    }
  }
}
