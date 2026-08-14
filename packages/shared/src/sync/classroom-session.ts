import { z } from 'zod'
import {
  AssistantLibSessionMetaSchema,
  SocraticStateSchema,
} from '../assistant-lib/teaching-types.js'

/** Changelog payload for `entityKind: 'classroom_session'`. */
export const ClassroomSessionSyncPayloadSchema = z.object({
  title: z.string().min(1),
  meta: AssistantLibSessionMetaSchema,
  socraticState: SocraticStateSchema.optional(),
})
export type ClassroomSessionSyncPayload = z.infer<typeof ClassroomSessionSyncPayloadSchema>
