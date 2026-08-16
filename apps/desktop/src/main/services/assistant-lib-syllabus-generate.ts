import { createModelGateway, ProviderError } from '@toolman/model-gateway'
import {
  assistantLibSessionMetadataPatch,
  formatSyllabusMarkdown,
  parseAssistantLibSessionMeta,
  parseSocraticState,
  seedSyllabusFromCatalog,
  type CourseSyllabus,
  type CourseSyllabusChapter,
} from '@toolman/shared'
import { listKnowledgeCourseOutline } from './knowledge-course-outline.service'
import { searchKnowledgeForChat } from './knowledge-document.service'
import { getProviderConfig, parseModelId } from './provider.service'
import { getSession, updateSession } from './session.service'
import { broadcastAssistantLibSyllabusEvent } from './assistant-lib-syllabus-broadcast'

const gateway = createModelGateway()

const WAIT_ATTEMPTS = 24
const WAIT_MS = 5000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseChapterJson(raw: string): {
  hours: number
  lessonPlan: string
  assessmentQuestions: string[]
} | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as {
      hours?: unknown
      lessonPlan?: unknown
      assessmentQuestions?: unknown
    }
    const hours = Number(parsed.hours)
    const lessonPlan = typeof parsed.lessonPlan === 'string' ? parsed.lessonPlan.trim() : ''
    const assessmentQuestions = Array.isArray(parsed.assessmentQuestions)
      ? parsed.assessmentQuestions
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 6)
      : []
    if (!lessonPlan && assessmentQuestions.length === 0) return null
    return {
      hours: Number.isFinite(hours) ? Math.min(8, Math.max(1, Math.round(hours))) : 2,
      lessonPlan,
      assessmentQuestions,
    }
  } catch {
    return null
  }
}

function persistSyllabus(
  sessionId: string,
  syllabus: CourseSyllabus,
  socraticState?: ReturnType<typeof parseSocraticState>,
): void {
  const session = getSession({ id: sessionId })
  if (!session) return
  const meta = parseAssistantLibSessionMeta(session.metadata)
  if (!meta) return
  const markdown = formatSyllabusMarkdown(syllabus)
  const metadata = assistantLibSessionMetadataPatch(session.metadata, {
    ...meta,
    syllabus,
    lessonPlan: markdown,
  })
  updateSession({
    id: sessionId,
    metadata: {
      ...metadata,
      ...(socraticState ? { socraticState } : {}),
    },
  })
  broadcastAssistantLibSyllabusEvent({
    sessionId,
    generation: syllabus.generation === 'idle' ? 'generating' : syllabus.generation,
    generatedCount: syllabus.generatedCount,
    total: syllabus.chapters.length,
    error: syllabus.generationError,
  })
}

async function waitForCatalog(
  workspaceId: string,
  kbId: string,
): Promise<Array<{ id: string; title: string }>> {
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
    const outline = await listKnowledgeCourseOutline({ workspaceId, kbId })
    const items = outline.items.map((item) => ({
      id: item.id,
      title: item.label || item.title,
    }))
    if (items.length > 0) return items
    await sleep(WAIT_MS)
  }
  return []
}

async function generateOneChapter(options: {
  workspaceId: string
  kbIds: string[]
  courseName: string
  chapterTitle: string
  model: string
  providerConfig: NonNullable<ReturnType<typeof getProviderConfig>>
}): Promise<Pick<CourseSyllabusChapter, 'hours' | 'lessonPlan' | 'assessmentQuestions'>> {
  let passages = ''
  try {
    const results = await searchKnowledgeForChat({
      workspaceId: options.workspaceId,
      kbIds: options.kbIds,
      query: `${options.courseName} ${options.chapterTitle}`,
      topK: 8,
    })
    passages = results
      .map((item, index) => `${index + 1}. ${item.documentTitle}\n${item.text.trim()}`)
      .join('\n\n')
  } catch {
    passages = ''
  }

  const prompt = [
    '你是课程设计师。请根据教材片段为「这一章」编写教学大纲条目。',
    '只输出 JSON，不要 markdown 围栏或说明：',
    '{"hours":2,"lessonPlan":"markdown 教案（学习目标/重点/步骤/练习）","assessmentQuestions":["验收问题1","验收问题2","验收问题3"]}',
    'hours 为建议课时（1-4 的整数）。验收问题用于判断学生是否掌握本章，3 题左右。',
    '',
    `课程：${options.courseName}`,
    `章节：${options.chapterTitle}`,
    passages ? `教材片段：\n${passages.slice(0, 8000)}` : '教材片段：暂无检索结果，请按章节标题合理编写。',
  ].join('\n')

  const completion = await gateway.chatComplete(options.providerConfig, {
    model: options.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 2048,
  })
  const parsed = parseChapterJson(completion.content)
  if (!parsed) {
    return {
      hours: 2,
      lessonPlan: `围绕「${options.chapterTitle}」开展教学：明确目标、讲解要点、布置练习。`,
      assessmentQuestions: [`请用自己的话说明「${options.chapterTitle}」的核心内容。`],
    }
  }
  return parsed
}

export async function runSyllabusGeneration(options: {
  workspaceId: string
  sessionId: string
  modelId: string
}): Promise<void> {
  const session = getSession({ id: options.sessionId })
  if (!session) return
  const meta = parseAssistantLibSessionMeta(session.metadata)
  if (!meta) return
  const kbId = meta.kbIds?.[0]
  if (!kbId) {
    persistSyllabus(options.sessionId, {
      generation: 'error',
      generationError: '未绑定教材知识库，无法生成教学大纲。',
      generatedCount: 0,
      chapters: [],
      updatedAt: Date.now(),
    })
    return
  }

  const { providerId, model } = parseModelId(options.modelId)
  const providerConfig = getProviderConfig(providerId)
  if (!providerConfig) {
    persistSyllabus(options.sessionId, {
      generation: 'error',
      generationError: '未配置可用模型，无法生成教学大纲。',
      generatedCount: 0,
      chapters: [],
      updatedAt: Date.now(),
    })
    return
  }

  persistSyllabus(options.sessionId, {
    generation: 'generating',
    generatedCount: 0,
    chapters: [],
    updatedAt: Date.now(),
  })

  const catalog = await waitForCatalog(options.workspaceId, kbId)
  if (catalog.length === 0) {
    persistSyllabus(options.sessionId, {
      generation: 'error',
      generationError: '教材目录尚未就绪。索引完成后可重新打开课堂设置生成教学大纲。',
      generatedCount: 0,
      chapters: [],
      updatedAt: Date.now(),
    })
    return
  }

  let syllabus = seedSyllabusFromCatalog(catalog)
  const courseName = meta.courseName?.trim() || session.title
  persistSyllabus(options.sessionId, syllabus, {
    ...parseSocraticState(session.metadata),
    pathNodes: syllabus.chapters.map((chapter) => chapter.title),
    pathIndex: 0,
    topic: syllabus.chapters[0]?.title,
    currentChapterId: syllabus.chapters[0]?.id,
    chapterPassed: false,
  })

  try {
    for (let index = 0; index < syllabus.chapters.length; index += 1) {
      const chapter = syllabus.chapters[index]
      if (!chapter) continue
      syllabus = {
        ...syllabus,
        chapters: syllabus.chapters.map((item, itemIndex) =>
          itemIndex === index ? { ...item, status: 'generating' as const } : item,
        ),
      }
      persistSyllabus(options.sessionId, syllabus)

      try {
        const generated = await generateOneChapter({
          workspaceId: options.workspaceId,
          kbIds: [kbId],
          courseName,
          chapterTitle: chapter.title,
          model,
          providerConfig,
        })
        syllabus = {
          ...syllabus,
          generatedCount: index + 1,
          chapters: syllabus.chapters.map((item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  ...generated,
                  status: index === 0 ? 'in_progress' : 'ready',
                }
              : item,
          ),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        syllabus = {
          ...syllabus,
          generatedCount: index + 1,
          chapters: syllabus.chapters.map((item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  hours: 2,
                  lessonPlan: `本章生成失败：${message}`,
                  assessmentQuestions: [`请概述「${chapter.title}」的要点。`],
                  status: index === 0 ? 'in_progress' : 'ready',
                }
              : item,
          ),
        }
      }
      persistSyllabus(options.sessionId, syllabus)
    }

    const totalHours = syllabus.chapters.reduce((sum, chapter) => sum + (chapter.hours ?? 0), 0)
    persistSyllabus(options.sessionId, {
      ...syllabus,
      generation: 'ready',
      totalHours,
      updatedAt: Date.now(),
    })
  } catch (error) {
    if (error instanceof ProviderError) {
      persistSyllabus(options.sessionId, {
        ...syllabus,
        generation: 'error',
        generationError: error.message,
        updatedAt: Date.now(),
      })
      return
    }
    persistSyllabus(options.sessionId, {
      ...syllabus,
      generation: 'error',
      generationError: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    })
  }
}
