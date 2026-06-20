import { createHash, createHmac } from 'node:crypto'

function sha256Hex(message: string): string {
  return createHash('sha256').update(message).digest('hex')
}

function hmacSha256(key: Buffer | string, message: string): Buffer {
  return createHmac('sha256', key).update(message).digest()
}

export function signTencentCloudRequest(input: {
  secretId: string
  secretKey: string
  service: string
  host: string
  region: string
  action: string
  version: string
  payload: string
  timestamp: number
}): Record<string, string> {
  const date = new Date(input.timestamp * 1000).toISOString().slice(0, 10)
  const credentialScope = `${date}/${input.service}/tc3_request`

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${input.host}\n`
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    'content-type;host',
    sha256Hex(input.payload),
  ].join('\n')

  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(input.timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const secretDate = hmacSha256(`TC3${input.secretKey}`, date)
  const secretService = hmacSha256(secretDate, input.service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = hmacSha256(secretSigning, stringToSign).toString('hex')

  return {
    Authorization: `TC3-HMAC-SHA256 Credential=${input.secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`,
    'Content-Type': 'application/json; charset=utf-8',
    Host: input.host,
    'X-TC-Action': input.action,
    'X-TC-Timestamp': String(input.timestamp),
    'X-TC-Version': input.version,
    'X-TC-Region': input.region,
  }
}
