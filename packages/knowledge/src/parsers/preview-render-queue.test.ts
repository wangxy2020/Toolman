import { describe, expect, it } from 'vitest'
import {
  createPreviewRenderQueue,
  PDF_PREVIEW_RETAIN_PAGES,
  PREVIEW_RENDER_DROPPED,
  previewPriorityValue,
} from './preview-render-queue.js'

describe('preview render queue', () => {
  it('runs a visible page before a queued prefetch', async () => {
    const queue = createPreviewRenderQueue()
    const order: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = queue.enqueue(async () => {
      await firstGate
      order.push('running')
    }, previewPriorityValue('prefetch'))

    const visible = queue.enqueue(async () => {
      order.push('visible')
    }, previewPriorityValue('visible'))

    const prefetch = queue.enqueue(async () => {
      order.push('prefetch')
    }, previewPriorityValue('prefetch'))

    releaseFirst()
    await Promise.all([first, visible, prefetch])
    expect(order).toEqual(['running', 'visible', 'prefetch'])
  })

  it('runs a lower-priority metadata task after a visible preview', async () => {
    const queue = createPreviewRenderQueue()
    const order: string[] = []
    let releaseVisible!: () => void
    const visibleGate = new Promise<void>((resolve) => {
      releaseVisible = resolve
    })

    const visible = queue.enqueue(async () => {
      await visibleGate
      order.push('visible')
    }, previewPriorityValue('visible'))
    const metadata = queue.enqueue(async () => {
      order.push('metadata')
    }, 0)

    releaseVisible()
    await Promise.all([visible, metadata])
    expect(order).toEqual(['visible', 'metadata'])
  })

  it('runs the newest visible page before older visible pages', async () => {
    const queue = createPreviewRenderQueue()
    const order: number[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const blocker = queue.enqueue(async () => {
      await firstGate
    }, {
      priority: previewPriorityValue('visible'),
      key: 'p1',
      group: 'doc',
      page: 1,
    })
    const older = queue.enqueue(async () => {
      order.push(8)
    }, {
      priority: previewPriorityValue('visible'),
      key: 'p8',
      group: 'doc',
      page: 8,
    })
    const newest = queue.enqueue(async () => {
      order.push(14)
    }, {
      priority: previewPriorityValue('visible'),
      key: 'p14',
      group: 'doc',
      page: 14,
    })

    releaseFirst()
    await Promise.all([blocker, older, newest])
    expect(order).toEqual([14, 8])
  })

  it('drops pending rasters that are far from the latest visible page', async () => {
    const queue = createPreviewRenderQueue()
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const blocker = queue.enqueue(async () => {
      await firstGate
    }, {
      priority: previewPriorityValue('visible'),
      key: 'p1',
      group: 'doc',
      page: 1,
    })
    const stale = queue.enqueue(async () => 'stale', {
      priority: previewPriorityValue('visible'),
      key: 'p2',
      group: 'doc',
      page: 2,
    })
    const current = queue.enqueue(async () => 'current', {
      priority: previewPriorityValue('visible'),
      key: 'p14',
      group: 'doc',
      page: 14,
      retainAround: PDF_PREVIEW_RETAIN_PAGES,
    })
    const neighbor = queue.enqueue(async () => 'neighbor', {
      priority: previewPriorityValue('prefetch'),
      key: 'p15',
      group: 'doc',
      page: 15,
    })

    releaseFirst()
    await expect(stale).rejects.toThrow(PREVIEW_RENDER_DROPPED)
    await expect(current).resolves.toBe('current')
    await expect(neighbor).resolves.toBe('neighbor')
    await blocker
  })

  it('boosts a pending prefetch to visible without a second raster', async () => {
    const queue = createPreviewRenderQueue()
    let rasters = 0
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const blocker = queue.enqueue(async () => {
      await firstGate
    }, {
      priority: previewPriorityValue('visible'),
      key: 'p1',
      group: 'doc',
      page: 1,
    })
    const prefetch = queue.enqueue(async () => {
      rasters += 1
      return 'img'
    }, {
      priority: previewPriorityValue('prefetch'),
      key: 'p14',
      group: 'doc',
      page: 14,
    })
    const visible = queue.enqueue(async () => {
      rasters += 1
      return 'other'
    }, {
      priority: previewPriorityValue('visible'),
      key: 'p14',
      group: 'doc',
      page: 14,
      retainAround: PDF_PREVIEW_RETAIN_PAGES,
    })

    releaseFirst()
    await blocker
    expect(await prefetch).toBe('img')
    expect(await visible).toBe('img')
    expect(rasters).toBe(1)
  })
})
