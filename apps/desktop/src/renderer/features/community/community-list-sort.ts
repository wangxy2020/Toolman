export type CommunityListSortField = 'createdAt' | 'size' | 'name'

export const COMMUNITY_LIST_SORT_OPTIONS: Array<{ id: CommunityListSortField; label: string }> = [
  { id: 'createdAt', label: '创建时间' },
  { id: 'size', label: '大小' },
  { id: 'name', label: '名称' },
]

export interface CommunityListSortableItem {
  id: string
  title: string
  createdAt: number
  sizeBytes: number
}

export function sortCommunityListItems<T extends CommunityListSortableItem>(
  items: T[],
  field: CommunityListSortField,
  ascending: boolean,
): T[] {
  const sorted = [...items].sort((left, right) => {
    let compare = 0

    if (field === 'createdAt') {
      compare = left.createdAt - right.createdAt
    } else if (field === 'size') {
      compare = left.sizeBytes - right.sizeBytes
    } else {
      compare = left.title.localeCompare(right.title, 'zh-CN', { sensitivity: 'base' })
    }

    if (compare === 0) {
      compare = left.title.localeCompare(right.title, 'zh-CN', { sensitivity: 'base' })
    }

    return ascending ? compare : -compare
  })

  return sorted
}
