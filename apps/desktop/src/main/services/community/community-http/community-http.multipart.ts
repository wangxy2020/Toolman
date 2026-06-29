import { randomBytes } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { URL } from 'node:url'

/** node:http upload avoids Electron fetch multipart parsing issues with Axum. */
export async function postBuffer(
  url: string,
  headers: Headers,
  body: Buffer,
): Promise<{ status: number; text: string }> {
  const parsed = new URL(url)
  const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest
  const headerRecord = Object.fromEntries(headers.entries())

  return await new Promise((resolve, reject) => {
    const req = requestFn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: headerRecord,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

/** Manual multipart builder — Node/Electron fetch + FormData often breaks Axum parsing. */
export function buildMultipartBody(
  fields: Array<{ name: string; value: string | Buffer; filename?: string }>,
): { body: Buffer; contentType: string } {
  const boundary = `toolman-${randomBytes(16).toString('hex')}`
  const chunks: Buffer[] = []

  for (const field of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    if (typeof field.value === 'string') {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"\r\n\r\n`))
      chunks.push(Buffer.from(field.value))
      chunks.push(Buffer.from('\r\n'))
      continue
    }

    const filename = field.filename ?? 'upload.bin'
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${field.name}"; filename="${filename}"\r\n`,
      ),
    )
    chunks.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'))
    chunks.push(field.value)
    chunks.push(Buffer.from('\r\n'))
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}
