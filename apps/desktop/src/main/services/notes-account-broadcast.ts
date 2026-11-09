import { BrowserWindow } from 'electron'

export function broadcastNotesAccountChanged(accountSlug: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('notes:account-changed', { accountSlug, at: Date.now() })
    }
  }
}
