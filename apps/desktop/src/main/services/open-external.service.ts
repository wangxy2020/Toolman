import { app, shell } from 'electron'
import { logStructured } from './structured-log.service'

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol === 'http:' && !app.isPackaged && isLoopbackHost(parsed.hostname)) {
      return true
    }
    return false
  } catch {
    return false
  }
}

export function openExternalUrl(url: string): boolean {
  if (!isSafeExternalUrl(url)) {
    logStructured('window', 'warn', 'blocked openExternal', { url })
    return false
  }
  void shell.openExternal(url)
  return true
}
