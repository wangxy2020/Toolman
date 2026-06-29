import type { MessageStreamEvent } from '@toolman/shared'
import { broadcastStreamEvent } from '../stream-broadcast'

export function emitStreamEvent(event: MessageStreamEvent): void {
  broadcastStreamEvent(event)
}
