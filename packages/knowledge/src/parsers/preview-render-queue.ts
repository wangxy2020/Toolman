/** Highest priority pending preview runs next; one render at a time. */
export const PREVIEW_RENDER_DROPPED = 'PREVIEW_RENDER_DROPPED'
/** Keep pending rasters within the prefetch window of the latest visible request. */
export const PDF_PREVIEW_RETAIN_PAGES = 10

export class PreviewRenderDroppedError extends Error {
  constructor() {
    super(PREVIEW_RENDER_DROPPED)
    this.name = 'PreviewRenderDroppedError'
  }
}

export function isPreviewRenderDropped(error: unknown): boolean {
  return error instanceof PreviewRenderDroppedError ||
    (error instanceof Error && error.message === PREVIEW_RENDER_DROPPED)
}

export type PreviewQueueJobOptions = {
  priority?: number
  key?: string
  group?: string
  page?: number
  retainAround?: number
}

type QueueItem<T> = {
  seq: number
  priority: number
  key: string
  group: string
  page: number
  task: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
  promise: Promise<T>
}

function normalizeEnqueueOptions(
  priorityOrOptions: number | PreviewQueueJobOptions = 0,
): Required<PreviewQueueJobOptions> {
  if (typeof priorityOrOptions === 'number') {
    return { priority: priorityOrOptions, key: '', group: '', page: 0, retainAround: -1 }
  }
  return {
    priority: priorityOrOptions.priority ?? 0,
    key: priorityOrOptions.key ?? '',
    group: priorityOrOptions.group ?? '',
    page: Math.max(0, Math.floor(priorityOrOptions.page ?? 0) || 0),
    retainAround:
      priorityOrOptions.retainAround === undefined ? -1 : Math.max(0, Math.floor(priorityOrOptions.retainAround)),
  }
}

export function createPreviewRenderQueue() {
  let running = false
  let seq = 0
  const items: Array<QueueItem<unknown>> = []

  const pickNext = () => {
    let best = -1
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!
      if (best < 0) {
        best = index
        continue
      }
      const current = items[best]!
      if (item.priority > current.priority) {
        best = index
        continue
      }
      if (item.priority === current.priority && item.seq > current.seq) best = index
    }
    return best
  }

  const pump = () => {
    if (running) return
    const best = pickNext()
    if (best < 0) return
    const [job] = items.splice(best, 1)
    if (!job) return
    running = true
    void job
      .task()
      .then(job.resolve, job.reject)
      .finally(() => {
        running = false
        pump()
      })
  }

  function dropStale(group: string, page: number, retainAround: number) {
    if (!group || retainAround < 0 || page < 1) return
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]!
      if (item.group !== group || item.page < 1) continue
      if (Math.abs(item.page - page) <= retainAround) continue
      items.splice(index, 1)
      item.reject(new PreviewRenderDroppedError())
    }
  }

  function enqueue<T>(task: () => Promise<T>, priorityOrOptions: number | PreviewQueueJobOptions = 0): Promise<T> {
    const options = normalizeEnqueueOptions(priorityOrOptions)
    dropStale(options.group, options.page, options.retainAround)

    if (options.key) {
      const existing = items.find((item) => item.key === options.key) as QueueItem<T> | undefined
      if (existing) {
        existing.priority = Math.max(existing.priority, options.priority)
        existing.seq = ++seq
        pump()
        return existing.promise
      }
    }

    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    items.push({
      seq: ++seq,
      priority: options.priority,
      key: options.key,
      group: options.group,
      page: options.page,
      task: task as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
      promise: promise as Promise<unknown>,
    })
    pump()
    return promise
  }

  return { enqueue }
}

export function previewPriorityValue(priority: 'visible' | 'prefetch' | undefined): number {
  return priority === 'prefetch' ? 1 : 2
}
