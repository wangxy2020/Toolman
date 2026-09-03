import { app, BrowserWindow, Menu, type WebContents } from 'electron'
import type { ContextMenuParams } from 'electron'

import {
  buildEditableContextMenuTemplate,
  shouldAttachEditableContextMenu,
} from './editable-context-menu-template'

let attached = false

export function attachEditableContextMenus(): void {
  if (attached) return
  attached = true

  app.on('web-contents-created', (_event, contents) => {
    contents.on('context-menu', (_menuEvent, params) => {
      showEditableContextMenu(contents, params)
    })
  })
}

export function showEditableContextMenu(contents: WebContents, params: ContextMenuParams): void {
  if (contents.isDestroyed()) return
  if (!shouldAttachEditableContextMenu(contents.getURL())) return

  const template = buildEditableContextMenuTemplate(params)
  if (!template) return

  const window = BrowserWindow.fromWebContents(contents)
  Menu.buildFromTemplate(template).popup({ window: window ?? undefined })
}
