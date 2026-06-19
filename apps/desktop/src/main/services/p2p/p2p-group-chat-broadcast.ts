import { BrowserWindow } from 'electron'
import type { P2pGroupChatMessage } from '@toolman/shared'

export function broadcastP2pGroupChatMessage(message: P2pGroupChatMessage): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:group-chat:message', message)
    }
  }
}
