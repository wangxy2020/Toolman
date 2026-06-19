import { describe, expect, it } from 'vitest'

import { sortCommunityListItems } from './community-list-sort'

describe('sortCommunityListItems', () => {
  const items = [
    { id: '1', title: 'Bravo', createdAt: 300, sizeBytes: 20 },
    { id: '2', title: 'Alpha', createdAt: 100, sizeBytes: 50 },
    { id: '3', title: 'Charlie', createdAt: 200, sizeBytes: 10 },
  ]

  it('sorts by createdAt descending by default', () => {
    const sorted = sortCommunityListItems(items, 'createdAt', false)
    expect(sorted.map((item) => item.id)).toEqual(['1', '3', '2'])
  })

  it('sorts by size ascending', () => {
    const sorted = sortCommunityListItems(items, 'size', true)
    expect(sorted.map((item) => item.id)).toEqual(['3', '1', '2'])
  })

  it('sorts by name ascending', () => {
    const sorted = sortCommunityListItems(items, 'name', true)
    expect(sorted.map((item) => item.id)).toEqual(['2', '1', '3'])
  })
})
