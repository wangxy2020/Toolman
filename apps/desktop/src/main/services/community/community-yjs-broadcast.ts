import { BrowserWindow } from 'electron'
import type { CommunityYjsUpdateEvent } from '@toolman/shared'

export function broadcastCommunityYjsUpdate(event: CommunityYjsUpdateEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('community:yjs:update', event)
    }
  }
}
