import { describe, expect, it } from 'vitest'
import { buildAssistantLibCourseRuntimeHint } from './agent-link.js'

describe('buildAssistantLibCourseRuntimeHint', () => {
  it('requires each question to stay on the current chapter', () => {
    const hint = buildAssistantLibCourseRuntimeHint({
      teachingMode: 'socratic',
      refereeEnabled: true,
      courseName: '化学',
      courseSystemPrompt: '你是苏格拉底导师。',
      syllabus: {
        generation: 'ready',
        generatedCount: 1,
        chapters: [
          {
            id: 'c1',
            title: '第一节 物质的分类及转化',
            groupTitle: '物质及其变化',
            lessonPlan: '区分物理变化与化学变化。',
            assessmentQuestions: ['什么是化学变化？'],
            status: 'in_progress',
          },
        ],
      },
      studyRecords: [],
    })

    expect(hint).toContain('本章提问约束')
    expect(hint).toContain('第一节 物质的分类及转化')
    expect(hint).toContain('所属章：物质及其变化')
    expect(hint).toContain('不要跟着偏题')
    expect(hint).toContain('本章教案')
    expect(hint).toContain('什么是化学变化？')
  })
})
