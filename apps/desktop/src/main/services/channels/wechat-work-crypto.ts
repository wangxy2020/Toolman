import { createDecipheriv, createHash } from 'node:crypto'

function pkcs7Decode(buffer: Buffer): Buffer {
  const pad = buffer[buffer.length - 1]
  if (!pad || pad < 1 || pad > 32) return buffer
  return buffer.subarray(0, buffer.length - pad)
}

function sha1Signature(parts: string[]): string {
  return createHash('sha1').update(parts.sort().join('')).digest('hex')
}

export class WechatWorkCrypto {
  private readonly aesKey: Buffer

  constructor(
    private readonly token: string,
    encodingAesKey: string,
    private readonly corpId: string,
  ) {
    this.aesKey = Buffer.from(`${encodingAesKey}=`, 'base64')
    if (this.aesKey.length !== 32) {
      throw new Error('企业微信 EncodingAESKey 无效')
    }
  }

  verifyUrl(signature: string, timestamp: string, nonce: string, echostr: string): string {
    const expected = sha1Signature([this.token, timestamp, nonce, echostr])
    if (expected !== signature) {
      throw new Error('企业微信 URL 签名校验失败')
    }
    return this.decrypt(echostr)
  }

  decryptMessage(signature: string, timestamp: string, nonce: string, encrypt: string): string {
    const expected = sha1Signature([this.token, timestamp, nonce, encrypt])
    if (expected !== signature) {
      throw new Error('企业微信消息签名校验失败')
    }
    return this.decrypt(encrypt)
  }

  private decrypt(encrypted: string): string {
    const cipher = Buffer.from(encrypted, 'base64')
    const iv = this.aesKey.subarray(0, 16)
    const decipher = createDecipheriv('aes-256-cbc', this.aesKey, iv)
    decipher.setAutoPadding(false)
    const decrypted = pkcs7Decode(
      Buffer.concat([decipher.update(cipher), decipher.final()]),
    )
    const content = decrypted.subarray(16)
    const msgLen = content.readUInt32BE(0)
    const xml = content.subarray(4, 4 + msgLen).toString('utf8')
    const fromCorpId = content.subarray(4 + msgLen).toString('utf8')
    if (fromCorpId && fromCorpId !== this.corpId) {
      throw new Error('企业微信 CorpID 不匹配')
    }
    return xml
  }
}

export function readXmlTag(xml: string, tag: string): string {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(xml)
  if (cdata?.[1] !== undefined) return cdata[1]
  const plain = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)
  return plain?.[1]?.trim() ?? ''
}
