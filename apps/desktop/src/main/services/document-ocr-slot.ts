/** Limit concurrent glm-ocr / vision calls so ingest cannot flood Ollama on 16GB unified memory. */
export function createConcurrencyLimiter(limit: number) {
  let active = 0
  const waiters: Array<() => void> = []

  const acquire = () => {
    if (active < limit) {
      active += 1
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      waiters.push(() => {
        active += 1
        resolve()
      })
    })
  }

  const release = () => {
    active -= 1
    waiters.shift()?.()
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire()
      try {
        return await task()
      } finally {
        release()
      }
    },
  }
}

export const ocrPageLimiter = createConcurrencyLimiter(1)
