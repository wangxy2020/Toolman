import {
  bytesEqual,
  decodeWorkspaceKeyB64,
  decryptP2pChannelPayload,
  DEFAULT_STUN_URLS,
  describeP2pJoinFailure,
  encryptP2pChannelPayload,
  iceServersHaveTurn,
  P2P_EVENTS_CHANNEL,
  P2P_FILES_CHANNEL,
  P2P_HANDSHAKE_PING,
  P2P_HANDSHAKE_PONG,
  type P2pIceServer,
} from '@toolman/shared'
import { ToolmanSyncClient } from '@toolman/sync-client'
import { boundFetch } from '../sync/localNetworkFetch'
import { messageToBytes, toArrayBuffer } from './bytes'
import { startMeshHandshake } from './groupChatMesh'
import {
  attachIncomingChannel,
  closeLiveSession,
  createLiveSession,
  getLiveJoinCount as getSessionCount,
  markSessionConnected,
} from './session'

const ICE_GATHER_TIMEOUT_MS = 12_000
const HANDSHAKE_TIMEOUT_MS = 30_000

export function canJoinViaWebRtc(): boolean {
  return typeof globalThis.RTCPeerConnection === 'function'
}

export function stripToolmanSignalLines(sdp: string): string {
  return sdp
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('a=toolman-sig:'))
    .join('\r\n')
}

function toRtcIceServers(servers: P2pIceServer[] | undefined): RTCIceServer[] {
  const list: P2pIceServer[] = servers?.length
    ? servers
    : DEFAULT_STUN_URLS.map((urls) => ({ urls }))
  return list.map((server) => ({
    urls: server.urls,
    username: server.username,
    credential: server.credential,
  }))
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = ICE_GATHER_TIMEOUT_MS): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    const timer = setTimeout(finish, timeoutMs)
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

export function getLiveJoinCount(): number {
  return getSessionCount()
}

export async function joinOwnerViaWebRtc(input: {
  hubUrl: string
  inviteToken: string
  deviceId: string
  identityId?: string
  displayName?: string
  memberId: string
  ownerDeviceId: string
  workspaceId: string
  workspaceKeyB64: string
  offerSdp: string
  iceServers?: P2pIceServer[]
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!canJoinViaWebRtc()) {
    return { ok: false, message: '当前环境没有 WebRTC，请用 Expo web 完成直连' }
  }

  const workspaceKey = decodeWorkspaceKeyB64(input.workspaceKeyB64)
  const pc = new RTCPeerConnection({ iceServers: toRtcIceServers(input.iceServers) })
  const session = createLiveSession({
    workspaceId: input.workspaceId,
    ownerDeviceId: input.ownerDeviceId,
    deviceId: input.deviceId,
    memberId: input.memberId,
    displayName: input.displayName?.trim() || '成员',
    workspaceKey,
    pc,
  })

  const handshake = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待群主握手超时')), HANDSHAKE_TIMEOUT_MS)
    pc.ondatachannel = (event) => {
      const channel = event.channel
      attachIncomingChannel(session, channel)
      if (channel.label === P2P_FILES_CHANNEL) return
      if (channel.label !== P2P_EVENTS_CHANNEL) return
      const previous = channel.onmessage
      channel.onmessage = (messageEvent) => {
        void (async () => {
          try {
            const envelope = await messageToBytes(messageEvent.data)
            const plain = await decryptP2pChannelPayload({
              workspaceKey,
              workspaceId: input.workspaceId,
              channel: P2P_EVENTS_CHANNEL,
              envelope,
            })
            if (bytesEqual(plain, P2P_HANDSHAKE_PING)) {
              const pong = await encryptP2pChannelPayload({
                workspaceKey,
                workspaceId: input.workspaceId,
                channel: P2P_EVENTS_CHANNEL,
                plaintext: P2P_HANDSHAKE_PONG,
              })
              channel.send(toArrayBuffer(pong))
              clearTimeout(timer)
              channel.onmessage = previous
              resolve()
              return
            }
          } catch {
            // fall through to mesh handler
          }
          if (typeof previous === 'function') previous.call(channel, messageEvent)
        })()
      }
    }
  })

  try {
    await pc.setRemoteDescription({
      type: 'offer',
      sdp: stripToolmanSignalLines(input.offerSdp),
    })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceGathering(pc)
    const answerSdp = pc.localDescription?.sdp
    if (!answerSdp) throw new Error('未能生成 WebRTC 应答')

    const client = new ToolmanSyncClient({
      baseUrl: input.hubUrl,
      getAccessToken: async () => null,
      fetchImpl: boundFetch,
    })
    await client.submitInviteAnswer({
      inviteToken: input.inviteToken,
      answerSdp,
      deviceId: input.deviceId,
      identityId: input.identityId,
      displayName: input.displayName,
    })
    await handshake
    await startMeshHandshake(session)
    markSessionConnected(input.workspaceId)
    return { ok: true }
  } catch (error) {
    closeLiveSession(input.workspaceId)
    return {
      ok: false,
      message: describeP2pJoinFailure({
        message: error instanceof Error ? error.message : String(error),
        hasTurn: iceServersHaveTurn(input.iceServers),
      }),
    }
  }
}
