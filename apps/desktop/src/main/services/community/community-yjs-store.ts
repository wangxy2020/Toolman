import * as Y from 'yjs'
import {
  CommunityYjsDomainSchema,
  type CommunityYjsDomain,
} from '@toolman/shared'

export const YJS_ORIGIN_REMOTE = 'community-yjs-remote'
export const YJS_ORIGIN_LOCAL = 'community-yjs-local'
export const YJS_ORIGIN_BOOTSTRAP = 'community-yjs-bootstrap'

const docs = new Map<CommunityYjsDomain, Y.Doc>()

export interface LwwEntityRecord {
  updatedAt: number
  authorDeviceId?: string
  payload: Record<string, unknown>
}

export function getCommunityDoc(domain: CommunityYjsDomain): Y.Doc {
  const existing = docs.get(domain)
  if (existing) return existing
  const doc = new Y.Doc()
  docs.set(domain, doc)
  return doc
}

export function getCommunityEntityMap(domain: CommunityYjsDomain): Y.Map<unknown> {
  return getCommunityDoc(domain).getMap('entities')
}

export function encodeCommunityDocUpdate(
  domain: CommunityYjsDomain,
  stateVector?: Uint8Array,
): Uint8Array {
  const doc = getCommunityDoc(domain)
  return stateVector ? Y.encodeStateAsUpdate(doc, stateVector) : Y.encodeStateAsUpdate(doc)
}

export function applyCommunityDocUpdate(
  domain: CommunityYjsDomain,
  update: Uint8Array,
  origin: string = YJS_ORIGIN_REMOTE,
): void {
  Y.applyUpdate(getCommunityDoc(domain), update, origin)
}

export function upsertLwwEntity(
  domain: CommunityYjsDomain,
  entityId: string,
  payload: Record<string, unknown>,
  meta: { updatedAt: number; authorDeviceId?: string },
  origin: string = YJS_ORIGIN_LOCAL,
): boolean {
  const map = getCommunityEntityMap(domain)
  const current = map.get(entityId) as LwwEntityRecord | undefined
  if (current && current.updatedAt > meta.updatedAt) {
    return false
  }

  getCommunityDoc(domain).transact(() => {
    map.set(entityId, {
      updatedAt: meta.updatedAt,
      authorDeviceId: meta.authorDeviceId,
      payload,
    } satisfies LwwEntityRecord)
  }, origin)

  return true
}

export function deleteLwwEntity(
  domain: CommunityYjsDomain,
  entityId: string,
  meta: { updatedAt: number },
  origin: string = YJS_ORIGIN_LOCAL,
): boolean {
  const map = getCommunityEntityMap(domain)
  const current = map.get(entityId) as LwwEntityRecord | undefined
  if (current && current.updatedAt > meta.updatedAt) {
    return false
  }

  getCommunityDoc(domain).transact(() => {
    map.delete(entityId)
  }, origin)

  return true
}

export function listLwwEntities(domain: CommunityYjsDomain): Array<{ id: string; record: LwwEntityRecord }> {
  const map = getCommunityEntityMap(domain)
  const items: Array<{ id: string; record: LwwEntityRecord }> = []
  map.forEach((value, key) => {
    if (typeof key !== 'string') return
    const record = value as LwwEntityRecord
    if (!record?.payload) return
    items.push({ id: key, record })
  })
  return items
}

export function parseCommunityDomainFromTopic(topic: string): CommunityYjsDomain | null {
  const prefix = 'toolman/community/v1/'
  if (!topic.includes(prefix)) return null
  const domain = topic.split(prefix)[1]?.split('/')[0]
  const parsed = CommunityYjsDomainSchema.safeParse(domain)
  return parsed.success ? parsed.data : null
}

export function observeCommunityDoc(
  domain: CommunityYjsDomain,
  listener: (update: Uint8Array, origin: unknown) => void,
): () => void {
  const doc = getCommunityDoc(domain)
  const handler = (update: Uint8Array, origin: unknown) => listener(update, origin)
  doc.on('update', handler)
  return () => {
    doc.off('update', handler)
  }
}
