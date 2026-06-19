import { BrowserWindow } from 'electron'
import { IpcChannel, type KnowledgeFileDedupStreamEvent } from '@toolman/shared'

export function broadcastKnowledgeDedupEvent(event: KnowledgeFileDedupStreamEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannel.KnowledgeFileDedupStream, event)
    }
  }
}
