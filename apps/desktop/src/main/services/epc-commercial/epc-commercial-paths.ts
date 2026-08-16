import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export const getEpcCommercialDataDir = (): string => {
  const dir = path.join(app.getPath('userData'), 'epc-commercial')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
