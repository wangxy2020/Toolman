import { BrowserWindow } from 'electron'

import type { FederatedCatalogUpdateEvent } from '@toolman/shared'

export function broadcastFederatedCatalogUpdate(event: FederatedCatalogUpdateEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('community:federated:catalog:update', event)
    }
  }
}
