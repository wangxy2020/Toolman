import { constants, gunzipSync, gzipSync } from 'node:zlib'

/** 压缩后 SDP 参数目标体积（字节），用于控制二维码密度 */
export const WAN_COMPRESSED_SDP_TARGET_BYTES = 150

export const WAN_PAYLOAD_PREFIX = 'z1.'
export const WAN_RAW_PAYLOAD_PREFIX = 'r1.'

const AUDIO_VIDEO_MEDIA_RE = /^m=(audio|video)\b/i

const WAN_SDP_KEEP_PREFIXES = [
  'v=0',
  'o=',
  's=',
  't=',
  'a=group:',
  'm=application',
  'a=setup:',
  'a=mid:',
  'a=ice-ufrag:',
  'a=ice-pwd:',
  'a=fingerprint:',
  'a=sctp',
  'a=max-message',
  'a=toolman-sig:',
  'a=candidate:',
  'a=end-of-candidates',
] as const

export interface WanInviteBundle {
  t: string
  d: string
}

/** 过滤 SDP 中 audio / video 媒体段及其下属属性行 */
export function filterWanSdpMedia(sdp: string): string {
  const lines = sdp.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const kept: string[] = []
  let skipping = false

  for (const line of lines) {
    if (AUDIO_VIDEO_MEDIA_RE.test(line)) {
      skipping = true
      continue
    }
    if (/^m=\S+/i.test(line)) {
      skipping = false
    }
    if (!skipping) {
      kept.push(line)
    }
  }

  let normalized = kept.join('\r\n')
  if (!normalized.endsWith('\r\n')) {
    normalized += '\r\n'
  }
  return normalized
}

/** 仅保留广域网打洞 / DataChannel 建立所需 SDP 行 */
export function minifyWanSdpEssentials(sdp: string): string {
  const filtered = filterWanSdpMedia(sdp)
  const kept = filtered
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => WAN_SDP_KEEP_PREFIXES.some((prefix) => line.startsWith(prefix)))

  let normalized = kept.join('\r\n')
  if (!normalized.endsWith('\r\n')) {
    normalized += '\r\n'
  }
  return normalized
}

export function gzipCompressWanPayload(data: Buffer): Buffer {
  return gzipSync(data, { level: constants.Z_BEST_COMPRESSION })
}

export function gzipDecompressWanPayload(data: Buffer): Buffer {
  return gunzipSync(data)
}

export function encodeWanBlob(data: Buffer): string {
  const gzipped = gzipCompressWanPayload(data)
  if (gzipped.length < data.length) {
    return WAN_PAYLOAD_PREFIX + gzipped.toString('base64url')
  }
  return WAN_RAW_PAYLOAD_PREFIX + data.toString('base64url')
}

export function decodeWanBlob(encoded: string): Buffer {
  const trimmed = encoded.trim()
  if (trimmed.startsWith(WAN_PAYLOAD_PREFIX)) {
    return gzipDecompressWanPayload(
      Buffer.from(trimmed.slice(WAN_PAYLOAD_PREFIX.length), 'base64url'),
    )
  }
  if (trimmed.startsWith(WAN_RAW_PAYLOAD_PREFIX)) {
    return Buffer.from(trimmed.slice(WAN_RAW_PAYLOAD_PREFIX.length), 'base64url')
  }

  if (trimmed.startsWith('v=0')) {
    return Buffer.from(trimmed, 'utf8')
  }

  return Buffer.from(trimmed, 'base64url')
}

function listCandidateLines(sdp: string): string[] {
  return sdp.split(/\r?\n/).filter((line) => line.trim().startsWith('a=candidate:'))
}

function candidatePriority(line: string): number {
  const type = line.trim().split(/\s+/)[7] ?? ''
  if (type === 'srflx') return 0
  if (type === 'host') return 1
  if (type === 'prflx') return 2
  return 9
}

function trimSdpCandidates(sdp: string, maxCandidates: number): string {
  const lines = sdp.split(/\r?\n/)
  const candidateLines = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith('a=candidate:'))
    .sort((a, b) => candidatePriority(a) - candidatePriority(b))
    .filter((line) => candidatePriority(line) < 9)
    .slice(0, Math.max(0, maxCandidates))
  const keepCandidates = new Set(candidateLines)

  const kept: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('a=candidate:')) {
      if (keepCandidates.has(trimmed)) {
        kept.push(line)
      }
      continue
    }
    kept.push(line)
  }

  let normalized = kept.join('\r\n')
  if (!normalized.endsWith('\r\n')) {
    normalized += '\r\n'
  }
  return normalized
}

function stripOptionalWanLines(sdp: string): string {
  const kept = sdp
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter(
      (line) =>
        !line.startsWith('a=group:') &&
        !line.startsWith('a=fingerprint:') &&
        !line.startsWith('a=setup:') &&
        !line.startsWith('a=mid:'),
    )

  let normalized = kept.join('\r\n')
  if (!normalized.endsWith('\r\n')) {
    normalized += '\r\n'
  }
  return normalized
}

function fitEncodedPayloadBudget(
  buildPayload: (maxCandidates: number, stripOptional: boolean) => Buffer,
  initialCandidates: number,
  budgetBytes: number,
): string {
  let bestEncoded = encodeWanBlob(buildPayload(initialCandidates, false))

  for (const stripOptional of [false, true]) {
    let maxCandidates = initialCandidates
    while (maxCandidates >= 0) {
      const encoded = encodeWanBlob(buildPayload(maxCandidates, stripOptional))
      bestEncoded = encoded
      if (Buffer.byteLength(encoded, 'utf8') <= budgetBytes) {
        return encoded
      }
      maxCandidates -= 1
    }
  }

  return bestEncoded
}

export function encodeWanSdpParam(sdp: string): string {
  const minified = minifyWanSdpEssentials(sdp)
  const candidateCount = listCandidateLines(minified).length
  return fitEncodedPayloadBudget(
    (maxCandidates, stripOptional) => {
      const base = stripOptional ? stripOptionalWanLines(minified) : minified
      const trimmed =
        maxCandidates < candidateCount ? trimSdpCandidates(base, maxCandidates) : base
      return Buffer.from(trimmed, 'utf8')
    },
    candidateCount,
    WAN_COMPRESSED_SDP_TARGET_BYTES,
  )
}

export function decodeWanSdpParam(encoded: string): string {
  try {
    const text = decodeWanBlob(encoded).toString('utf8')
    if (text.startsWith('v=0')) {
      return text
    }
  } catch {
    // fall through to legacy plain base64 SDP
  }

  const legacy = Buffer.from(encoded.trim(), 'base64url').toString('utf8')
  if (legacy.startsWith('v=0')) {
    return legacy
  }

  throw new Error('邀请 SDP 格式无效')
}

export function packWanInviteBundle(token: string, offerSdp: string): string {
  const minified = minifyWanSdpEssentials(offerSdp)
  const candidateCount = listCandidateLines(minified).length
  let smallest = encodeWanBlob(
    Buffer.from(JSON.stringify({ t: token, d: minified } satisfies WanInviteBundle, 'utf8')),
  )

  for (let maxCandidates = candidateCount - 1; maxCandidates >= 0; maxCandidates -= 1) {
    const trimmed = trimSdpCandidates(minified, maxCandidates)
    const encoded = encodeWanBlob(
      Buffer.from(
        JSON.stringify({ t: token, d: trimmed } satisfies WanInviteBundle, 'utf8'),
      ),
    )
    if (Buffer.byteLength(encoded, 'utf8') < Buffer.byteLength(smallest, 'utf8')) {
      smallest = encoded
    }
  }

  return smallest
}

export function unpackWanInviteBundle(encoded: string): WanInviteBundle {
  const json = decodeWanBlob(encoded).toString('utf8')
  const parsed = JSON.parse(json) as Partial<WanInviteBundle>
  if (!parsed.t || !parsed.d) {
    throw new Error('无效的广域网邀请包')
  }
  return { t: parsed.t, d: parsed.d }
}
