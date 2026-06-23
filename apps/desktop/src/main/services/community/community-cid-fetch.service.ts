import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  CidWireChunkRequestSchema,
  CidWireChunkResponseSchema,
  CidWireManifestRequestSchema,
  CidWireManifestResponseSchema,
  cidWireTopic,
  verifyChunkCid,
  type CidPackageManifest,
} from '@toolman/shared'

import { recordDiagnosticEvent } from '../diagnostics-log'
import { Libp2pBridge } from '../p2p/libp2p-bridge'
import { getCommunityDataDir } from './community-paths'
import {
  getManifestFromIndex,
  getManifestFromIndexByResource,
  indexCommunityPackageManifest,
  readLocalChunkBytesAsync,
} from './community-cid-index.service'
import {
  signCidChunkResponse,
  verifyCidChunkResponse,
  verifyCidPackageManifest,
} from './community-cid-signing.service'

const manifestWaiters = new Map<string, (manifest: CidPackageManifest | null) => void>()
const chunkWaiters = new Map<string, (chunk: Buffer | null) => void>()

let fetchedPackages = 0

export function getCommunityCidFetchStats() {
  return { fetchedPackages }
}

function waitFor<T>(map: Map<string, (value: T) => void>, key: string, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      map.delete(key)
      resolve(null)
    }, timeoutMs)

    map.set(key, (value) => {
      clearTimeout(timer)
      map.delete(key)
      resolve(value)
    })
  })
}

export function handleCidWireMessage(topic: string, raw: Buffer): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString('utf8'))
  } catch {
    return
  }

  if (topic === cidWireTopic('request')) {
    const request = CidWireManifestRequestSchema.safeParse(parsed)
    if (!request.success) return

    let manifest: CidPackageManifest | null = null
    if (request.data.rootCid) {
      manifest = getManifestFromIndex(request.data.rootCid)
    } else if (request.data.resourceId) {
      manifest = getManifestFromIndexByResource(request.data.resourceId)
    }

    const response = CidWireManifestResponseSchema.parse({
      v: 1,
      requestId: request.data.requestId,
      manifest,
      at: Date.now(),
    })

    Libp2pBridge.pubsubPublish(
      cidWireTopic('response'),
      Buffer.from(JSON.stringify(response), 'utf8'),
    )
    return
  }

  if (topic === cidWireTopic('response')) {
    const response = CidWireManifestResponseSchema.safeParse(parsed)
    if (!response.success) return

    const waiter = manifestWaiters.get(response.data.requestId)
    if (!waiter) return

    const manifest = response.data.manifest
    if (manifest && !verifyCidPackageManifest(manifest)) {
      waiter(null)
      return
    }

    waiter(manifest)
    return
  }

  if (topic === cidWireTopic('chunk-request')) {
    const request = CidWireChunkRequestSchema.safeParse(parsed)
    if (!request.success) return

    void (async () => {
      const bytes = await readLocalChunkBytesAsync(request.data.rootCid, request.data.chunkIndex)
      if (!bytes) return

      const wire = signCidChunkResponse({
        requestId: request.data.requestId,
        rootCid: request.data.rootCid,
        chunkIndex: request.data.chunkIndex,
        chunkCid: request.data.chunkCid,
        data: bytes,
      })

      Libp2pBridge.pubsubPublish(
        cidWireTopic('chunk-response'),
        Buffer.from(JSON.stringify(wire), 'utf8'),
      )
    })()
    return
  }

  if (topic === cidWireTopic('chunk-response')) {
    const response = CidWireChunkResponseSchema.safeParse(parsed)
    if (!response.success) return

    if (!verifyCidChunkResponse(response.data)) {
      recordDiagnosticEvent('community-cid', 'warn', 'chunk response verify failed')
      return
    }

    const bytes = Buffer.from(response.data.data, 'base64')
    if (!verifyChunkCid(response.data.chunkCid, bytes)) {
      recordDiagnosticEvent('community-cid', 'warn', 'chunk cid mismatch')
      return
    }

    const waiter = chunkWaiters.get(response.data.requestId)
    waiter?.(bytes)
  }
}

export async function requestManifestFromNetwork(input: {
  resourceId?: string
  rootCid?: string
  timeoutMs?: number
}): Promise<CidPackageManifest | null> {
  if (!Libp2pBridge.isAvailable() || !Libp2pBridge.networkIsRunning()) return null

  const requestId = randomUUID()
  const request = CidWireManifestRequestSchema.parse({
    v: 1,
    requestId,
    resourceId: input.resourceId,
    rootCid: input.rootCid,
    at: Date.now(),
  })

  const manifestPromise = waitFor(manifestWaiters, requestId, input.timeoutMs ?? 8_000)
  Libp2pBridge.pubsubPublish(
    cidWireTopic('request'),
    Buffer.from(JSON.stringify(request), 'utf8'),
  )

  return manifestPromise
}

async function requestChunkFromNetwork(manifest: CidPackageManifest, chunkIndex: number): Promise<Buffer | null> {
  const chunk = manifest.chunks.find((entry) => entry.index === chunkIndex)
  if (!chunk) return null

  const requestId = randomUUID()
  const request = CidWireChunkRequestSchema.parse({
    v: 1,
    rootCid: manifest.rootCid,
    chunkIndex,
    chunkCid: chunk.cid,
    requestId,
    at: Date.now(),
  })

  const chunkPromise = waitFor(chunkWaiters, requestId, 10_000)
  Libp2pBridge.pubsubPublish(
    cidWireTopic('chunk-request'),
    Buffer.from(JSON.stringify(request), 'utf8'),
  )

  return chunkPromise
}

export async function fetchCommunityPackageViaP2p(input: {
  resourceType: string
  resourceId: string
  version: string
}): Promise<string | null> {
  const localPath = getManifestFromIndexByResource(input.resourceId, input.version)?.localPath
  if (localPath) {
    return localPath
  }

  const manifest = await requestManifestFromNetwork({ resourceId: input.resourceId })
  if (!manifest || !verifyCidPackageManifest(manifest)) {
    return null
  }

  const outDir = join(
    getCommunityDataDir(),
    'packages',
    input.resourceType,
    input.resourceId,
    input.version,
  )
  await mkdir(outDir, { recursive: true })
  const targetPath = join(outDir, 'package-p2p.zip')

  const parts: Buffer[] = []
  for (const chunk of manifest.chunks) {
    const bytes = await requestChunkFromNetwork(manifest, chunk.index)
    if (!bytes) {
      recordDiagnosticEvent('community-cid', 'warn', `missing chunk ${chunk.index} for ${manifest.rootCid}`)
      return null
    }
    parts.push(bytes)
  }

  const payload = Buffer.concat(parts)
  if (payload.length !== manifest.sizeBytes) {
    recordDiagnosticEvent('community-cid', 'warn', 'assembled package size mismatch')
    return null
  }

  await writeFile(targetPath, payload)
  await indexCommunityPackageManifest(manifest, targetPath)
  fetchedPackages += 1
  return targetPath
}
