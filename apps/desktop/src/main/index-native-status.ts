import { logStructured } from './services/structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { P2pBridge } from './services/p2p/p2p-bridge'
import { ensureP2pDeviceIdentity } from './services/p2p/p2p-device-identity.service'
import { Libp2pBridge } from './services/p2p/libp2p-bridge'

export function logLibp2pNativeStatus(): void {
  try {
    const message = Libp2pBridge.ping()
    const version = Libp2pBridge.version()
    logStructured('libp2p', 'info', `native module ready (${version}): ${message}`)
  } catch (error) {
    const errMessage = toErrorMessage(error, String(error))
    logStructured('libp2p', 'warn', `native module unavailable: ${errMessage}`)
  }
}

export function logP2pNativeStatus(): void {
  try {
    const message = P2pBridge.ping()
    const version = P2pBridge.version()
    logStructured('p2p', 'info', `native module ready (${version}): ${message}`)
    const device = ensureP2pDeviceIdentity()
    logStructured('p2p', 'info', `device identity ready: ${device.deviceId} (fp=${device.publicKeyFingerprint})`)
  } catch (error) {
    const errMessage = toErrorMessage(error, String(error))
    logStructured('p2p', 'error', `native module unavailable: ${errMessage}`)
  }
}
