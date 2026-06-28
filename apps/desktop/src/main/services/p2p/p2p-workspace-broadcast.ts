import { BrowserWindow } from 'electron'

export function broadcastP2pWorkspaceDissolved(payload: { workspaceId: string }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:workspace:dissolved', payload)
    }
  }
}
