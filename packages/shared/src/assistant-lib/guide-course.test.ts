import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_LIB_GUIDE_COURSE_TITLE,
  buildAssistantLibGuideCourseSyllabus,
  buildAssistantLibGuideCourseSystemPrompt,
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
  })
})
