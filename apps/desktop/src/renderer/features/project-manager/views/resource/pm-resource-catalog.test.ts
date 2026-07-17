import { beforeEach, describe, expect, it } from 'vitest'

import {
  mergeSharedIntoProjectCatalog,
  PM_RESOURCE_APPLICABLE_ALL,
  readSharedResourceCatalog,
  upsertSharedResourceCatalog,
  writeSharedResourceCatalog,
  type PmResourceRow,
} from './pm-resource-catalog'

function row(
  partial: Partial<PmResourceRow> & Pick<PmResourceRow, 'id' | 'name' | 'type'>,
): PmResourceRow {
  return {
    unit: '工日',
    unitPrice: 100,
    applicable: PM_RESOURCE_APPLICABLE_ALL,
    sortOrder: 0,
    parentId: null,
    ...partial,
  }
}

describe('mergeSharedIntoProjectCatalog', () => {
  it('adds missing shared resources into the project catalog', () => {
    const project = [
      row({ id: 'p1', type: 'labor', name: '普通工人', applicable: 'project-a', unitPrice: 260 }),
    ]
    const shared = [
      row({ id: 's1', type: 'labor', name: '普通工人', unitPrice: 250 }),
      row({ id: 's2', type: 'material', name: '砂子', unit: 'm³', unitPrice: 100 }),
    ]

    const merged = mergeSharedIntoProjectCatalog(project, shared)
    expect(merged.changed).toBe(true)
    expect(merged.rows).toHaveLength(2)
    expect(merged.rows[0]?.unitPrice).toBe(260)
    expect(merged.rows[1]?.name).toBe('砂子')
    expect(merged.rows[1]?.applicable).toBe(PM_RESOURCE_APPLICABLE_ALL)
  })

  it('does not duplicate when type+name already exists', () => {
    const project = [row({ id: 'p1', type: 'labor', name: '普通工人', applicable: 'project-a' })]
    const shared = [row({ id: 's1', type: 'labor', name: '普通工人' })]
    const merged = mergeSharedIntoProjectCatalog(project, shared)
    expect(merged.changed).toBe(false)
    expect(merged.rows).toHaveLength(1)
  })
})

describe('readSharedResourceCatalog', () => {
  const workspaceId = 'ws-resource-empty-test'
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
        removeItem: (key: string) => {
          store.delete(key)
        },
      },
    })
  })

  it('keeps an explicit empty catalog instead of reseeding defaults', () => {
    writeSharedResourceCatalog(workspaceId, [])
    const shared = readSharedResourceCatalog(workspaceId)
    expect(shared.isDefault).toBe(false)
    expect(shared.rows).toEqual([])
  })
})

describe('upsertSharedResourceCatalog', () => {
  it('appends new rows and updates matching ones', () => {
    const shared = [row({ id: 's1', type: 'labor', name: '普通工人', unitPrice: 250 })]
    const incoming = [
      row({ id: 'p1', type: 'labor', name: '普通工人', unitPrice: 280, applicable: 'project-a' }),
      row({
        id: 'p2',
        type: 'equipment',
        name: '吊车',
        unit: '台班',
        unitPrice: 2000,
        applicable: 'project-a',
      }),
    ]

    const result = upsertSharedResourceCatalog(shared, incoming)
    expect(result.changed).toBe(true)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]?.unitPrice).toBe(280)
    expect(result.rows[0]?.applicable).toBe(PM_RESOURCE_APPLICABLE_ALL)
    expect(result.rows[1]?.name).toBe('吊车')
    expect(result.rows[1]?.applicable).toBe(PM_RESOURCE_APPLICABLE_ALL)
  })
})
