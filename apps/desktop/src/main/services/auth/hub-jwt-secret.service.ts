import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { decryptSecret, encryptSecret } from '../secret-store'

const SECRET_FILE = 'hub-jwt-secret.enc'

let cachedSecret: string | null = null

function secretFilePath(): string {
  return join(app.getPath('userData'), SECRET_FILE)
}

async function persistSecret(secret: string): Promise<void> {
  const path = secretFilePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, encryptSecret(secret), 'utf8')
}

export async function getHubJwtSecret(): Promise<string> {
  const envSecret = process.env.TOOLMAN_COMMUNITY_JWT_SECRET?.trim()
  if (envSecret) {
    cachedSecret = envSecret
    return envSecret
  }

  if (cachedSecret) {
    return cachedSecret
  }

  try {
    const encoded = await readFile(secretFilePath(), 'utf8')
    const decoded = decryptSecret(encoded.trim())
    if (decoded) {
      cachedSecret = decoded
      return decoded
    }
  } catch {
    // missing or unreadable — generate below
  }

  const secret = randomBytes(32).toString('base64url')
  await persistSecret(secret)
  cachedSecret = secret
  return secret
}

export function resetHubJwtSecretCacheForTests(): void {
  cachedSecret = null
}
