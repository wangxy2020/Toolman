const MAX_CONCURRENT_COMMUNITY_REQUESTS = 4
let activeCommunityRequests = 0
const pendingCommunityRequests: Array<() => void> = []

export async function acquireCommunityRequestSlot(): Promise<void> {
  if (activeCommunityRequests < MAX_CONCURRENT_COMMUNITY_REQUESTS) {
    activeCommunityRequests += 1
    return
  }

  await new Promise<void>((resolve) => {
    pendingCommunityRequests.push(() => {
      activeCommunityRequests += 1
      resolve()
    })
  })
}

export function releaseCommunityRequestSlot(): void {
  activeCommunityRequests = Math.max(0, activeCommunityRequests - 1)
  const next = pendingCommunityRequests.shift()
  next?.()
}
