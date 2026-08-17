import {
  DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
  OFFICIAL_TOOLMAN_HUB_URL,
  P2P_MAILBOX_PULL_PATH,
  P2P_MAILBOX_PUT_PATH,
  P2pMailboxPullOutputSchema,
  buildMailboxGrant,
  hostnameOfBaseUrl,
  isOfficialCommunityHubHost,
  toErrorMessage,
  type P2pMailboxEnvelope,
} from '@toolman/shared'
import { resolveCommunityHubBaseUrl } from '../community/community-hub.config'
import { logStructured } from '../structured-log.service'

function mailboxHubCandidates(): string[] {
  const remote = resolveCommunityHubBaseUrl()
  if (remote) return [remote]
  return [DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL, OFFICIAL_TOOLMAN_HUB_URL]
}

async function hubHasMailbox(baseUrl: string): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2500)
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/v1/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    })
    if (!res.ok) return false
    const json = (await res.json()) as { data?: { workspace_mailbox?: boolean } }
    return json.data?.workspace_mailbox === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function depositCiphertextToCommunityMailbox(input: {
  workspaceId: string
  senderDeviceId: string
  recipientDeviceId: string
  workspaceKey: Uint8Array
  ciphertextB64: string
  seq: number
}): Promise<void> {
  const grant = await buildMailboxGrant({
    workspaceKey: input.workspaceKey,
    workspaceId: input.workspaceId,
    deviceId: input.recipientDeviceId,
  })
  const body = JSON.stringify({
    workspaceId: input.workspaceId,
    deviceId: input.senderDeviceId,
    recipientDeviceId: input.recipientDeviceId,
    grant,
    ciphertextB64: input.ciphertextB64,
    seq: input.seq,
  })
  for (const baseUrl of mailboxHubCandidates()) {
    if (!(await hubHasMailbox(baseUrl))) continue
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${P2P_MAILBOX_PUT_PATH}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) continue
      logStructured(
        'p2p',
        'warn',
        `community mailbox put ${hostnameOfBaseUrl(baseUrl)} status=${res.status}`,
      )
    } catch (error) {
      const host = hostnameOfBaseUrl(baseUrl)
      logStructured(
        'p2p',
        'warn',
        `community mailbox put ${isOfficialCommunityHubHost(host) ? 'official' : host}: ${toErrorMessage(error, String(error))}`,
      )
    }
  }
}

export async function pullCommunityMailboxEnvelopes(input: {
  workspaceId: string
  deviceId: string
  workspaceKey: Uint8Array
  sinceSeq: number
}): Promise<P2pMailboxEnvelope[]> {
  const grant = await buildMailboxGrant({
    workspaceKey: input.workspaceKey,
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
  })
  const body = JSON.stringify({
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
    grant,
    sinceSeq: input.sinceSeq,
    limit: 100,
  })
  const collected: P2pMailboxEnvelope[] = []
  const seen = new Set<string>()
  for (const baseUrl of mailboxHubCandidates()) {
    if (!(await hubHasMailbox(baseUrl))) continue
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${P2P_MAILBOX_PULL_PATH}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body,
      })
      if (!res.ok) continue
      const json: unknown = await res.json().catch(() => null)
      const data =
        json && typeof json === 'object' && 'data' in json
          ? (json as { data: unknown }).data
          : json
      const parsed = P2pMailboxPullOutputSchema.safeParse(data)
      if (!parsed.success) continue
      for (const envelope of parsed.data.envelopes) {
        const key = `${envelope.seq}:${envelope.ciphertextB64}`
        if (seen.has(key)) continue
        seen.add(key)
        collected.push(envelope)
      }
    } catch (error) {
      const host = hostnameOfBaseUrl(baseUrl)
      logStructured(
        'p2p',
        'warn',
        `community mailbox pull ${isOfficialCommunityHubHost(host) ? 'official' : host}: ${toErrorMessage(error, String(error))}`,
      )
    }
  }
  return collected.sort((a, b) => a.seq - b.seq)
}
