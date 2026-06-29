import { logStructured } from '../services/structured-log.service'
import { toErrorMessage } from '@toolman/shared'

/** Run async work without blocking; log failures instead of unhandled rejections. */
export function fireAndForget(scope: string, task: Promise<unknown>): void {
  void task.catch((error) => {
    const message = toErrorMessage(error, String(error))
    logStructured(scope, 'error', message)
  })
}
