/**
 * Group chat relay policy when owner is online vs offline (member mesh).
 */
export function shouldRelayGroupChatAfterReceive(input: {
  localDeviceId: string
  ownerDeviceId: string
  senderDeviceId: string
  ownerPeerConnected: boolean
}): boolean {
  if (input.localDeviceId === input.senderDeviceId) {
    return false
  }

  if (input.localDeviceId === input.ownerDeviceId) {
    return true
  }

  return !input.ownerPeerConnected
}

export function buildGroupChatRelayExcludeDeviceIds(
  localDeviceId: string,
  senderDeviceId: string,
): Set<string> {
  return new Set([localDeviceId, senderDeviceId])
}
