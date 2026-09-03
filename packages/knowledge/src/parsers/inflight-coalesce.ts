/** Share one in-flight promise per key so concurrent callers do not duplicate work. */
export function coalesceInflight<T>(
  inflight: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing
  const promise = factory().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}
