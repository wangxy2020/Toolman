import { BrowserWindow } from 'electron'
import type { P2pPeerTrustRequiredPayload } from '@toolman/shared'

export function broadcastP2pPeerTrustRequired(payload: P2pPeerTrustRequiredPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:peer:trust-required', payload)
    }
  }
}
