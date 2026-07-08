import { type ProvenanceBeaconEvent, IpcChannel } from '@toolman/shared'
import { fireAndForgetInvoke } from './ipc-client'

/** Renderer-side entry for session beacons — do not invoke AppProvenanceBeacon directly elsewhere. */
export function recordProvenanceBeacon(event: ProvenanceBeaconEvent): void {
  fireAndForgetInvoke(IpcChannel.AppProvenanceBeacon, { event })
}
