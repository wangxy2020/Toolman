/** Yield the Node.js event loop so IPC / UI handlers can run between heavy batches. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}
