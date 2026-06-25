const workspaceWriteChains = new Map<string, Promise<unknown>>()

/** Serialize P2P workspace event writes and force-sync for a single workspace. */
export function withWorkspaceEventWrite<T>(
  workspaceId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = workspaceWriteChains.get(workspaceId) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(() => fn())

  workspaceWriteChains.set(
    workspaceId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )

  return next.finally(() => {
    if (workspaceWriteChains.get(workspaceId) === next) {
      workspaceWriteChains.delete(workspaceId)
    }
  })
}

export function resetWorkspaceEventMutexForTests(): void {
  workspaceWriteChains.clear()
}
