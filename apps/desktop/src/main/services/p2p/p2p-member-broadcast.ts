import { BrowserWindow } from 'electron'

export function broadcastP2pMemberChanged(payload: { workspaceId: string }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:member:changed', payload)
    }
  }
}
