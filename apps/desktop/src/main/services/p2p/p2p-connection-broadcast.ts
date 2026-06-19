import { BrowserWindow } from 'electron'
import type { P2pConnectionState } from '@toolman/shared'

export function broadcastP2pConnectionStateChange(payload: {
  peerDeviceId: string
  state: P2pConnectionState
  workspaceId?: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:connection:state-change', payload)
    }
  }
}

export function broadcastP2pConnectionError(payload: {
  peerDeviceId: string
  code: string
  message: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:connection:error', payload)
    }
  }
}
