import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_LIB_GUIDE_COURSE_TITLE,
  buildAssistantLibGuideCourseSyllabus,
  buildAssistantLibGuideCourseSystemPrompt,
  mergeAssistantLibGuideCourseSyllabus,
  assistantLibGuideCourseContentStale,
} from './guide-course.js'

describe('Toolman usage-guide course', () => {
  it('seeds a ready syllabus with chapter plans', () => {
    const syllabus = buildAssistantLibGuideCourseSyllabus()
    expect(syllabus.generation).toBe('ready')
    expect(syllabus.chapters.length).toBeGreaterThanOrEqual(5)
    expect(syllabus.chapters[0]?.title).toBe('认识 Toolman')
    expect(syllabus.chapters.every((chapter) => chapter.lessonPlan?.trim())).toBe(true)
    expect(
      syllabus.chapters.every((chapter) => chapter.assessmentQuestions.length > 0),
    ).toBe(true)
  })

  it('uses a stable course title and a product-tutor prompt', () => {
    expect(ASSISTANT_LIB_GUIDE_COURSE_TITLE).toBe('Toolman使用说明')
    const prompt = buildAssistantLibGuideCourseSystemPrompt()
    expect(prompt).toContain('Toolman')
    expect(prompt).toContain('教学大纲')
    expect(buildAssistantLibGuideCourseSyllabus().chapters[2]?.lessonPlan).toContain('程序内置课程')
    expect(buildAssistantLibGuideCourseSyllabus().chapters[2]?.lessonPlan).toContain(
      '可在课程设置里删除',
    )
    expect(buildAssistantLibGuideCourseSyllabus().chapters[2]?.lessonPlan).not.toContain('默认课程')
  })

  it('refreshes bundled lesson text while keeping chapter progress', () => {
    const merged = mergeAssistantLibGuideCourseSyllabus({
      generation: 'ready',
      generatedCount: 1,
      chapters: [
        {
          id: 'toolman-guide-overview',
          title: '旧标题',
          hours: 0.5,
          lessonPlan: '过时文案',
          assessmentQuestions: ['旧题'],
          status: 'in_progress',
        },
      ],
    })
    expect(merged.chapters[0]?.title).toBe('认识 Toolman')
    expect(merged.chapters[0]?.status).toBe('in_progress')
    expect(merged.chapters[0]?.lessonPlan).toContain('本地优先')
    expect(assistantLibGuideCourseContentStale(merged)).toBe(false)
    expect(
      assistantLibGuideCourseContentStale({
        generation: 'ready',
        generatedCount: 1,
        chapters: [
          {
            id: 'toolman-guide-overview',
            title: '认识 Toolman',
            lessonPlan: '过时',
            assessmentQuestions: [],
            status: 'ready',
          },
        ],
      }),
    ).toBe(true)
  })
})
