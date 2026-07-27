import { BrowserWindow } from 'electron'
import { IpcChannel, type TaskEvent } from '@toolman/shared'

type TaskStreamRelayListener = (event: TaskEvent) => void

const taskStreamRelayListeners = new Set<TaskStreamRelayListener>()

export function broadcastTaskEvent(event: TaskEvent): void {
  for (const listener of taskStreamRelayListeners) {
    listener(event)
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannel.TaskStream, event)
    }
  }
}
