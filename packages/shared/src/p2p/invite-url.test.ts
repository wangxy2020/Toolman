import { describe, expect, it } from 'vitest'
import {
  WAN_COMPRESSED_PAYLOAD_PREFIX,
  WAN_RAW_PAYLOAD_PREFIX,
  isToolmanInviteInput,
  parseToolmanInviteUrl,
  peekInviteTokenFields,
  resolveInvitePreview,
  tryParseToolmanInviteUrl,
} from './invite-url.js'

function encodeRawInviteJson(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload)
  const b64 = Buffer.from(json, 'utf8').toString('base64url')
  return `${WAN_RAW_PAYLOAD_PREFIX}${b64}`
}

describe('parseToolmanInviteUrl', () => {
  it('reads token and preview fields from toolman://join', () => {
    const parsed = parseToolmanInviteUrl(
      'toolman://join?token=abc123&name=%E9%A1%B9%E7%9B%AE%E7%BB%84&wid=ws-1&hub=http://192.168.1.8:17890',
    )
    expect(parsed.token).toBe('abc123')
    expect(parsed.workspaceId).toBe('ws-1')
    expect(parsed.workspaceName).toBe('项目组')
    expect(parsed.hubUrls).toEqual(['http://192.168.1.8:17890'])
  })

  it('reads compressed WAN bundles without unpacking', () => {
    const parsed = parseToolmanInviteUrl('toolman://join?z=z1.bundle&name=Alpha')
    expect(parsed.token).toBe('')
    expect(parsed.bundled).toBe('z1.bundle')
    expect(parsed.workspaceName).toBe('Alpha')
  })

  it('accepts https join links and raw tokens', () => {
    expect(parseToolmanInviteUrl('https://hub.toolman.app/join?inv=tok-9').token).toBe('tok-9')
    expect(parseToolmanInviteUrl('plain-token').token).toBe('plain-token')
  })

  it('rejects empty input and urls without a token', () => {
    expect(() => parseToolmanInviteUrl('   ')).toThrow('邀请码不能为空')
    expect(() => parseToolmanInviteUrl('https://example.com/app')).toThrow('邀请链接缺少 token 参数')
  })
})

describe('invite input guards', () => {
  it('accepts scheme, query, and encoded blobs only', () => {
    expect(isToolmanInviteInput('toolman://join?token=a')).toBe(true)
    expect(isToolmanInviteInput('https://x.test/?z=z1.x')).toBe(true)
    expect(isToolmanInviteInput(`${WAN_COMPRESSED_PAYLOAD_PREFIX}abc`)).toBe(true)
    expect(isToolmanInviteInput('not-an-invite')).toBe(false)
    expect(tryParseToolmanInviteUrl('https://example.com')).toBeNull()
  })
})

describe('peekInviteTokenFields', () => {
  it('reads r1 JSON without node gzip', () => {
    const token = encodeRawInviteJson({
      workspaceId: 'ws-9',
      workspaceName: 'Desk',
      ownerIdentityId: 'id-a',
      ownerDeviceId: 'dev-a',
      ownerDisplayName: 'A',
      role: 'member',
      expiresAt: 99,
    })
    expect(peekInviteTokenFields(token)).toEqual({
      workspaceId: 'ws-9',
      workspaceName: 'Desk',
      ownerIdentityId: 'id-a',
      ownerDeviceId: 'dev-a',
      ownerDisplayName: 'A',
      role: 'member',
      expiresAt: 99,
    })
  })

  it('reads workspaceKeyB64 when present', () => {
    const token = encodeRawInviteJson({
      workspaceId: 'ws-9',
      workspaceKeyB64: 'dGVzdC1rZXk',
    })
    expect(peekInviteTokenFields(token)?.workspaceKeyB64).toBe('dGVzdC1rZXk')
  })

  it('marks z1 tokens as compressed', () => {
    expect(peekInviteTokenFields(`${WAN_COMPRESSED_PAYLOAD_PREFIX}deadbeef`)).toEqual({
      compressed: true,
    })
  })

  it('prefers URL preview fields over peeked token', () => {
    const token = encodeRawInviteJson({ workspaceId: 'from-token', workspaceName: 'TokenName' })
    const preview = resolveInvitePreview(`toolman://join?token=${token}&wid=from-url&name=UrlName`)
    expect(preview.workspaceId).toBe('from-url')
    expect(preview.workspaceName).toBe('UrlName')
  })
})
