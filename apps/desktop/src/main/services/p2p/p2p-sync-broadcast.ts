import { BrowserWindow } from 'electron'
import {
  P2pSyncCompletedPayloadSchema,
  P2pSyncErrorPayloadSchema,
  P2pSyncProgressPayloadSchema,
  type WorkspaceEvent,
} from '@toolman/shared'
import type { z } from 'zod'

type P2pSyncProgressPayload = z.infer<typeof P2pSyncProgressPayloadSchema>
type P2pSyncCompletedPayload = z.infer<typeof P2pSyncCompletedPayloadSchema>
type P2pSyncErrorPayload = z.infer<typeof P2pSyncErrorPayloadSchema>

export function broadcastP2pSyncProgress(payload: P2pSyncProgressPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:sync:progress', payload)
    }
  }
}

export function broadcastP2pSyncCompleted(payload: P2pSyncCompletedPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:sync:completed', payload)
    }
  }
}

export function broadcastP2pSyncEventApplied(event: WorkspaceEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:sync:event-applied', event)
    }
  }
}

export function broadcastP2pSyncError(payload: P2pSyncErrorPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('p2p:sync:error', payload)
    }
  }
}
