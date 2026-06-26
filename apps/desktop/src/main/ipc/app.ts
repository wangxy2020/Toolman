import { app } from 'electron'
import { join } from 'node:path'
import { getToolmanBuildProvenance } from '@toolman/shared'
import { getP2pDeviceId } from '../services/p2p/p2p-device-identity.service'

export function getAppInfo() {
  return {
    version: app.getVersion() || '0.1.0',
    platform: process.platform as 'darwin' | 'win32' | 'linux',
    arch: process.arch,
    deviceId: getP2pDeviceId(),
    schemaVersion: '1.0.0-mvp',
    provenance: getToolmanBuildProvenance(),
  }
}

export function getAppPaths() {
  const userData = app.getPath('userData')
  return {
    userData,
    logs: join(userData, 'logs'),
    blobs: join(userData, 'storage', 'blobs'),
    temp: app.getPath('temp'),
    home: app.getPath('home'),
    documents: app.getPath('documents'),
    desktop: app.getPath('desktop'),
    downloads: app.getPath('downloads'),
    knowledgeBase: join(userData, 'knowledge'),
  }
}
