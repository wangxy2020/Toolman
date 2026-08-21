import {
  ASSISTANT_LIB_ASSISTANT_MARKER,
  ASSISTANT_LIB_ASSISTANT_NAME,
  ASSISTANT_LIB_GUIDE_COURSE_TITLE,
  assistantLibGuideCourseContentStale,
  assistantLibSessionMetadataPatch,
  buildAssistantLibAssistantSystemPrompt,
  buildAssistantLibGuideCourseSessionFields,
  findAssistantLibGuideCourseSession,
  isAssistantLibAssistantName,
  parseAssistantLibSessionMeta,
  type Session,
} from '@toolman/shared'
import { DEFAULT_LOCAL_MODEL } from '@toolman/db'
import { DEFAULT_PROVIDER_ID } from '../bootstrap/database-defaults'
import { getSessionRepository } from '../db/repos'
import { toIpcSession } from '../mappers/chat'
import { createAssistant, listAssistants } from './assistant.service'
import { createSession, updateSession } from './session.service'
import { listWorkspaces } from './workspace.service'

function fallbackModelId(assistants: ReturnType<typeof listAssistants>): string {
  return (
    assistants.find((item) => isAssistantLibAssistantName(item.name))?.modelId ||
    assistants.find((item) => item.modelId)?.modelId ||
    `${DEFAULT_PROVIDER_ID}:${DEFAULT_LOCAL_MODEL}`
  )
}

function loadClassroomSessions(workspaceId: string, assistantId: string): Session[] {
  const rows = getSessionRepository().listRows({
    workspaceId,
    assistantId,
    limit: 500,
  })
  return rows.map((row) => toIpcSession(row))
}

function seedWorkspace(workspaceId: string): void {
  const assistants = listAssistants({ workspaceId })
  let classroom = assistants.find((item) => isAssistantLibAssistantName(item.name))
  const modelId = fallbackModelId(assistants)
  if (!classroom) {
    classroom = createAssistant({
      workspaceId,
      name: ASSISTANT_LIB_ASSISTANT_NAME,
      description: '课堂学习智能体：课程以话题形式挂载',
      systemPrompt: buildAssistantLibAssistantSystemPrompt(),
      modelId,
      parameters: {
        temperature: 0.7,
        teachingMode: 'socratic',
        assistantLibPresetId: ASSISTANT_LIB_ASSISTANT_MARKER,
        refereeEnabled: true,
      },
      isPinned: true,
    })
  }
  if (classroom.parameters.assistantLibGuideDismissed) return

  const sessions = loadClassroomSessions(workspaceId, classroom.id)
  const existing = findAssistantLibGuideCourseSession(sessions, classroom.id)
  if (existing) {
    const meta = parseAssistantLibSessionMeta(existing.metadata)
    const needsSeed =
      !meta?.isGuideClassroom ||
      !meta.syllabus?.chapters.length ||
      !meta.customSystemPrompt?.trim() ||
      assistantLibGuideCourseContentStale(meta.syllabus)
    if (!needsSeed) return
    updateSession({
      id: existing.id,
      title: existing.title || ASSISTANT_LIB_GUIDE_COURSE_TITLE,
      metadata: assistantLibSessionMetadataPatch(
        existing.metadata,
        buildAssistantLibGuideCourseSessionFields(meta),
      ),
    })
    return
  }

  createSession({
    workspaceId,
    assistantId: classroom.id,
    title: ASSISTANT_LIB_GUIDE_COURSE_TITLE,
    metadata: assistantLibSessionMetadataPatch(null, buildAssistantLibGuideCourseSessionFields(null)),
  })
}

export function ensureAssistantLibGuideClassroomSeed(): void {
  for (const workspace of listWorkspaces()) {
    seedWorkspace(workspace.id)
  }
}
