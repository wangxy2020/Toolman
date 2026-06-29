import { IpcChannel, type ProvenanceBeaconEvent } from '@toolman/shared'

/** Renderer-side entry for session beacons — do not invoke AppProvenanceBeacon directly elsewhere. */
export function recordProvenanceBeacon(event: ProvenanceBeaconEvent): void {
  void window.api.invoke(IpcChannel.AppProvenanceBeacon, { event })
}
