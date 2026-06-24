import * as Y from 'yjs'
import {
  communityYjsTopicForDomain,
  parseCommunityYjsWireMessage,
  type CommunityBoardMessage,
  type CommunityUserProfile,
  type CommunityYjsDomain,
} from '@toolman/shared'
import { recordDiagnosticEvent } from '../diagnostics-log'
import { getP2pDeviceId } from '../p2p/p2p-device-identity.service'
import { Libp2pBridge } from '../p2p/libp2p-bridge'
import { isCommunityYjsEnabled, isCommunityYjsRequireSignedUpdates } from './community-yjs.config'
import { getBlockedDidCount } from './community-federated-trust.service'
import {
  getCommunityYjsSigningStats,
  getLocalCommunityDid,
  recordRejectedUnsignedCommunityUpdate,
  signCommunityYjsWireMessage,
  verifyCommunityYjsSignedWireMessage,
} from './community-yjs-signing.service'
import {
  applyCommunityDocUpdate,
  deleteLwwEntity,
  encodeCommunityDocUpdate,
  getCommunityEntityMap,
  observeCommunityDoc,
  parseCommunityDomainFromTopic,
  upsertLwwEntity,
  type LwwEntityRecord,
  YJS_ORIGIN_LOCAL,
  YJS_ORIGIN_REMOTE,
} from './community-yjs-store'
import { broadcastCommunityYjsUpdate } from './community-yjs-broadcast'

const ALL_DOMAINS: CommunityYjsDomain[] = ['profiles', 'board', 'comments', 'tasks']

let started = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeDocListeners: Array<() => void> = []
let lastError: string | null = null

function publishDomainUpdate(domain: CommunityYjsDomain, update: Uint8Array): void {
  if (!Libp2pBridge.isAvailable() || !Libp2pBridge.networkIsRunning()) return

  const at = Date.now()
  const wire = signCommunityYjsWireMessage({
    domain,
    update: Buffer.from(update).toString('base64'),
    originPeerId: Libp2pBridge.networkLocalPeerId() ?? undefined,
    at,
  })

  Libp2pBridge.pubsubPublish(
    communityYjsTopicForDomain(domain),
    Buffer.from(JSON.stringify(wire), 'utf8'),
  )
}

function handleIncomingWire(raw: Buffer, topic: string): void {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw.toString('utf8'))
  } catch {
    return
  }

  const parsed = parseCommunityYjsWireMessage(parsedJson)
  if (parsed.kind === 'invalid') return

  if (parsed.kind === 'legacy') {
    if (isCommunityYjsRequireSignedUpdates()) {
      recordRejectedUnsignedCommunityUpdate()
      recordDiagnosticEvent('community-yjs', 'warn', `rejected unsigned v1 update on ${topic}`)
      return
    }

    const domainFromTopic = parseCommunityDomainFromTopic(topic)
    if (domainFromTopic && domainFromTopic !== parsed.message.domain) return

    const update = Buffer.from(parsed.message.update, 'base64')
    applyCommunityDocUpdate(parsed.message.domain, update, YJS_ORIGIN_REMOTE)
    return
  }

  const domainFromTopic = parseCommunityDomainFromTopic(topic)
  if (domainFromTopic && domainFromTopic !== parsed.message.domain) return

  const verified = verifyCommunityYjsSignedWireMessage(parsed.message)
  if (!verified.ok) {
    recordDiagnosticEvent('community-yjs', 'warn', `reject signed update: ${verified.reason}`)
    return
  }

  const update = Buffer.from(verified.message.update, 'base64')
  applyCommunityDocUpdate(verified.message.domain, update, YJS_ORIGIN_REMOTE)
}

function pollPubsubInbox(): void {
  if (!Libp2pBridge.isAvailable()) return

  try {
    const messages = Libp2pBridge.pubsubDrainMessages()
    for (const message of messages) {
      handleIncomingWire(Buffer.from(message.data), message.topic)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    lastError = message
    recordDiagnosticEvent('community-yjs', 'warn', message)
  }
}

function attachDomainListeners(): void {
  for (const domain of ALL_DOMAINS) {
    const stopDoc = observeCommunityDoc(domain, (update, origin) => {
      if (origin === YJS_ORIGIN_REMOTE) return
      publishDomainUpdate(domain, update)
    })
    unsubscribeDocListeners.push(stopDoc)

    const map = getCommunityEntityMap(domain)
    const observer = (event: Y.YMapEvent<unknown>) => {
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'delete') {
          broadcastCommunityYjsUpdate({
            domain,
            entityId: key,
            action: 'delete',
            updatedAt: Date.now(),
          })
          return
        }
        const record = map.get(key) as LwwEntityRecord | undefined
        if (!record?.payload) return
        broadcastCommunityYjsUpdate({
          domain,
          entityId: key,
          action: 'upsert',
          entity: record.payload,
          updatedAt: record.updatedAt,
        })
      })
    }
    map.observe(observer)
    unsubscribeDocListeners.push(() => map.unobserve(observer))
  }
}

export function startCommunityYjsProvider(): void {
  if (started || !isCommunityYjsEnabled()) return
  if (!Libp2pBridge.isAvailable()) {
    lastError = 'libp2p native module unavailable'
    return
  }

  started = true
  attachDomainListeners()
  subscribeCommunityYjsTopics()

  pollTimer = setInterval(() => {
    pollPubsubInbox()
  }, 2_000)

  recordDiagnosticEvent('community-yjs', 'info', 'provider started')
}

function subscribeCommunityYjsTopics(): void {
  for (const domain of ALL_DOMAINS) {
    try {
      Libp2pBridge.pubsubSubscribe(communityYjsTopicForDomain(domain))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastError = message
      recordDiagnosticEvent('community-yjs', 'warn', `subscribe ${domain}: ${message}`)
    }
  }
}

export function resubscribeCommunityYjsPubsub(): void {
  if (!started || !isCommunityYjsEnabled()) return
  if (!Libp2pBridge.isAvailable() || !Libp2pBridge.networkIsRunning()) return
  subscribeCommunityYjsTopics()
  recordDiagnosticEvent('community-yjs', 'info', 'resubscribed pubsub after libp2p restart')
}

export function stopCommunityYjsProvider(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  for (const stop of unsubscribeDocListeners) {
    stop()
  }
  unsubscribeDocListeners = []

  if (Libp2pBridge.isAvailable()) {
    for (const domain of ALL_DOMAINS) {
      try {
        Libp2pBridge.pubsubUnsubscribe(communityYjsTopicForDomain(domain))
      } catch {
        // ignore shutdown errors
      }
    }
  }

  started = false
}

export function getCommunityYjsProviderStatus() {
  const signingStats = getCommunityYjsSigningStats()
  return {
    enabled: isCommunityYjsEnabled(),
    running: started,
    subscribedDomains: started ? [...ALL_DOMAINS] : [],
    localPeerId: Libp2pBridge.isAvailable() ? Libp2pBridge.networkLocalPeerId() : null,
    localDid: getLocalCommunityDid(),
    requireSignedUpdates: isCommunityYjsRequireSignedUpdates(),
    acceptedSignedUpdates: signingStats.acceptedSignedUpdates,
    rejectedUnsignedUpdates: signingStats.rejectedUnsignedUpdates,
    verifyFailures: signingStats.verifyFailures,
    blockedDidCount: getBlockedDidCount(),
    lastError,
  }
}

export function publishCommunityDomainSnapshot(domain: CommunityYjsDomain): void {
  if (!started) return
  const update = encodeCommunityDocUpdate(domain)
  publishDomainUpdate(domain, update)
}

export function syncCommunityBoardMessageToYjs(message: CommunityBoardMessage): void {
  if (!isCommunityYjsEnabled()) return

  upsertLwwEntity(
    'board',
    message.id,
    message as unknown as Record<string, unknown>,
    {
      updatedAt: message.updatedAt,
      authorDeviceId: getP2pDeviceId(),
    },
    YJS_ORIGIN_LOCAL,
  )
}

export function removeCommunityBoardMessageFromYjs(messageId: string): void {
  if (!isCommunityYjsEnabled()) return

  deleteLwwEntity(
    'board',
    messageId,
    { updatedAt: Date.now() },
    YJS_ORIGIN_LOCAL,
  )
}

export function syncCommunityProfileToYjs(profile: CommunityUserProfile): void {
  if (!isCommunityYjsEnabled()) return

  upsertLwwEntity(
    'profiles',
    profile.id,
    profile as unknown as Record<string, unknown>,
    {
      updatedAt: profile.updatedAt,
      authorDeviceId: getP2pDeviceId(),
    },
    YJS_ORIGIN_LOCAL,
  )
}
