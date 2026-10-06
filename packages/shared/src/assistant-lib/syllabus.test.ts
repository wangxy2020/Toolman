import { describe, expect, it } from 'vitest'
import {
  applySyllabusLearningProgress,
  applySyllabusTitlesFromMarkdown,
  currentSyllabusChapterIndex,
  classroomChapterTitle,
  formatClassroomChapterLabel,
  formatSyllabusMarkdown,
  stripSyllabusHeadingBullets,
  isSyllabusChapterLocked,
  seedSyllabusFromCatalog,
  syllabusMenuGroupTitles,
  teachableSyllabusEntries,
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

describe('teachableSyllabusEntries', () => {
  it('drops 绪言 and keeps a 章 as a heading when it has 节', () => {
    const lessons = teachableSyllabusEntries([
      { id: 'preface', title: '绪言 化学科学与实验探究' },
      { id: 'ch1', title: '第一章 物质及其变化' },
      { id: 's1', title: '第一节 物质的分类及转化' },
      { id: 's2', title: '第二节 离子反应' },
      { id: 's3', title: '第三节 氧化还原反应' },
      { id: 'review', title: '整理与提升' },
      { id: 'ch2', title: '第二章 海水中的重要元素' },
    ])
    expect(lessons.map((lesson) => lesson.title)).toEqual([
      '第一节 物质的分类及转化',
      '第二节 离子反应',
      '第三节 氧化还原反应',
      '整理与提升',
      '第二章 海水中的重要元素',
    ])
    expect(lessons[0]?.groupTitle).toBe('第一章 物质及其变化')
    expect(lessons[3]?.groupTitle).toBe('第一章 物质及其变化')
    expect(lessons[4]?.groupTitle).toBeUndefined()
  })

  it('ends a 章 at 实验活动 and leaves 附录 outside that chapter', () => {
    const lessons = teachableSyllabusEntries([
      { id: 'ch4', title: '第四章 物质结构 元素周期律' },
      { id: 's1', title: '第一节 原子结构' },
      { id: 'lab', title: '实验活动3 同周期、同主族元素性质的递变' },
      { id: 'a1', title: '附录I 相对原子质量' },
      { id: 'a2', title: '附录 II 常见物质' },
      { id: 'note', title: '后记' },
    ])
    expect(lessons.map((lesson) => lesson.groupTitle ?? '')).toEqual([
      '第四章 物质结构 元素周期律',
      '第四章 物质结构 元素周期律',
      '',
      '',
      '',
    ])
    expect(lessons.map((lesson) => lesson.title)).toEqual([
      '第一节 原子结构',
      '实验活动3 同周期、同主族元素性质的递变',
      '附录I 相对原子质量',
      '附录 II 常见物质',
      '后记',
    ])
    expect(
      syllabusMenuGroupTitles([
        { title: '第一节 原子结构', groupTitle: '第四章 物质结构 元素周期律' },
        { title: '实验活动3 同周期、同主族元素性质的递变', groupTitle: '第四章 物质结构 元素周期律' },
        { title: '附录I 相对原子质量', groupTitle: '第四章 物质结构 元素周期律' },
        { title: '元素周期表', groupTitle: '第四章 物质结构 元素周期律' },
      ]),
    ).toEqual(['第四章 物质结构 元素周期律', '第四章 物质结构 元素周期律', undefined, undefined])
  })
})

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
  it('prints a 章 as a heading and gives hours only to its 节', () => {
    const syllabus = seedSyllabusFromCatalog([
      { id: 'ch1', title: '第一章 物质及其变化' },
      { id: 's1', title: '第一节 物质的分类及转化' },
      { id: 's2', title: '第二节 离子反应' },
    ])
    syllabus.chapters = syllabus.chapters.map((chapter) => ({
      ...chapter,
      hours: 2,
      status: 'ready' as const,
    }))
    const markdown = formatSyllabusMarkdown(syllabus)
    expect(markdown).toContain('## 第一章 物质及其变化')
    expect(markdown).not.toContain('## 第一章 物质及其变化（')
    expect(markdown).toContain('## 1. 第一节 物质的分类及转化（2 课时） · 待学习')
    expect(markdown).toContain('## 2. 第二节 离子反应（2 课时） · 待学习')
  })

  it('drops the filled bullet from chapter headings', () => {
    const syllabus = sampleSyllabus()
    syllabus.chapters[0] = {
      ...syllabus.chapters[0]!,
      title: '- ● 检验食品中的铁元素',
    }
    const markdown = formatSyllabusMarkdown(syllabus)
    expect(markdown).toContain('## 1. 检验食品中的铁元素（2 课时） · 学习中')
    expect(markdown).not.toContain('●')
    expect(
      stripSyllabusHeadingBullets(
        '## 2. - ● 第一章 物质及其变化（2 课时） · 待学习\n\n- ● 认识物质分类\n● 离子反应',
      ),
    ).toBe('## 2. 第一章 物质及其变化（2 课时） · 待学习\n\n- 认识物质分类\n离子反应')
  })

  it('includes hours, lesson plan, and assessment questions', () => {
    const markdown = formatSyllabusMarkdown(sampleSyllabus())
    expect(markdown).toContain('总课时：4')
    expect(markdown).toContain('第一章')
    expect(markdown).toContain('讲冲突')
    expect(markdown).toContain('冲突从哪来？')
  })
})

describe('classroomChapterTitle', () => {
  it('drops the filled bullet and leaves the numbered list to supply the marker', () => {
    expect(classroomChapterTitle('- ● 检验食品中的铁元素')).toBe('检验食品中的铁元素')
    expect(classroomChapterTitle('绪言')).toBe('绪言')
  })
})

describe('formatClassroomChapterLabel', () => {
  it('drops the filled bullet and keeps a single hyphen', () => {
    expect(formatClassroomChapterLabel('- ● 检验食品中的铁元素')).toBe('- 检验食品中的铁元素')
    expect(formatClassroomChapterLabel('品中的铁元素')).toBe('- 品中的铁元素')
    expect(formatClassroomChapterLabel('绪言')).toBe('- 绪言')
  })
})

describe('applySyllabusTitlesFromMarkdown', () => {
  it('renames a chapter from its heading and keeps the other chapters', () => {
    const syllabus = sampleSyllabus()
    const markdown = formatSyllabusMarkdown(syllabus).replace('第二章', '人物篇')
    const next = applySyllabusTitlesFromMarkdown(syllabus, markdown)
    expect(next.chapters).toHaveLength(2)
    expect(next.chapters[0]?.title).toBe('第一章')
    expect(next.chapters[1]?.title).toBe('人物篇')
  })

  it('drops a chapter whose heading was deleted and keeps the rest', () => {
    const syllabus = sampleSyllabus()
    syllabus.chapters.push({
      id: 'c3',
      title: '科技考古研究人员',
      hours: 2,
      lessonPlan: '重复章节',
      assessmentQuestions: [],
      status: 'ready',
    })
    const markdown = formatSyllabusMarkdown(syllabus).replace(
      /\n## 3\. 科技考古研究人员[\s\S]*$/,
      '',
    )
    const next = applySyllabusTitlesFromMarkdown(syllabus, markdown)
    expect(next.chapters.map((chapter) => chapter.id)).toEqual(['c1', 'c2'])
  })

  it('keeps every chapter when the markdown has no numbered headings', () => {
    const syllabus = sampleSyllabus()
    const next = applySyllabusTitlesFromMarkdown(syllabus, '正在编辑，还没有章节标题')
    expect(next.chapters).toHaveLength(2)
  })
})
