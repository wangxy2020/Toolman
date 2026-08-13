import { BrowserWindow } from 'electron'
import { IpcChannel, type AssistantLibSyllabusStreamEvent } from '@toolman/shared'

export function broadcastAssistantLibSyllabusEvent(
  event: AssistantLibSyllabusStreamEvent,
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannel.AssistantLibSyllabusStream, event)
    }
  }
}
