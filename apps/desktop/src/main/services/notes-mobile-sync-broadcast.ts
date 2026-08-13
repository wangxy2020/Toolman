import { BrowserWindow } from 'electron'

export function broadcastMobileNotesChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('notes:mobile-sync', { at: Date.now() })
    }
  }
}
