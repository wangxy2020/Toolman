import {
  TaskEventSchema,
  type TaskEvent,
  type TaskEventType,
} from '@toolman/shared'

import { appendTaskEventLog } from './task-event-log'
import { broadcastTaskEvent } from './task-stream-broadcast'

export type TaskEventListener = (event: TaskEvent) => void

export interface TaskEventSubscriptionFilter {
  taskId?: string
  types?: TaskEventType[]
}

interface Subscription {
  listener: TaskEventListener
  filter?: TaskEventSubscriptionFilter
}

const subscriptions = new Set<Subscription>()

function matchesFilter(event: TaskEvent, filter?: TaskEventSubscriptionFilter): boolean {
  if (filter?.taskId && event.taskId !== filter.taskId) return false
  if (filter?.types && !filter.types.includes(event.type)) return false
  return true
}

function notifyLocalListeners(event: TaskEvent): void {
  for (const subscription of subscriptions) {
    if (!matchesFilter(event, subscription.filter)) continue
    subscription.listener(event)
  }
}

export function subscribeTaskEvents(
  listener: TaskEventListener,
  filter?: TaskEventSubscriptionFilter,
): () => void {
  const subscription: Subscription = { listener, filter }
  subscriptions.add(subscription)
  return () => {
    subscriptions.delete(subscription)
  }
}

export function publishTaskEvent(
  task: Parameters<typeof appendTaskEventLog>[0],
  event: TaskEvent,
): TaskEvent {
  const parsed = TaskEventSchema.parse(event)
  appendTaskEventLog(task, parsed)
  notifyLocalListeners(parsed)
  broadcastTaskEvent(parsed)
  return parsed
}
