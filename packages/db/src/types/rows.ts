import type { messages, sessions } from '../schema/session.js'
import type { assistants } from '../schema/agent.js'

export type SessionRow = typeof sessions.$inferSelect
export type MessageRow = typeof messages.$inferSelect
export type AssistantRow = typeof assistants.$inferSelect
