import { BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { getMainWindow } from '../index-window'

export function isTrustedIpcSender(event: IpcMainInvokeEvent): boolean {
  const sender = event.sender
  if (sender.isDestroyed()) return false

  const main = getMainWindow()
  if (!main || main.isDestroyed()) return false
  if (sender === main.webContents) return true

  const fromWindow = BrowserWindow.fromWebContents(sender)
  return Boolean(fromWindow && fromWindow === main)
}
