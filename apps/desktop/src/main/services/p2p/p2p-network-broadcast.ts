import { BrowserWindow } from 'electron'
import type { P2pNetworkSnapshot } from '@toolman/shared'

export function broadcastP2pNetworkSnapshotUpdated(snapshot: P2pNetworkSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:network:snapshot-updated', snapshot)
    }
  }
}
