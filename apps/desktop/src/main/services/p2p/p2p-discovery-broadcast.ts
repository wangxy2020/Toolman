import { BrowserWindow } from 'electron'
import type { DiscoveredNode } from '@toolman/shared'

export function broadcastP2pDiscoveryNodeOnline(node: DiscoveredNode): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:discovery:node-online', node)
    }
  }
}

export function broadcastP2pDiscoveryNodeOffline(deviceId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:discovery:node-offline', { deviceId })
    }
  }
}
