import { describe, expect, it } from 'vitest'

import {
  resetWorkspaceEventMutexForTests,
  withWorkspaceEventWrite,
} from './p2p-workspace-event-mutex'

describe('withWorkspaceEventWrite', () => {
  it('serializes concurrent writes for the same workspace', async () => {
    resetWorkspaceEventMutexForTests()
    const order: number[] = []

    await Promise.all([
      withWorkspaceEventWrite('ws-1', async () => {
        order.push(1)
        await new Promise((resolve) => setTimeout(resolve, 20))
        order.push(2)
      }),
      withWorkspaceEventWrite('ws-1', async () => {
        order.push(3)
      }),
    ])

    expect(order).toEqual([1, 2, 3])
  })

  it('does not block different workspaces', async () => {
    resetWorkspaceEventMutexForTests()
    const order: string[] = []

    await Promise.all([
      withWorkspaceEventWrite('ws-a', async () => {
        order.push('a-start')
        await new Promise((resolve) => setTimeout(resolve, 15))
        order.push('a-end')
      }),
      withWorkspaceEventWrite('ws-b', async () => {
        order.push('b')
      }),
    ])

    expect(order[0]).toBe('a-start')
    expect(order).toContain('b')
    expect(order.at(-1)).toBe('a-end')
  })
})
