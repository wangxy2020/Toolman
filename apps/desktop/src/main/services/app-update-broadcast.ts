import { BrowserWindow } from 'electron'
import { APP_UPDATE_STATUS_CHANNEL, type AppUpdateStatus } from '@toolman/shared'

export function broadcastAppUpdateStatus(status: AppUpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(APP_UPDATE_STATUS_CHANNEL, status)
    }
  }
}
