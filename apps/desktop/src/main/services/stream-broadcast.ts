import { BrowserWindow } from 'electron'
import { IpcChannel, type MessageStreamEvent } from '@toolman/shared'

type StreamRelayListener = (event: MessageStreamEvent) => void

const streamRelayListeners = new Set<StreamRelayListener>()

export function addStreamRelayListener(listener: StreamRelayListener): () => void {
  streamRelayListeners.add(listener)
  return () => {
    streamRelayListeners.delete(listener)
  }
}

export function broadcastStreamEvent(event: MessageStreamEvent): void {
  for (const listener of streamRelayListeners) {
    listener(event)
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannel.MessageStream, event)
    }
  }
}
