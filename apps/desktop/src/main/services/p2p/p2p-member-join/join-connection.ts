import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../../structured-log.service'
import * as p2pConnectionService from '../p2p-connection.service'
import { isP2pDiscoveryRunning, startP2pDiscovery } from '../p2p-discovery.service'
import { P2pBridge } from '../p2p-bridge'
import { applyP2pNetworkConfig, getP2pWanNetworkReadiness } from '../p2p-network.config'
import { ensureWorkspaceKeyFromInvite } from '../p2p-workspace-key.store'
import { countWanSdpCandidates } from '../wan-transport'
import type { decodeInviteToken } from '../p2p-invite.token'
import { sleep } from './utils'

type InvitePayload = ReturnType<typeof decodeInviteToken>

export async function connectToOwnerPeer(
  ownerDeviceId: string,
  workspaceId: string,
  context: string,
  workspaceKeyB64?: string,
): Promise<boolean> {
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  try {
    await p2pConnectionService.ensurePeerReadyForWorkspace(ownerDeviceId, workspaceId, {
      workspaceKeyB64,
    })
    return p2pConnectionService.isPeerConnected(ownerDeviceId)
  } catch (error) {
    const message = toErrorMessage(error, 'connect owner failed')
    logStructured('p2p', 'warn', `${context}: ${message}`)
    return false
  }
}

export async function isOwnerPeerConnected(ownerDeviceId: string): Promise<boolean> {
  if (
    p2pConnectionService
      .getKnownP2pConnections()
      .some((item) => item.peerDeviceId === ownerDeviceId && item.state === 'connected')
  ) {
    return true
  }

  const connections = await p2pConnectionService.listP2pConnections()
  return connections.some(
    (item) => item.peerDeviceId === ownerDeviceId && item.state === 'connected',
  )
}

async function tryLanConnectToOwner(payload: InvitePayload): Promise<boolean> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (
      await connectToOwnerPeer(
        payload.ownerDeviceId,
        payload.workspaceId,
        'LAN connect during join failed',
        payload.workspaceKeyB64,
      )
    ) {
      return true
    }
    await sleep(500)
  }
  return false
}

export async function ensureJoinPeerConnection(
  payload: InvitePayload,
  offerSdp: string | undefined,
): Promise<{ connected: boolean; lastError?: string }> {
  ensureWorkspaceKeyFromInvite(payload)
  applyP2pNetworkConfig()
  if (!isP2pDiscoveryRunning()) {
    startP2pDiscovery()
  }
  p2pConnectionService.startP2pConnectionMonitor()

  let lastError: string | undefined

  // 局域网/WebRTC：双方都应调用 connect，Rust 按 deviceId 决定 offerer/answerer
  if (await tryLanConnectToOwner(payload)) {
    return { connected: true }
  }
  lastError = '局域网连接失败'

  const hasIceCandidates = offerSdp ? countWanSdpCandidates(offerSdp) > 0 : false
  if (offerSdp && hasIceCandidates) {
    const wanReady = getP2pWanNetworkReadiness()
    if (!wanReady.ready) {
      lastError = wanReady.reason ?? '广域网网络未就绪'
      logStructured('p2p', 'warn', `WAN invite connect blocked: ${lastError}`)
    } else {
      try {
        await P2pBridge.inviteConnectAsJoiner(
          payload.ownerDeviceId,
          payload.workspaceId,
          offerSdp,
          payload.inviteId,
        )
        if (await isOwnerPeerConnected(payload.ownerDeviceId)) {
          return { connected: true }
        }
        lastError = '邀请链路未建立连接'
      } catch (error) {
        lastError = toErrorMessage(error, '邀请链路连接失败')
        logStructured('p2p', 'warn', `WAN invite connect failed: ${lastError}`)
      }
    }
  } else if (offerSdp) {
    lastError = '邀请 SDP 不含 ICE 候选，无法广域网打洞'
    logStructured('p2p', 'warn', `skipping WAN invite connect: no ICE candidates in offer`)
  }

  return { connected: false, lastError }
}
