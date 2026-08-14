import {
  getToolmanBuildProvenance,
  TOOLMAN_ONE_SHOT_BEACON_EVENTS,
  type ProvenanceBeaconEvent,
} from '@toolman/shared'

const recordedOneShot = new Set<ProvenanceBeaconEvent>()
const oneShotEvents = new Set<ProvenanceBeaconEvent>(TOOLMAN_ONE_SHOT_BEACON_EVENTS)

/** Mobile session beacons — same events/fingerprint as desktop; no second pipeline. */
export function recordProvenanceBeacon(event: ProvenanceBeaconEvent): void {
  if (oneShotEvents.has(event) && recordedOneShot.has(event)) return
  if (oneShotEvents.has(event)) recordedOneShot.add(event)

  const provenance = getToolmanBuildProvenance()
  if (typeof console !== 'undefined') {
    console.info(
      `[provenance] ${event} (${provenance.version}, ${provenance.gitCommit.slice(0, 7)})`,
    )
  }
}
