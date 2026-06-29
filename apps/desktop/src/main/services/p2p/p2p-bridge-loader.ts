import { createRequire } from 'node:module'
import { resolveNativeAddonPath } from '../../bootstrap/native-module-path'
import type { P2pNativeModule } from './p2p-bridge-types'

let cachedNative: P2pNativeModule | null = null

export function resolveNativeModulePath(): string {
  return resolveNativeAddonPath('toolman-p2p', __dirname, 'pnpm build:p2p')
}

export function loadNativeModule(): P2pNativeModule {
  if (cachedNative) return cachedNative
  const require = createRequire(__filename)
  const modulePath = resolveNativeModulePath()
  cachedNative = require(modulePath) as P2pNativeModule
  return cachedNative
}

export function isP2pNativeAvailable(): boolean {
  try {
    resolveNativeModulePath()
    return true
  } catch {
    return false
  }
}
