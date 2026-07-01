import path from 'node:path'
import { app } from 'electron'

/** Packaged resources directory (extraResources / app bundle Resources). */
export function getResourcePath(): string {
  if (app.isPackaged) {
    return process.resourcesPath
  }
  return path.join(app.getAppPath(), 'resources')
}
