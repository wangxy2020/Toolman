import { logStructured } from '../services/structured-log.service'
import { toErrorMessage } from '@toolman/shared'

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

/** Run async work without blocking; log failures instead of unhandled rejections. */
export function fireAndForget(scope: string, task: Promise<unknown> | undefined | void): void {
  if (!isPromiseLike(task)) return
  void task.catch((error) => {
    const message = toErrorMessage(error, String(error))
    logStructured(scope, 'error', message)
  })
}
