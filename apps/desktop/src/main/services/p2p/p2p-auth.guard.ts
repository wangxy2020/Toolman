import { assertRegisteredForFeature } from '../auth-feature-gate.service'

export function assertRegisteredForP2p(): void {
  assertRegisteredForFeature('group')
}
