import { describe, expect, it } from 'vitest'
import {
  applySyllabusLearningProgress,
  currentSyllabusChapterIndex,
  formatSyllabusMarkdown,
  isSyllabusChapterLocked,
  seedSyllabusFromCatalog,
} from './syllabus'
import { EMPTY_SOCRATIC_STATE, type CourseSyllabus } from './teaching-types'

function sampleSyllabus(): CourseSyllabus {
  return {
    generation: 'ready',
    generatedCount: 2,
    totalHours: 4,
    chapters: [
      {
        id: 'c1',
        title: '第一章',
        hours: 2,
        lessonPlan: '讲冲突',
        assessmentQuestions: ['冲突从哪来？'],
        status: 'in_progress',
      },
      {
        id: 'c2',
        title: '第二章',
        hours: 2,
        lessonPlan: '讲人物',
        assessmentQuestions: ['人物欲望是什么？'],
        status: 'ready',
      },
    ],
  }
}

describe('seedSyllabusFromCatalog', () => {
  it('marks the first chapter generating', () => {
    const syllabus = seedSyllabusFromCatalog([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ])
    expect(syllabus.generation).toBe('generating')
    expect(syllabus.chapters[0]?.status).toBe('generating')
    expect(syllabus.chapters[1]?.status).toBe('pending')
  })
})

describe('applySyllabusLearningProgress', () => {
  it('does not skip ahead until the current chapter is passed', () => {
    const { syllabus, state, advanced } = applySyllabusLearningProgress(sampleSyllabus(), {
      ...EMPTY_SOCRATIC_STATE,
      pathIndex: 1,
      chapterPassed: false,
    })
    expect(advanced).toBe(false)
    expect(currentSyllabusChapterIndex(syllabus)).toBe(0)
    expect(state.pathIndex).toBe(0)
    expect(isSyllabusChapterLocked(syllabus, 'c2')).toBe(true)
  })

  it('unlocks the next chapter after assessment pass', () => {
    const { syllabus, state, advanced } = applySyllabusLearningProgress(sampleSyllabus(), {
      ...EMPTY_SOCRATIC_STATE,
      chapterPassed: true,
    })
    expect(advanced).toBe(true)
    expect(syllabus.chapters[0]?.status).toBe('passed')
    expect(syllabus.chapters[1]?.status).toBe('in_progress')
    expect(state.pathIndex).toBe(1)
    expect(state.chapterPassed).toBe(false)
    expect(isSyllabusChapterLocked(syllabus, 'c2')).toBe(false)
  })
})

describe('formatSyllabusMarkdown', () => {
  it('includes hours, lesson plan, and assessment questions', () => {
    const markdown = formatSyllabusMarkdown(sampleSyllabus())
    expect(markdown).toContain('总课时：4')
    expect(markdown).toContain('第一章')
    expect(markdown).toContain('讲冲突')
    expect(markdown).toContain('冲突从哪来？')
  })
})
