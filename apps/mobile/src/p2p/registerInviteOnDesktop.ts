import {
  isOfficialCommunityHubHost,
  hostnameOfBaseUrl,
  type P2pJoinRegisterOutput,
} from '@toolman/shared'
import { ToolmanSyncClient } from '@toolman/sync-client'
import { getMobileSyncBaseUrl } from '../sync/mobileSync'
import { boundFetch, localNetworkRequestTimeoutMs } from '../sync/localNetworkFetch'
import type { InviteSelf } from './applyInvite'
import type { PendingP2pInvite } from './inviteParse'
import { loadOrCreateDeviceKeys } from './deviceKeys'
import { listRegisterHubCandidates } from './registerHubs'
import { localP2pClientDeviceKind } from './deviceKind'

export { listRegisterHubCandidates } from './registerHubs'

export type RegisterInviteResult =
  | { ok: true; data: P2pJoinRegisterOutput; hubUrl: string }
  | { ok: false; message: string }

function isUsableOwnerHub(baseUrl: string): boolean {
  return !isOfficialCommunityHubHost(hostnameOfBaseUrl(baseUrl))
}

async function probeHub(baseUrl: string): Promise<boolean> {
  const origin = baseUrl.replace(/\/+$/, '')
  const ctrl = new AbortController()
  const timer = setTimeout(
    () => ctrl.abort(),
    localNetworkRequestTimeoutMs(`${origin}/health`),
  )
  try {
    const res = await boundFetch(`${origin}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function registerPendingInviteOnDesktop(input: {
  invite: PendingP2pInvite
  self: InviteSelf
}): Promise<RegisterInviteResult> {
  const extra = isUsableOwnerHub(getMobileSyncBaseUrl()) ? getMobileSyncBaseUrl() : null
  const candidates = listRegisterHubCandidates(input.invite.hubUrls, extra)
  if (candidates.length === 0) {
    return {
      ok: false,
      message: '邀请里没有群主电脑地址。请让对方重新生成邀请，并开启「允许局域网访问」。',
    }
  }

  const keys = await loadOrCreateDeviceKeys()
  const body = {
    inviteToken: input.invite.raw || input.invite.token,
    displayName: input.self.displayName,
    deviceId: input.self.deviceId,
    identityId: input.self.identityId,
    deviceKind: localP2pClientDeviceKind(),
    publicKeyB64: keys?.publicKeyB64,
  }

  const errors: string[] = []
  for (const hubUrl of candidates) {
    if (!(await probeHub(hubUrl))) {
      errors.push(`${hubUrl} 不可达`)
      continue
    }
    try {
      const client = new ToolmanSyncClient({
        baseUrl: hubUrl,
        getAccessToken: async () => null,
        fetchImpl: boundFetch,
      })
      const data = await client.registerInvitedMember(body)
      return { ok: true, data, hubUrl }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    ok: false,
    message:
      errors[0] ??
      '无法连上群主电脑。请确认双方在同一局域网 / Tailscale，且对方已开启移动端同步。',
  }
}
