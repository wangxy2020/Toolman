/** Swallow background-task failures; surface them in development. */
export function ignoreAsyncError(task: Promise<unknown>, label: string): void {
  void task.catch((error) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[toolman] ${label}`, error)
    }
  })
}
