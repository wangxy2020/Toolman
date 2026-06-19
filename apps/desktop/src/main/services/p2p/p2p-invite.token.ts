import type { P2pInvitableMemberRole } from '@toolman/shared'
import { signDeviceMessage, verifyDeviceMessage } from './p2p-crypto.service'
import {
  decodeWanBlob,
  encodeWanBlob,
  decodeWanSdpParam,
  encodeWanSdpParam,
  packWanInviteBundle,
  unpackWanInviteBundle,
} from './wan-transport'

export const INVITE_TOKEN_VERSION = 1

export interface InviteTokenPayload {
  v: typeof INVITE_TOKEN_VERSION
  inviteId: string
  workspaceId: string
  workspaceName: string
  workspaceDescription?: string | null
  ownerDeviceId: string
  ownerIdentityId: string
  ownerPublicKey: string
  workspaceKeyB64: string
  role: P2pInvitableMemberRole
  expiresAt: number
  maxUses: number
  issuerDeviceId: string
  issuerPublicKey: string
  signature: string
}

export function buildInviteCanonicalMessage(input: {
  inviteId: string
  workspaceId: string
  role: P2pInvitableMemberRole
  expiresAt: number
  maxUses: number
  issuerDeviceId: string
  workspaceKeyB64: string
}): string {
  return [
    'toolman-invite',
    `v${INVITE_TOKEN_VERSION}`,
    input.inviteId,
    input.workspaceId,
    input.role,
    String(input.expiresAt),
    String(input.maxUses),
    input.issuerDeviceId,
    input.workspaceKeyB64,
  ].join('|')
}

export function signInvitePayload(
  payload: Omit<InviteTokenPayload, 'signature'>,
): InviteTokenPayload {
  const canonical = buildInviteCanonicalMessage({
    inviteId: payload.inviteId,
    workspaceId: payload.workspaceId,
    role: payload.role,
    expiresAt: payload.expiresAt,
    maxUses: payload.maxUses,
    issuerDeviceId: payload.issuerDeviceId,
    workspaceKeyB64: payload.workspaceKeyB64,
  })
  const signature = signDeviceMessage(canonical)
  return { ...payload, signature }
}

export function encodeInviteToken(payload: InviteTokenPayload): string {
  return encodeWanBlob(Buffer.from(JSON.stringify(payload), 'utf8'))
}

export function decodeInviteToken(token: string): InviteTokenPayload {
  const normalized = extractInviteTokenFromInput(token)
  const json =
    normalized.startsWith('z1.') || normalized.startsWith('r1.')
      ? decodeWanBlob(normalized).toString('utf8')
      : Buffer.from(normalized, 'base64url').toString('utf8')
  const payload = JSON.parse(json) as InviteTokenPayload
  if (payload.v !== INVITE_TOKEN_VERSION) {
    throw new Error('不支持的邀请码版本')
  }
  return payload
}

export function verifyInviteToken(payload: InviteTokenPayload): void {
  const canonical = buildInviteCanonicalMessage({
    inviteId: payload.inviteId,
    workspaceId: payload.workspaceId,
    role: payload.role,
    expiresAt: payload.expiresAt,
    maxUses: payload.maxUses,
    issuerDeviceId: payload.issuerDeviceId,
    workspaceKeyB64: payload.workspaceKeyB64,
  })

  const valid = verifyDeviceMessage(
    canonical,
    payload.signature,
    payload.issuerPublicKey,
  )
  if (!valid) {
    throw new Error('邀请码签名无效')
  }

  if (payload.expiresAt <= Date.now()) {
    throw new Error('邀请码已过期')
  }
}

export function extractInviteTokenFromInput(input: string): string {
  return parseInviteInput(input).token
}

export function parseInviteInput(input: string): { token: string; offerSdp?: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('邀请码不能为空')
  }

  if (trimmed.startsWith('toolman://')) {
    const url = new URL(trimmed)
    const bundled = url.searchParams.get('z')
    if (bundled) {
      const { t, d } = unpackWanInviteBundle(bundled)
      return { token: t, offerSdp: d }
    }

    const token = url.searchParams.get('token') ?? url.searchParams.get('inv')
    if (!token) {
      throw new Error('邀请链接缺少 token 参数')
    }
    const sdpParam = url.searchParams.get('sdp')
    const offerSdp = sdpParam ? decodeInviteSdpParam(sdpParam) : undefined
    return { token, offerSdp }
  }

  return { token: trimmed }
}

export function decodeInviteSdpParam(encoded: string): string {
  return decodeWanSdpParam(encoded)
}

export function encodeInviteSdpParam(sdp: string): string {
  return encodeWanSdpParam(sdp)
}

export function buildInviteUrl(token: string, offerSdp?: string): string {
  const url = new URL('toolman://join')
  if (offerSdp) {
    url.searchParams.set('z', packWanInviteBundle(token, offerSdp))
    return url.toString()
  }
  url.searchParams.set('token', token)
  return url.toString()
}
