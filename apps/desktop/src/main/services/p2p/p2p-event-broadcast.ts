import { BrowserWindow } from 'electron'
import type { WorkspaceEvent } from '@toolman/shared'

export function broadcastP2pEventAppended(event: WorkspaceEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:event:appended', event)
    }
  }
}
