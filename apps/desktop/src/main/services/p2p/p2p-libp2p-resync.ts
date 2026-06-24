import { recordDiagnosticEvent } from '../diagnostics-log'
import { resubscribeCommunityCidPubsub } from '../community/community-cid-provider.service'
import { resubscribeCommunityYjsPubsub } from '../community/community-yjs-provider'
import { registerLibp2pRestartListener } from './p2p-libp2p-restart'

let registered = false

export function ensureLibp2pDependentPubsubResync(): void {
  if (registered) return
  registered = true

  registerLibp2pRestartListener(async () => {
    resubscribeCommunityYjsPubsub()
    await resubscribeCommunityCidPubsub()
    recordDiagnosticEvent('libp2p', 'info', 'resynced community pubsub subscriptions')
  })
}
