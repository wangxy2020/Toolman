import { readdir, readFile, stat, copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { P2pCidIndexRepository } from '@toolman/db'
import {
  P2P_CID_CHUNK_SIZE,
  buildCidPackageManifest,
  verifyChunkCid,
  type CidPackageManifest,
} from '@toolman/shared'

import { getDatabase } from '../../bootstrap/database'
import { getCommunityDataDir } from './community-paths'
import { signCidPackageManifest } from './community-cid-signing.service'

const ARCHIVE_NAMES = ['package.zip', 'package.tar.gz', 'package.tgz', 'package.tar']

export interface IndexedCommunityPackage {
  manifest: CidPackageManifest
  archivePath: string
}

function getRepo(): P2pCidIndexRepository {
  return new P2pCidIndexRepository(getDatabase())
}

async function readArchiveBytes(archivePath: string): Promise<Buffer> {
  return readFile(archivePath)
}

export async function buildManifestForArchive(input: {
  resourceType: string
  resourceId: string
  version: string
  archivePath: string
  name?: string
}): Promise<CidPackageManifest> {
  const data = await readArchiveBytes(input.archivePath)
  const manifest = buildCidPackageManifest({
    packageId: `${input.resourceType}:${input.resourceId}:${input.version}`,
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    name: input.name ?? input.resourceId,
    version: input.version,
    data,
    localPath: input.archivePath,
  })
  return signCidPackageManifest(manifest)
}

export async function indexCommunityPackageManifest(
  manifest: CidPackageManifest,
  archivePath: string,
): Promise<void> {
  const repo = getRepo()
  const now = new Date()
  const data = await readArchiveBytes(archivePath)

  for (const chunk of manifest.chunks) {
    const offset = chunk.index * P2P_CID_CHUNK_SIZE
    const slice = data.subarray(offset, offset + chunk.size)
    if (!verifyChunkCid(chunk.cid, slice)) {
      throw new Error(`Chunk CID mismatch at index ${chunk.index}`)
    }

    repo.upsert({
      cid: chunk.cid,
      rootCid: manifest.rootCid,
      packageId: manifest.packageId,
      resourceId: manifest.resourceId ?? null,
      resourceType: manifest.resourceType ?? null,
      version: manifest.version,
      localPath: archivePath,
      chunkIndex: chunk.index,
      sizeBytes: chunk.size,
      createdAt: now,
      updatedAt: now,
    })
  }

  repo.upsert({
    cid: manifest.rootCid,
    rootCid: manifest.rootCid,
    packageId: manifest.packageId,
    resourceId: manifest.resourceId ?? null,
    resourceType: manifest.resourceType ?? null,
    version: manifest.version,
    localPath: archivePath,
    chunkIndex: -1,
    sizeBytes: manifest.sizeBytes,
    createdAt: now,
    updatedAt: now,
  })
}

async function findArchiveInVersionDir(versionDir: string): Promise<string | null> {
  for (const name of ARCHIVE_NAMES) {
    const candidate = join(versionDir, name)
    try {
      const info = await stat(candidate)
      if (info.isFile()) return candidate
    } catch {
      // continue
    }
  }
  return null
}

export async function scanCommunityPackagesForCidIndex(): Promise<IndexedCommunityPackage[]> {
  const packagesRoot = join(getCommunityDataDir(), 'packages')
  const indexed: IndexedCommunityPackage[] = []

  let resourceTypes: string[] = []
  try {
    resourceTypes = await readdir(packagesRoot)
  } catch {
    return indexed
  }

  for (const resourceType of resourceTypes) {
    const typeDir = join(packagesRoot, resourceType)
    let resourceIds: string[] = []
    try {
      resourceIds = await readdir(typeDir)
    } catch {
      continue
    }

    for (const resourceId of resourceIds) {
      const resourceDir = join(typeDir, resourceId)
      let versions: string[] = []
      try {
        versions = await readdir(resourceDir)
      } catch {
        continue
      }

      for (const version of versions) {
        const versionDir = join(resourceDir, version)
        const archivePath = await findArchiveInVersionDir(versionDir)
        if (!archivePath) continue

        try {
          const manifest = await buildManifestForArchive({
            resourceType,
            resourceId,
            version,
            archivePath,
          })
          await indexCommunityPackageManifest(manifest, archivePath)
          indexed.push({ manifest, archivePath })
        } catch {
          // Skip broken package directories during scan.
        }
      }
    }
  }

  return indexed
}

export function findLocalCommunityPackagePath(resourceId: string, version: string): string | null {
  const row = getRepo().findPackageByResource(resourceId, version)
  return row?.localPath ?? null
}

export function getManifestFromIndex(rootCid: string): CidPackageManifest | null {
  const root = getRepo().findByCid(rootCid)
  if (!root) return null

  const chunks = getRepo()
    .listByRootCid(rootCid)
    .filter((entry) => entry.chunkIndex >= 0)
    .map((entry) => ({
      index: entry.chunkIndex,
      cid: entry.cid,
      size: entry.sizeBytes,
    }))

  if (chunks.length === 0) return null

  return {
    v: 1,
    packageId: root.packageId ?? rootCid,
    resourceId: root.resourceId ?? undefined,
    resourceType: root.resourceType ?? undefined,
    name: root.resourceId ?? root.packageId ?? 'package',
    version: root.version ?? 'unknown',
    rootCid,
    sizeBytes: root.sizeBytes,
    localPath: root.localPath,
    chunks,
  }
}

export function getManifestFromIndexByResource(resourceId: string, version?: string): CidPackageManifest | null {
  const row = version
    ? getRepo().findPackageByResource(resourceId, version)
    : getRepo().findLatestRootByResource(resourceId)

  return row ? getManifestFromIndex(row.rootCid) : null
}

export async function readLocalChunkBytesAsync(rootCid: string, chunkIndex: number): Promise<Buffer | null> {
  const row = getRepo()
    .listByRootCid(rootCid)
    .find((entry) => entry.chunkIndex === chunkIndex)
  if (!row) return null

  const file = await readFile(row.localPath)
  const offset = chunkIndex * P2P_CID_CHUNK_SIZE
  return file.subarray(offset, offset + row.sizeBytes)
}

export function getCommunityCidIndexStats() {
  const repo = getRepo()
  return {
    indexedPackages: repo.countDistinctRoots(),
    indexedChunks: repo.countAll(),
  }
}

export async function copyIndexedPackageToPath(rootCid: string, targetPath: string): Promise<void> {
  const root = getRepo().findByCid(rootCid)
  if (!root?.localPath) {
    throw new Error('Package not found in CID index')
  }
  await mkdir(join(targetPath, '..'), { recursive: true }).catch(() => undefined)
  await copyFile(root.localPath, targetPath)
}
